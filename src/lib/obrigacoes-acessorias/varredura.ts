import { open, readdir, readFile, stat } from "node:fs/promises";
import { join, relative } from "node:path";
import { createHash } from "node:crypto";
import { prisma } from "@/lib/db";
import type { TipoObrigacao } from "./tipos";

/**
 * Varredura de PRESENÇA — cataloga QUAIS arquivos existem na pasta do cliente
 * por tipo/competência. NÃO importa apuração (pra isso as varreduras existentes
 * em src/lib/sped/, src/lib/ecf/, etc. continuam sendo o caminho).
 *
 * O mtime do arquivo é registrado como proxy da data de transmissão à Receita
 * — o Sistema Domínio grava o .txt no momento da transmissão. Ficam catalogados:
 *
 *   ECD              — .txt começando com |0000|LECD|
 *   ECF              — .txt começando com |0000|LECF|
 *   EFD_CONTRIBUICOES — .txt com |0000|<versao>| e |M100|/|M200|/|M400|/|M600|
 *   DCTF_ANTIGA      — .dec começando com "DCTFM"
 *
 * EFD-Fiscal (ICMS) ficou fora da v1 — muitos estados migrando pra usar só o
 * SPED como única obrigação, regras estaduais em transição.
 */

const HEADER_CHUNK_BYTES = 4096; // primeiro registro 0000 raramente ultrapassa isso

type ArquivoDetectado = {
  tipo: TipoObrigacao;
  ano: number;
  mes: number | null; // null = anual
};

/** Parseia DT_INI do 0000 (formato DDMMAAAA) — comum a todos os SPEDs. */
function parseDataSped(campo: string): Date | null {
  if (!campo || campo.length !== 8) return null;
  const dia = Number(campo.slice(0, 2));
  const mes = Number(campo.slice(2, 4));
  const ano = Number(campo.slice(4, 8));
  if (isNaN(dia) || isNaN(mes) || isNaN(ano)) return null;
  return new Date(Date.UTC(ano, mes - 1, dia));
}

/**
 * Identifica o tipo do arquivo a partir do INÍCIO do conteúdo + extensão.
 * Recebe uma amostra (primeiros KB) pra evitar carregar arquivo inteiro na
 * varredura.
 */
function identificarTipoESAmostra(
  extensao: string,
  amostra: string,
): ArquivoDetectado | null {
  // --- DCTF antiga: .dec começando com "DCTFM" ---
  if (extensao === ".dec" && amostra.startsWith("DCTFM")) {
    // Header DCTFM: pos 1-5 "DCTFM", pos 6-9 versão (4 chars), pos 10-11
    // outros; DT_APURACAO_MM em outra posição. Simplifica: extrai período
    // olhando um R10 no meio da amostra (formato AAAAMM já validado no
    // parser existente). Se não achar, retorna null.
    const m = amostra.match(/R10\d{14}(\d{6})/);
    if (!m) return null;
    const aaaamm = m[1];
    const ano = Number(aaaamm.slice(0, 4));
    const mes = Number(aaaamm.slice(4, 6));
    if (isNaN(ano) || isNaN(mes)) return null;
    return { tipo: "DCTF_ANTIGA", ano, mes };
  }

  // --- SPEDs: .txt começando com |0000| ---
  if (extensao !== ".txt") return null;
  if (!amostra.startsWith("|0000|")) return null;

  const primeiraLinha = amostra.split("\n", 1)[0] ?? "";
  const campos = primeiraLinha.split("|");
  // campos[0]="", campos[1]="0000"
  const campo2 = campos[2] ?? "";

  // ECD: |0000|LECD|DT_INI|DT_FIN|...
  if (campo2 === "LECD") {
    const dtIni = parseDataSped(campos[3] ?? "");
    if (!dtIni) return null;
    return { tipo: "ECD", ano: dtIni.getUTCFullYear(), mes: null };
  }

  // ECF: |0000|LECF|DT_INI|DT_FIN|...
  if (campo2 === "LECF") {
    const dtIni = parseDataSped(campos[3] ?? "");
    if (!dtIni) return null;
    return { tipo: "ECF", ano: dtIni.getUTCFullYear(), mes: null };
  }

  // EFD-Contribuições: |0000|<versao>|<tipo>|<ind_sit_esp>|<num_rec_ant>|DT_INI|DT_FIN|...
  // Marcador definitivo: presença de |M200| (PIS consolidado) OU |M600| (COFINS).
  const ehContribuicoes = /\|M200\||\|M600\||\|M400\||\|M100\|/.test(amostra);
  if (ehContribuicoes) {
    const dtIni = parseDataSped(campos[6] ?? "");
    if (!dtIni) return null;
    return {
      tipo: "EFD_CONTRIBUICOES",
      ano: dtIni.getUTCFullYear(),
      mes: dtIni.getUTCMonth() + 1,
    };
  }

  // EFD-Fiscal (ICMS) — fora do escopo v1. Ignora silenciosamente.
  return null;
}

async function listarArquivosRecursivo(raiz: string): Promise<string[]> {
  const encontrados: string[] = [];
  async function descer(dir: string) {
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return; // pasta ilegível — pula
    }
    for (const entry of entries) {
      const nome = entry.name;
      if (nome.startsWith(".")) continue;
      const caminho = join(dir, nome);
      if (entry.isDirectory()) {
        if (nome.toLowerCase() === "tmp") continue;
        await descer(caminho);
      } else if (entry.isFile()) {
        const low = nome.toLowerCase();
        if (low.endsWith(".txt") || low.endsWith(".dec")) {
          encontrados.push(caminho);
        }
      }
    }
  }
  await descer(raiz);
  return encontrados;
}

export interface RelatorioVarreduraObrigacoes {
  pasta: string;
  totalArquivos: number;
  catalogados: number;
  ignorados: number;
  erros: number;
  detalhes: Array<{
    arquivo: string;
    status: "novo" | "atualizado" | "inalterado" | "ignorado" | "erro";
    tipo?: TipoObrigacao;
    competencia?: string; // "AAAA" ou "MM/AAAA"
    mensagem?: string;
  }>;
}

export async function varrerObrigacoesAcessorias(params: {
  clienteId: string;
}): Promise<RelatorioVarreduraObrigacoes> {
  const cliente = await prisma.cliente.findUnique({
    where: { id: params.clienteId },
    select: { pastaFiscal: true },
  });
  if (!cliente?.pastaFiscal) {
    throw new Error(
      "Cliente sem pasta fiscal cadastrada. Configure em Editar cadastro.",
    );
  }
  const pasta = cliente.pastaFiscal;

  try {
    const st = await stat(pasta);
    if (!st.isDirectory()) throw new Error(`"${pasta}" não é uma pasta`);
  } catch (e) {
    throw new Error(
      `Não consegui ler a pasta "${pasta}": ${e instanceof Error ? e.message : String(e)}`,
    );
  }

  const caminhos = await listarArquivosRecursivo(pasta);
  const relatorio: RelatorioVarreduraObrigacoes = {
    pasta,
    totalArquivos: caminhos.length,
    catalogados: 0,
    ignorados: 0,
    erros: 0,
    detalhes: [],
  };

  for (const caminho of caminhos) {
    const rotulo = relative(pasta, caminho) || caminho;
    try {
      const info = await stat(caminho);
      // Amostra só do começo do arquivo pra identificar o tipo (arquivos SPED
      // podem ter GB — carregar tudo aqui é desperdício).
      const fh = await open(caminho, "r");
      const buf = Buffer.alloc(HEADER_CHUNK_BYTES);
      const { bytesRead } = await fh.read(buf, 0, HEADER_CHUNK_BYTES, 0);
      await fh.close();
      const amostra = buf.subarray(0, bytesRead).toString("utf8");

      const ext = "." + (rotulo.split(".").pop() ?? "").toLowerCase();
      const detectado = identificarTipoESAmostra(ext, amostra);
      if (!detectado) {
        relatorio.ignorados++;
        relatorio.detalhes.push({
          arquivo: rotulo,
          status: "ignorado",
          mensagem: "não identificado como ECD/ECF/EFD-Contrib/DCTF antiga",
        });
        continue;
      }

      // Hash do conteúdo COMPLETO — usa pra detectar mudança sem depender só
      // do mtime (mtime pode mudar por cópia sem alterar conteúdo).
      const conteudoCompleto = await readFile(caminho);
      const hash = createHash("sha256").update(conteudoCompleto).digest("hex");

      // Upsert manual: Prisma não aceita `mes: null` em compound unique key.
      // Postgres também trata NULL como distinto no unique, então usamos
      // findFirst + create/update no lugar do upsert.
      const existente = await prisma.arquivoObrigacaoDetectado.findFirst({
        where: {
          clienteId: params.clienteId,
          tipoObrigacao: detectado.tipo,
          ano: detectado.ano,
          mes: detectado.mes,
        },
        select: { id: true, hashArquivo: true, mtime: true },
      });

      let status: "novo" | "atualizado" | "inalterado";
      if (!existente) {
        status = "novo";
      } else if (existente.hashArquivo === hash) {
        status = "inalterado";
      } else {
        status = "atualizado";
      }

      if (existente) {
        await prisma.arquivoObrigacaoDetectado.update({
          where: { id: existente.id },
          data: {
            caminho,
            nomeArquivo: rotulo,
            tamanhoBytes: info.size,
            mtime: info.mtime,
            hashArquivo: hash,
          },
        });
      } else {
        await prisma.arquivoObrigacaoDetectado.create({
          data: {
            clienteId: params.clienteId,
            tipoObrigacao: detectado.tipo,
            ano: detectado.ano,
            mes: detectado.mes,
            caminho,
            nomeArquivo: rotulo,
            tamanhoBytes: info.size,
            mtime: info.mtime,
            hashArquivo: hash,
          },
        });
      }

      relatorio.catalogados++;
      relatorio.detalhes.push({
        arquivo: rotulo,
        status,
        tipo: detectado.tipo,
        competencia:
          detectado.mes === null
            ? String(detectado.ano)
            : `${String(detectado.mes).padStart(2, "0")}/${detectado.ano}`,
      });
    } catch (e) {
      relatorio.erros++;
      relatorio.detalhes.push({
        arquivo: rotulo,
        status: "erro",
        mensagem: e instanceof Error ? e.message : String(e),
      });
    }
  }

  return relatorio;
}
