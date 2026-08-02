/**
 * Importador de SPED-Contribuições: valida, deduplica (hash), grava apuração.
 */

import { createHash } from "node:crypto";
import { prisma } from "@/lib/db";
import { parseEfdContribuicoes } from "./parseEfdContribuicoes";

export interface ResultadoImportacao {
  ok: boolean;
  mensagem: string;
  importacaoId?: string;
  apuracaoId?: string;
  periodoApuracao?: Date;
  substituiu?: boolean;
}

export async function importarSpedContribuicoes(params: {
  clienteId: string;
  nomeArquivo: string;
  conteudo: string; // string UTF-8 (ou latin1 convertido)
  origem?: "UPLOAD" | "VARREDURA_PASTA";
  caminhoOrigem?: string;
  importadoPor?: string;
}): Promise<ResultadoImportacao> {
  const { clienteId, nomeArquivo, conteudo } = params;
  const hash = createHash("sha256").update(conteudo).digest("hex");
  const tamanho = Buffer.byteLength(conteudo, "utf8");

  const parsed = parseEfdContribuicoes(conteudo);
  if (!parsed.cabecalho.dataInicial || !parsed.cabecalho.dataFinal) {
    return {
      ok: false,
      mensagem: "Arquivo inválido: registro 0000 (cabeçalho) não encontrado ou incompleto.",
    };
  }
  if (!parsed.pis && !parsed.cofins) {
    return {
      ok: false,
      mensagem: "Arquivo não contém apuração M200 (PIS) nem M600 (COFINS).",
    };
  }

  // Primeiro dia do mês da apuração
  const periodoApuracao = new Date(
    parsed.cabecalho.dataInicial.getFullYear(),
    parsed.cabecalho.dataInicial.getMonth(),
    1,
  );

  // Cria o log de importação
  const importacao = await prisma.spedContribImportacao.create({
    data: {
      clienteId,
      nomeArquivo,
      tamanhoBytes: tamanho,
      hashArquivo: hash,
      origem: params.origem ?? "UPLOAD",
      caminhoOrigem: params.caminhoOrigem,
      totalLinhas: parsed.totalLinhas,
      cnpjArquivo: parsed.cabecalho.cnpj,
      dataInicioArq: parsed.cabecalho.dataInicial,
      dataFimArq: parsed.cabecalho.dataFinal,
      regimeArq: parsed.regime.codIncTrib,
      importadoPor: params.importadoPor,
    },
  });

  const pis = parsed.pis;
  const cofins = parsed.cofins;

  // Upsert por (clienteId, periodoApuracao) — reimport substitui
  const existente = await prisma.spedContribApuracao.findFirst({
    where: { clienteId, periodoApuracao },
    select: { id: true },
  });

  const dadosApuracao = {
    clienteId,
    periodoApuracao,
    dataInicial: parsed.cabecalho.dataInicial,
    dataFinal: parsed.cabecalho.dataFinal,
    regimeApuracao: parsed.regime.codIncTrib,
    indAtividade: parsed.cabecalho.indAtividade,

    pisNaoCumulativaPeriodo: pis?.naoCumulativaPeriodo ?? 0,
    pisCreditosDescontados: pis?.creditosDescontados ?? 0,
    pisNaoCumulativaDevida: pis?.naoCumulativaDevida ?? 0,
    pisCumulativaPeriodo: pis?.cumulativaPeriodo ?? 0,
    pisApuradaPeriodo: (pis?.naoCumulativaDevida ?? 0) + (pis?.cumulativaPeriodo ?? 0),
    pisCreditoAnterior: pis?.creditoAnterior ?? 0,
    pisContribuicaoDevida: pis?.contribuicaoDevida ?? 0,

    cofinsNaoCumulativaPeriodo: cofins?.naoCumulativaPeriodo ?? 0,
    cofinsCreditosDescontados: cofins?.creditosDescontados ?? 0,
    cofinsNaoCumulativaDevida: cofins?.naoCumulativaDevida ?? 0,
    cofinsCumulativaPeriodo: cofins?.cumulativaPeriodo ?? 0,
    cofinsApuradaPeriodo:
      (cofins?.naoCumulativaDevida ?? 0) + (cofins?.cumulativaPeriodo ?? 0),
    cofinsCreditoAnterior: cofins?.creditoAnterior ?? 0,
    cofinsContribuicaoDevida: cofins?.contribuicaoDevida ?? 0,

    importacaoId: importacao.id,
  };

  let apuracaoId: string;
  if (existente) {
    const upd = await prisma.spedContribApuracao.update({
      where: { id: existente.id },
      data: dadosApuracao,
    });
    apuracaoId = upd.id;
  } else {
    const created = await prisma.spedContribApuracao.create({ data: dadosApuracao });
    apuracaoId = created.id;
  }

  await prisma.spedContribImportacao.update({
    where: { id: importacao.id },
    data: { apuracoesGravadas: 1 },
  });

  return {
    ok: true,
    mensagem: existente
      ? `Apuração de ${periodoApuracao.toLocaleDateString("pt-BR")} substituída.`
      : `Apuração de ${periodoApuracao.toLocaleDateString("pt-BR")} importada.`,
    importacaoId: importacao.id,
    apuracaoId,
    periodoApuracao,
    substituiu: !!existente,
  };
}
