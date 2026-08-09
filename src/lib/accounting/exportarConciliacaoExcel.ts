/**
 * Gera a planilha .xlsx do relatório "Contas divergentes" pra auditoria.
 *
 * Uso previsto: Higor envia a planilha ao contador responsável, que preenche
 * duas colunas — Status e Observação — devolvendo com a justificativa/ação de
 * cada divergência.
 *
 * Layout: ESPELHA A TELA — hierarquia por SINTÉTICA da ECD (plano referencial).
 *   - Linha da sintética em destaque (verde se fecha, vermelho se diverge)
 *     mostrando o grupo do BP, código e descrição sintética + totais Dom/ECD/Δ.
 *   - Linhas das analíticas indentadas debaixo (símbolo ✗/◐/◑ e cor no fundo).
 *   - Bloco final: analíticas Domínio sem correspondência na ECD.
 *
 * IMPORTANTE: não colocamos colunas separadas "Grupo" ou "Situação" — elas
 * ficam implícitas no destaque da sintética e no símbolo/cor das analíticas.
 * Isso deixa o filtro nativo do Excel funcionando naturalmente sobre as
 * colunas de valor/código.
 */

import ExcelJS from "exceljs";
import type {
  RelatorioSinteticasConciliacao,
  LinhaContaConciliacao,
  BlocoSintetica,
} from "./conciliacaoEcd";

const FMT_MONEY = '#,##0.00;[Red](#,##0.00);-';
const OPCOES_STATUS = ["Pendente", "Corrigido", "Retificar SPED"];

const ROTULO_GRUPO: Record<BlocoSintetica["grupo"], string> = {
  "ativo-circulante": "Ativo Circulante",
  "ativo-nao-circulante": "Ativo Não Circulante",
  "passivo-circulante": "Passivo Circulante",
  "passivo-nao-circulante": "Passivo Não Circulante",
  "patrimonio-liquido": "Patrimônio Líquido",
  "nao-classificada": "Não classificada",
};

const SIMBOLO_STATUS: Record<LinhaContaConciliacao["status"], string> = {
  divergente: "✗",
  "so-dominio": "◐",
  "so-ecd": "◑",
  identica: "✓",
};

export interface OpcoesExportacao {
  razaoSocial: string;
  cnpj: string;
  ano: number;
  filtro: "divergentes" | "todas";
}

// Colunas (1-indexed):
//   A Descrição · B Cód. Dom · C Valor Dom · D Cód. ECD · E Valor ECD
//   F Diferença · G Status · H Observação
const N_COLS = 8;
const COL_STATUS = "G";

export async function gerarExcelConciliacao(
  relatorio: RelatorioSinteticasConciliacao,
  opcoes: OpcoesExportacao,
): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Plataforma Contábil — March";
  wb.created = new Date();

  const ws = wb.addWorksheet("Divergências", {
    views: [{ state: "frozen", ySplit: 6 }],
  });

  // ---- Cabeçalho institucional ----
  ws.mergeCells("A1:H1");
  ws.getCell("A1").value = `Conciliação Domínio × ECD — ${opcoes.razaoSocial}`;
  ws.getCell("A1").font = { bold: true, size: 14 };
  ws.mergeCells("A2:H2");
  ws.getCell("A2").value = `CNPJ ${opcoes.cnpj} · Exercício ${opcoes.ano}`;
  ws.getCell("A2").font = { size: 10, color: { argb: "FF64748B" } };

  ws.mergeCells("A3:H3");
  ws.getCell("A3").value =
    "Agrupado pela SINTÉTICA da ECD (plano referencial). Ajuste sempre na ORIGEM (Domínio); depois reexporte/retifique o SPED. Status: Pendente | Corrigido | Retificar SPED.";
  ws.getCell("A3").font = { size: 9, italic: true, color: { argb: "FF64748B" } };

  ws.mergeCells("A4:H4");
  ws.getCell("A4").value =
    `Sintéticas divergentes: ${relatorio.contagem.sinteticasDivergentes} · Sintéticas fechadas: ${relatorio.contagem.sinteticasFechadas} · Analíticas: ${relatorio.contagem.analiticas}`;
  ws.getCell("A4").font = { size: 9, color: { argb: "FF64748B" } };

  // Linha 6 = cabeçalho da tabela
  const cabecalho = [
    "Descrição",
    "Cód. Domínio",
    "Valor Domínio",
    "Cód. ECD",
    "Valor ECD",
    "Diferença",
    "Status",
    "Observação",
  ];
  const rowCabecalho = ws.getRow(6);
  cabecalho.forEach((valor, i) => {
    const cell = rowCabecalho.getCell(i + 1);
    cell.value = valor;
    cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF17130D" } };
    cell.alignment = { vertical: "middle", horizontal: "left" };
    cell.border = { bottom: { style: "medium" } };
  });

  // ---- Corpo hierárquico ----
  let linhaAtual = 7;
  const linhasComStatus: number[] = [];

  const blocosVisiveis =
    opcoes.filtro === "divergentes"
      ? relatorio.blocos.filter((b) => !b.fecha)
      : relatorio.blocos;

  for (const bloco of blocosVisiveis) {
    // --- Linha da SINTÉTICA (verde se fecha; vermelho se diverge) ---
    const rowSint = ws.getRow(linhaAtual);
    const simboloSint = bloco.fecha ? "✓" : "✗";
    rowSint.getCell(1).value =
      `${simboloSint}  [${ROTULO_GRUPO[bloco.grupo]}]  ${bloco.codigoSinteticoEcd} · ${bloco.descricaoSintetica}`;
    rowSint.getCell(2).value = ""; // sintética não tem código Domínio único
    rowSint.getCell(3).value = bloco.totalDominio;
    rowSint.getCell(4).value = bloco.codigoSinteticoEcd;
    rowSint.getCell(5).value = bloco.totalEcd;
    rowSint.getCell(6).value = bloco.diferenca;
    rowSint.getCell(7).value = "";
    rowSint.getCell(8).value = "";

    const fillSint = bloco.fecha ? "FFD1FAE5" : "FFFECACA"; // emerald-100 / red-200
    const corTextoSint = bloco.fecha ? "FF065F46" : "FF991B1B"; // emerald-800 / red-800
    for (let c = 1; c <= N_COLS; c++) {
      rowSint.getCell(c).fill = { type: "pattern", pattern: "solid", fgColor: { argb: fillSint } };
      rowSint.getCell(c).font = { bold: true, color: { argb: corTextoSint } };
    }
    rowSint.getCell(3).numFmt = FMT_MONEY;
    rowSint.getCell(5).numFmt = FMT_MONEY;
    rowSint.getCell(6).numFmt = FMT_MONEY;
    linhaAtual++;

    // --- Analíticas (só quando sintética diverge OU filtro=todas) ---
    const mostrarAnaliticas = !bloco.fecha || opcoes.filtro === "todas";
    if (!mostrarAnaliticas) continue;

    const analiticasFiltradas =
      opcoes.filtro === "divergentes"
        ? bloco.analiticas.filter((l) => l.status !== "identica")
        : bloco.analiticas;

    for (const l of analiticasFiltradas) {
      const row = ws.getRow(linhaAtual);
      // Descrição indentada + símbolo do status embutido (não precisa coluna extra).
      row.getCell(1).value = `      ${SIMBOLO_STATUS[l.status]}  ${l.descricao}`;
      row.getCell(2).value = l.codigoDominio ?? "";
      row.getCell(3).value = l.valorDominio;
      row.getCell(4).value = l.codigoEcd ?? "";
      row.getCell(5).value = l.valorEcd;
      row.getCell(6).value = l.diferenca;
      row.getCell(7).value = "Pendente";
      row.getCell(8).value = "";

      row.getCell(3).numFmt = FMT_MONEY;
      row.getCell(5).numFmt = FMT_MONEY;
      row.getCell(6).numFmt = FMT_MONEY;

      const fill = corDoStatus(l.status);
      if (fill) {
        for (let c = 1; c <= N_COLS; c++) {
          row.getCell(c).fill = { type: "pattern", pattern: "solid", fgColor: { argb: fill } };
        }
      }
      if (l.status === "divergente") {
        row.getCell(6).font = { bold: true, color: { argb: "FFB91C1C" } };
      }
      linhasComStatus.push(linhaAtual);
      linhaAtual++;
    }
  }

  // --- Analíticas Domínio sem sintética identificada ---
  if (relatorio.soDominioSemSintetica.length > 0) {
    linhaAtual++;
    ws.mergeCells(`A${linhaAtual}:H${linhaAtual}`);
    const rowTitulo = ws.getRow(linhaAtual);
    rowTitulo.getCell(1).value =
      "⚠ Analíticas Domínio sem sintética referencial identificada (não amarradas ao plano da ECD)";
    rowTitulo.getCell(1).font = { bold: true, size: 11, color: { argb: "FFB45309" } };
    rowTitulo.getCell(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFEF3C7" } };
    linhaAtual++;

    for (const grupo of relatorio.soDominioSemSintetica) {
      for (const l of grupo.linhas) {
        const row = ws.getRow(linhaAtual);
        row.getCell(1).value = `      ◐  [${grupo.rotulo}]  ${l.descricao}`;
        row.getCell(2).value = l.codigoDominio ?? "";
        row.getCell(3).value = l.valorDominio;
        row.getCell(4).value = "";
        row.getCell(5).value = null;
        row.getCell(6).value = null;
        row.getCell(7).value = "Pendente";
        row.getCell(8).value = "";
        row.getCell(3).numFmt = FMT_MONEY;
        for (let c = 1; c <= N_COLS; c++) {
          row.getCell(c).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFEF3C7" } };
        }
        linhasComStatus.push(linhaAtual);
        linhaAtual++;
      }
    }
  }

  // ---- Validação de dados na coluna Status — dropdown ----
  for (const r of linhasComStatus) {
    const cell = ws.getCell(`${COL_STATUS}${r}`);
    cell.dataValidation = {
      type: "list",
      allowBlank: false,
      formulae: [`"${OPCOES_STATUS.join(",")}"`],
      showErrorMessage: true,
      errorTitle: "Valor inválido",
      error: "Use uma das opções: Pendente, Corrigido ou Retificar SPED.",
    };
  }

  // ---- Auto filter ----
  const ultimaLinha = linhaAtual - 1;
  if (ultimaLinha >= 7) {
    ws.autoFilter = { from: { row: 6, column: 1 }, to: { row: ultimaLinha, column: N_COLS } };
  }

  // ---- Larguras ----
  const larguras = [70, 18, 16, 12, 16, 16, 18, 40];
  larguras.forEach((w, i) => {
    ws.getColumn(i + 1).width = w;
  });

  const arrayBuffer = await wb.xlsx.writeBuffer();
  return Buffer.from(arrayBuffer);
}

function corDoStatus(s: LinhaContaConciliacao["status"]): string | null {
  switch (s) {
    case "divergente":
      return "FFFEE2E2"; // vermelho claro
    case "so-dominio":
    case "so-ecd":
      return "FFFEF3C7"; // âmbar claro
    default:
      return null;
  }
}
