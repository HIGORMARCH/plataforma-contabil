"use server";

import path from "node:path";
import { existsSync } from "node:fs";
import { writeFile, mkdir } from "node:fs/promises";
import { revalidatePath } from "next/cache";
import ExcelJS from "exceljs";
import { requireSessao, PAPEIS_INTERNOS } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { caminhoArquivo, type ClienteRef } from "@/lib/storage/filesystem";
import { ecdInfo, parseSaldosDeArquivo } from "@/lib/ecd/balancete";
import {
  compararBalancetes,
  ORDEM_GRUPO,
  TOL,
  type LinhaBalanceteComparado,
} from "@/lib/accounting/balanceteComparado";

/**
 * Upload manual de um SPED-ECD (Domínio local ou ECD transmitida).
 * Grava no path padronizado da pasta única:
 *   C:\PlataformaContabil\<CLIENTE>_<CNPJ>\SPED-ECD[-DOMINIO]\<ANO>\<ANO>.txt
 *
 * O ano é detectado do registro 0000. Se o SPED for de CNPJ diferente do
 * cliente, recusa (segurança contra troca de arquivo).
 */
export async function uploadSpedEcdAction(
  fd: FormData,
): Promise<
  | { ok: true; mensagem: string; ano: number; lado: "DOMINIO" | "TRANSMITIDA"; caminho: string }
  | { ok: false; erro: string }
> {
  try {
    const sessao = await requireSessao();
    if (!PAPEIS_INTERNOS.includes(sessao.papel))
      return { ok: false, erro: "Não autorizado" };

    const clienteId = String(fd.get("clienteId") ?? "");
    const lado = String(fd.get("lado") ?? "");
    const file = fd.get("file") as File | null;

    if (!clienteId) return { ok: false, erro: "Falta clienteId." };
    if (lado !== "DOMINIO" && lado !== "TRANSMITIDA")
      return { ok: false, erro: "lado deve ser DOMINIO ou TRANSMITIDA." };
    if (!file || file.size === 0)
      return { ok: false, erro: "Arquivo vazio ou ausente." };
    if (file.size > 500 * 1024 * 1024)
      return { ok: false, erro: "Arquivo > 500MB — recuso por segurança." };

    const cliente = await prisma.cliente.findFirst({
      where: { id: clienteId, escritorioId: sessao.escritorioId },
      select: { razaoSocial: true, cnpj: true },
    });
    if (!cliente) return { ok: false, erro: "Cliente não encontrado." };

    const bytes = Buffer.from(await file.arrayBuffer());
    // SPED é Latin1. Só uso as primeiras KB pra ler o 0000.
    const primeirasLinhas = bytes.subarray(0, 4096).toString("latin1").split(/\r?\n/);
    const info = ecdInfo(primeirasLinhas);
    if (!info.cnpj || !info.dtFim) {
      return {
        ok: false,
        erro: "Arquivo não parece ser um SPED-ECD válido (registro 0000 ausente).",
      };
    }

    // Valida CNPJ (segurança contra upload trocado)
    const cnpjCliente = cliente.cnpj.replace(/\D/g, "");
    const cnpjArquivo = info.cnpj.replace(/\D/g, "");
    if (cnpjCliente && cnpjArquivo && cnpjCliente !== cnpjArquivo) {
      return {
        ok: false,
        erro: `CNPJ do arquivo (${cnpjArquivo}) diverge do cliente (${cnpjCliente}). Recusado.`,
      };
    }

    const ano = Number(info.dtFim.slice(4, 8));
    if (!ano || ano < 2000 || ano > 2100) {
      return { ok: false, erro: `Ano inválido detectado: ${info.dtFim}` };
    }

    const clienteRef: ClienteRef = {
      razaoSocial: cliente.razaoSocial,
      cnpj: cliente.cnpj,
    };
    const tipo = lado === "DOMINIO" ? "SPED-ECD-DOMINIO" : "SPED-ECD";
    const destino = caminhoArquivo(clienteRef, tipo, ano, null, "txt");

    // Sobrescreve se já existir (upload manual = reimportação intencional).
    // Diferente do salvar() padrão que pula quando existe.
    await mkdir(path.dirname(destino), { recursive: true });
    await writeFile(destino, bytes);

    // Invalida cache de TODAS as telas que consomem esse SPED — quando o
    // arquivo é substituído (upload novo do mesmo ano), o Next precisa
    // refazer o parse. `layout` propaga pra descendentes.
    revalidatePath(`/painel/clientes/${clienteId}/balancete-comparado`, "layout");
    revalidatePath(`/painel/clientes/${clienteId}/balanco-comparado`, "layout");
    revalidatePath(`/painel/clientes/${clienteId}/razao-contrapartida`, "layout");
    revalidatePath(`/painel/clientes/${clienteId}/conciliacao-ecd`, "layout");
    // Índices no sidebar podem ter contadores/situação — revalida
    revalidatePath(`/painel/balancete`, "layout");
    revalidatePath(`/painel/balanco`, "layout");
    revalidatePath(`/painel/razao-contrapartida`, "layout");
    return {
      ok: true,
      mensagem: `SPED-ECD ${lado} ${ano} salvo.`,
      ano,
      lado,
      caminho: destino,
    };
  } catch (e) {
    return { ok: false, erro: (e as Error).message };
  }
}

/**
 * Varre uma pasta LOCAL e detecta arquivos SPED-ECD dentro dela, copiando
 * pro path padronizado do cliente/lado. Só válido em ambiente self-hosted
 * (a "pasta" é lida do disco do servidor — que é o mesmo PC do usuário).
 *
 * Detecta por conteúdo: só considera arquivo cujo registro 0000 tem CNPJ
 * batendo com o do cliente. Valida também tipo I010. Se achar múltiplos
 * arquivos válidos, importa TODOS (um por ano).
 */
export async function varrerPastaEcdAction(
  fd: FormData,
): Promise<
  | { ok: true; importados: Array<{ ano: number; caminho: string; tipo: string | null }>; ignorados: number }
  | { ok: false; erro: string }
> {
  try {
    const sessao = await requireSessao();
    if (!PAPEIS_INTERNOS.includes(sessao.papel))
      return { ok: false, erro: "Não autorizado" };

    const clienteId = String(fd.get("clienteId") ?? "");
    const lado = String(fd.get("lado") ?? "");
    const pasta = String(fd.get("pasta") ?? "").trim();
    if (!clienteId) return { ok: false, erro: "Falta clienteId." };
    if (lado !== "DOMINIO" && lado !== "TRANSMITIDA")
      return { ok: false, erro: "lado inválido." };
    if (!pasta) return { ok: false, erro: "Informe o caminho da pasta." };

    const cliente = await prisma.cliente.findFirst({
      where: { id: clienteId, escritorioId: sessao.escritorioId },
      select: { razaoSocial: true, cnpj: true },
    });
    if (!cliente) return { ok: false, erro: "Cliente não encontrado." };

    const cnpjCliente = cliente.cnpj.replace(/\D/g, "");
    const clienteRef: ClienteRef = {
      razaoSocial: cliente.razaoSocial,
      cnpj: cliente.cnpj,
    };
    const tipoDoc = lado === "DOMINIO" ? "SPED-ECD-DOMINIO" : "SPED-ECD";

    const { readdirSync, statSync, readFileSync } = await import("node:fs");
    let entradas: string[] = [];
    try {
      entradas = readdirSync(pasta);
    } catch (e) {
      return { ok: false, erro: `Pasta não encontrada ou sem acesso: ${pasta}` };
    }

    const importados: Array<{ ano: number; caminho: string; tipo: string | null }> = [];
    let ignorados = 0;

    for (const nome of entradas) {
      const caminhoOrigem = path.join(pasta, nome);
      let st;
      try {
        st = statSync(caminhoOrigem);
      } catch {
        continue;
      }
      if (!st.isFile()) continue;
      if (!/\.(txt|ecd|sped)$/i.test(nome)) continue;

      // Lê só o começo pra descobrir 0000 + I010 sem carregar arquivo enorme
      let sample: Buffer;
      try {
        sample = readFileSync(caminhoOrigem);
      } catch {
        continue;
      }
      const primeiras = sample.subarray(0, 4096).toString("latin1").split(/\r?\n/);
      const info = ecdInfo(primeiras);
      if (!info.cnpj || !info.dtFim) {
        ignorados++;
        continue;
      }
      const cnpjArq = info.cnpj.replace(/\D/g, "");
      if (cnpjCliente && cnpjArq && cnpjCliente !== cnpjArq) {
        ignorados++;
        continue;
      }
      const ano = Number(info.dtFim.slice(4, 8));
      if (!ano || ano < 2000 || ano > 2100) {
        ignorados++;
        continue;
      }

      const destino = caminhoArquivo(clienteRef, tipoDoc, ano, null, "txt");
      await mkdir(path.dirname(destino), { recursive: true });
      await writeFile(destino, sample);
      importados.push({ ano, caminho: destino, tipo: info.tipoEscrituracao });
    }

    if (importados.length === 0) {
      return {
        ok: false,
        erro: `Nenhum SPED-ECD válido encontrado em ${pasta}. Ignorados: ${ignorados}.`,
      };
    }

    revalidatePath(`/painel/clientes/${clienteId}/balancete-comparado`, "layout");
    revalidatePath(`/painel/clientes/${clienteId}/balanco-comparado`, "layout");
    revalidatePath(`/painel/clientes/${clienteId}/razao-contrapartida`, "layout");
    return { ok: true, importados, ignorados };
  } catch (e) {
    return { ok: false, erro: (e as Error).message };
  }
}

/**
 * Exporta o Balancete Comparado do exercício em XLSX. Devolve o binário
 * em base64 pro cliente disparar download (evita gravar em disco). Estilo
 * do arquivo espelha o do agente contábil (fundo rosa nas células
 * divergentes, dif SF em vermelho negrito, congelar cabeçalho).
 */
export async function exportarXlsxAction(
  fd: FormData,
): Promise<
  | { ok: true; base64: string; nomeArquivo: string }
  | { ok: false; erro: string }
> {
  try {
    const sessao = await requireSessao();
    if (!PAPEIS_INTERNOS.includes(sessao.papel))
      return { ok: false, erro: "Não autorizado" };

    const clienteId = String(fd.get("clienteId") ?? "");
    const ano = Number(fd.get("ano") ?? 0);
    const incluirTodas = String(fd.get("incluir") ?? "") === "todas";
    if (!clienteId || !ano) return { ok: false, erro: "Faltam parâmetros." };

    const cliente = await prisma.cliente.findFirst({
      where: { id: clienteId, escritorioId: sessao.escritorioId },
      select: { razaoSocial: true, cnpj: true },
    });
    if (!cliente) return { ok: false, erro: "Cliente não encontrado." };

    const clienteRef: ClienteRef = {
      razaoSocial: cliente.razaoSocial,
      cnpj: cliente.cnpj,
    };
    const arqDom = caminhoArquivo(clienteRef, "SPED-ECD-DOMINIO", ano, null, "txt");
    const arqEcd = caminhoArquivo(clienteRef, "SPED-ECD", ano, null, "txt");
    if (!existsSync(arqDom) || !existsSync(arqEcd)) {
      return {
        ok: false,
        erro: `Faltam SPEDs pra ${ano}: ${
          !existsSync(arqDom) ? "Domínio" : ""
        }${!existsSync(arqDom) && !existsSync(arqEcd) ? " e " : ""}${
          !existsSync(arqEcd) ? "Transmitida" : ""
        }.`,
      };
    }

    const dom = parseSaldosDeArquivo(arqDom);
    const ecd = parseSaldosDeArquivo(arqEcd);
    const linhas = compararBalancetes(dom.saldos, ecd.saldos, {
      incluirConformes: incluirTodas,
    });

    const bin = await construirXlsx({
      cliente: cliente.razaoSocial,
      cnpj: cliente.cnpj,
      ano,
      linhas,
      incluirTodas,
    });
    const base64 = Buffer.from(bin).toString("base64");
    const nomeArquivo = `Balancete_Comparado_${slug(cliente.razaoSocial)}_${ano}.xlsx`;
    return { ok: true, base64, nomeArquivo };
  } catch (e) {
    return { ok: false, erro: (e as Error).message };
  }
}

// ---------------------------------------------------------------------------
// Geração do XLSX — estilo March: cabeçalho oliva, sub-cabeçalho creme,
// células divergentes em rosa, dif SF em vermelho negrito, congelar painéis
// e agrupamento por Ativo → Passivo → Patrimônio Líquido com linha-título.
// ---------------------------------------------------------------------------
async function construirXlsx(params: {
  cliente: string;
  cnpj: string;
  ano: number;
  linhas: LinhaBalanceteComparado[];
  incluirTodas: boolean;
}): Promise<Uint8Array> {
  const { cliente, cnpj, ano, linhas, incluirTodas } = params;
  const wb = new ExcelJS.Workbook();
  wb.creator = "Plataforma Contábil March";
  wb.created = new Date();

  const ws = wb.addWorksheet("Balancete Comparado", {
    views: [{ state: "frozen", xSplit: 2, ySplit: 5 }],
    pageSetup: { orientation: "landscape", fitToPage: true, fitToWidth: 1 },
  });

  const NUM_FMT = '#,##0.00;-#,##0.00;"—"';
  const HDR_FILL = "FF2F2E26"; // brand-deep
  const SUB_FILL = "FFF4EFE4"; // brand-2-soft
  const SECTION_FILL = "FF4D4B40"; // brand
  const DIFF_FILL = "FFF5E3E1"; // danger-soft
  const RED = "FFA2201D"; // danger

  // Título e meta
  ws.mergeCells("A1:L1");
  ws.getCell("A1").value = `Balancete Comparado — Domínio × Transmitida · Exercício ${ano}`;
  ws.getCell("A1").font = { name: "Arial", bold: true, size: 13, color: { argb: "FF2F2E26" } };
  ws.getCell("A1").alignment = { horizontal: "left", vertical: "middle" };
  ws.getRow(1).height = 22;

  ws.mergeCells("A2:L2");
  ws.getCell("A2").value = `${cliente}  ·  CNPJ ${cnpj}  ·  ${
    incluirTodas ? "Todas as contas patrimoniais" : "Somente contas divergentes"
  }  ·  Convenção: devedor + / credor −`;
  ws.getCell("A2").font = { name: "Arial", size: 9, italic: true, color: { argb: "FF6B675A" } };
  ws.getRow(2).height = 16;

  // Cabeçalho em 2 níveis (linhas 4 e 5)
  const hdrRow1 = ws.getRow(4);
  const hdrRow2 = ws.getRow(5);
  ws.mergeCells("A4:A5"); hdrRow1.getCell(1).value = "Código";
  ws.mergeCells("B4:B5"); hdrRow1.getCell(2).value = "Conta";
  ws.mergeCells("C4:C5"); hdrRow1.getCell(3).value = "Grupo";
  ws.mergeCells("D4:E4"); hdrRow1.getCell(4).value = "Saldo Inicial";
  ws.mergeCells("F4:G4"); hdrRow1.getCell(6).value = "Débito";
  ws.mergeCells("H4:I4"); hdrRow1.getCell(8).value = "Crédito";
  ws.mergeCells("J4:K4"); hdrRow1.getCell(10).value = "Saldo Final";
  ws.mergeCells("L4:L5"); hdrRow1.getCell(12).value = "Dif. SF";
  const subs = [null, null, null, "Dom", "Trans.", "Dom", "Trans.", "Dom", "Trans.", "Dom", "Trans.", null];
  subs.forEach((v, i) => { if (v) hdrRow2.getCell(i + 1).value = v; });

  for (const rowIdx of [4, 5]) {
    const row = ws.getRow(rowIdx);
    for (let c = 1; c <= 12; c++) {
      const cell = row.getCell(c);
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: HDR_FILL } };
      cell.font = { name: "Arial", bold: true, size: rowIdx === 4 ? 10 : 8, color: { argb: "FFFFFFFF" } };
      cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
      cell.border = { top: { style: "thin", color: { argb: "FFD9D4C7" } }, bottom: { style: "thin", color: { argb: "FFD9D4C7" } } };
    }
    row.height = rowIdx === 4 ? 22 : 16;
  }

  // Agrupamento por grupo, mantém ordem canônica Ativo → Passivo → PL
  const porGrupo = new Map<string, LinhaBalanceteComparado[]>();
  for (const l of linhas) {
    if (!porGrupo.has(l.grupo)) porGrupo.set(l.grupo, []);
    porGrupo.get(l.grupo)!.push(l);
  }
  const grupos = [...porGrupo.keys()].sort(
    (a, b) =>
      (ORDEM_GRUPO[a as keyof typeof ORDEM_GRUPO] ?? 99) -
      (ORDEM_GRUPO[b as keyof typeof ORDEM_GRUPO] ?? 99),
  );

  let r = 6;
  for (const g of grupos) {
    const contas = porGrupo.get(g)!;
    // Faixa de seção
    ws.mergeCells(r, 1, r, 12);
    const sec = ws.getRow(r).getCell(1);
    sec.value = `${g}   ·   ${contas.length} conta(s)${incluirTodas ? "" : " divergente(s)"}`;
    sec.fill = { type: "pattern", pattern: "solid", fgColor: { argb: SECTION_FILL } };
    sec.font = { name: "Arial", bold: true, size: 10, color: { argb: "FFD2BD97" } };
    sec.alignment = { horizontal: "left", vertical: "middle" };
    ws.getRow(r).height = 18;
    r++;

    for (const c of contas) {
      const { dominio: d, ecd: e, diferencas: df } = c;
      const row = ws.getRow(r);
      row.getCell(1).value = c.codigo;
      row.getCell(2).value = c.descricao;
      row.getCell(3).value = c.grupo;
      row.getCell(4).value = d.saldoInicial;
      row.getCell(5).value = e.saldoInicial;
      row.getCell(6).value = d.debito;
      row.getCell(7).value = e.debito;
      row.getCell(8).value = d.credito;
      row.getCell(9).value = e.credito;
      row.getCell(10).value = d.saldoFinal;
      row.getCell(11).value = e.saldoFinal;
      row.getCell(12).value = df.saldoFinal;

      for (let col = 1; col <= 12; col++) {
        const cell = row.getCell(col);
        cell.font = { name: "Arial", size: 9 };
        cell.border = { bottom: { style: "hair", color: { argb: "FFEFECE3" } } };
        if (col === 1) cell.alignment = { horizontal: "left" };
        else if (col === 2) cell.alignment = { horizontal: "left", wrapText: true };
        else if (col === 3)
          cell.alignment = { horizontal: "center" };
        else {
          cell.numFmt = NUM_FMT;
          cell.alignment = { horizontal: "right" };
        }
      }

      // Destacar pares divergentes
      if (Math.abs(df.saldoInicial) > TOL) {
        row.getCell(4).fill = { type: "pattern", pattern: "solid", fgColor: { argb: DIFF_FILL } };
        row.getCell(5).fill = { type: "pattern", pattern: "solid", fgColor: { argb: DIFF_FILL } };
      }
      if (Math.abs(df.debito) > TOL) {
        row.getCell(6).fill = { type: "pattern", pattern: "solid", fgColor: { argb: DIFF_FILL } };
        row.getCell(7).fill = { type: "pattern", pattern: "solid", fgColor: { argb: DIFF_FILL } };
      }
      if (Math.abs(df.credito) > TOL) {
        row.getCell(8).fill = { type: "pattern", pattern: "solid", fgColor: { argb: DIFF_FILL } };
        row.getCell(9).fill = { type: "pattern", pattern: "solid", fgColor: { argb: DIFF_FILL } };
      }
      if (Math.abs(df.saldoFinal) > TOL) {
        row.getCell(10).fill = { type: "pattern", pattern: "solid", fgColor: { argb: DIFF_FILL } };
        row.getCell(11).fill = { type: "pattern", pattern: "solid", fgColor: { argb: DIFF_FILL } };
        row.getCell(12).font = { name: "Arial", size: 9, bold: true, color: { argb: RED } };
      }
      r++;
    }
  }

  // Larguras
  const widths = [8, 42, 14, 15, 15, 15, 15, 15, 15, 15, 15, 15];
  widths.forEach((w, i) => (ws.getColumn(i + 1).width = w));

  // Autofilter (na linha do sub-header)
  ws.autoFilter = { from: { row: 5, column: 1 }, to: { row: Math.max(r - 1, 5), column: 12 } };
  ws.pageSetup.printTitlesRow = "4:5";

  const buf = await wb.xlsx.writeBuffer();
  return new Uint8Array(buf);
}

function slug(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^A-Za-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .toUpperCase();
}
