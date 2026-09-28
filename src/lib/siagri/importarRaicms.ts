import { createHash } from "node:crypto";
import { prisma } from "@/lib/db";
import { acharPorCnpj, acharPorIe } from "@/lib/estabelecimento";
import { parseRaicmsSiagri, RaicmsFormatError } from "./parseRaicms";

export interface ResultadoImportacaoRaicms {
  ok: boolean;
  mensagem: string;
  estabelecimento?: string; // rótulo ("Matriz", "Filial 01")
  competencia?: string; // MM/AAAA
  substituiu?: boolean;
  alertas: string[];
}

/** Texto do PDF pelo pdf-parse (import dinâmico — ver armadilha do worker do pdfjs). */
export async function textoDoPdf(pdf: Buffer): Promise<string> {
  const { PDFParse } = await import("pdf-parse");
  const parser = new PDFParse({ data: pdf });
  try {
    return (await parser.getText()).text;
  } finally {
    await parser.destroy();
  }
}

/**
 * Importa o RAICMS (Livro de Apuração do ICMS, modelo P9) do Siagri. O
 * estabelecimento vem do CNPJ impresso no livro (ou da IE); livro de CNPJ que
 * não é do cadastro é recusado. Reimportar a mesma competência substitui.
 * O PDF não é guardado — só os valores e o caminho de origem.
 */
export async function importarRaicmsSiagri(params: {
  clienteId: string;
  nomeArquivo: string;
  pdf: Buffer;
  caminhoOrigem?: string;
  importadoPor?: string;
}): Promise<ResultadoImportacaoRaicms> {
  const { clienteId, nomeArquivo, pdf } = params;

  let r;
  try {
    r = parseRaicmsSiagri(await textoDoPdf(pdf));
  } catch (e) {
    const msg = e instanceof RaicmsFormatError ? e.message : `Não consegui ler o PDF: ${String(e)}`;
    return { ok: false, mensagem: msg, alertas: [] };
  }
  if (!r.dataInicial || !r.dataFinal) {
    return { ok: false, mensagem: "Período do livro não encontrado.", alertas: r.alertas };
  }

  const estab =
    (r.cnpj ? await acharPorCnpj(clienteId, r.cnpj) : null) ??
    (r.inscricaoEstadual ? await acharPorIe(clienteId, r.inscricaoEstadual) : null);
  if (!estab) {
    return {
      ok: false,
      mensagem: `CNPJ ${r.cnpj ?? "—"} / IE ${r.inscricaoEstadual ?? "—"} do livro não é de nenhum estabelecimento deste cadastro — nada gravado.`,
      alertas: r.alertas,
    };
  }

  const periodoApuracao = new Date(Date.UTC(r.dataInicial.getUTCFullYear(), r.dataInicial.getUTCMonth(), 1));
  const competencia = `${String(periodoApuracao.getUTCMonth() + 1).padStart(2, "0")}/${periodoApuracao.getUTCFullYear()}`;
  const chave = { estabelecimentoId_periodoApuracao: { estabelecimentoId: estab.id, periodoApuracao } };

  const dados = {
    clienteId,
    estabelecimentoId: estab.id,
    periodoApuracao,
    dataInicial: r.dataInicial,
    dataFinal: r.dataFinal,
    entradasValorContabil: r.entradas.valorContabil,
    entradasBaseCalculo: r.entradas.baseCalculo,
    entradasImposto: r.entradas.imposto,
    entradasIsentas: r.entradas.isentas,
    entradasOutras: r.entradas.outras,
    saidasValorContabil: r.saidas.valorContabil,
    saidasBaseCalculo: r.saidas.baseCalculo,
    saidasImposto: r.saidas.imposto,
    saidasIsentas: r.saidas.isentas,
    saidasOutras: r.saidas.outras,
    ...r.apuracao,
    alertas: r.alertas,
    nomeArquivo,
    caminhoOrigem: params.caminhoOrigem,
    hashArquivo: createHash("sha256").update(pdf).digest("hex"),
    importadoPor: params.importadoPor,
    importadoEm: new Date(),
  };

  const existente = await prisma.siagriApuracao.findUnique({ where: chave, select: { id: true } });
  await prisma.$transaction(async (tx) => {
    const ap = await tx.siagriApuracao.upsert({ where: chave, create: dados, update: dados });
    await tx.siagriLinhaCfop.deleteMany({ where: { apuracaoId: ap.id } });
    await tx.siagriLinhaCfop.createMany({
      data: r.linhas.map((l) => ({ apuracaoId: ap.id, ...l })),
    });
  });

  return {
    ok: true,
    mensagem: `${estab.rotulo} · ${competencia}: ${r.linhas.length} CFOP${existente ? " (substituiu a importação anterior)" : ""}`,
    estabelecimento: estab.rotulo,
    competencia,
    substituiu: Boolean(existente),
    alertas: r.alertas,
  };
}
