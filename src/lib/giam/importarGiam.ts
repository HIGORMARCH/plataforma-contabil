import { prisma } from "@/lib/db";
import { parseGiam, GiamFormatError, type GiamApuracaoParsed } from "./parseGiam";

export interface ResultadoImportacaoGiam {
  importacaoId: string;
  sucesso: boolean;
  mensagem: string;
  ieArquivo: string | null;
  periodoArquivo: string | null;
  retificacaoArquivo: string | null;
  apuracaoGravada: boolean;
  apuracaoSubstituida: boolean;
}

/**
 * Importa um arquivo GIAM (conteúdo textual) e persiste como GiamApuracao +
 * GiamIcmsARecolher. Idempotente por (clienteId, periodoApuracao, retificacao) —
 * reimport substitui.
 *
 * SANITY CHECK: se o cliente tem IE cadastrada e ela NÃO bate com a IE do arquivo,
 * marca como erro (evita associar GIAM de outro cliente por engano — importante
 * pra pastas compartilhadas onde vários clientes têm arquivos juntos).
 */
export async function importarGiam(params: {
  clienteId: string;
  nomeArquivo: string;
  conteudo: string;
  importadoPor?: string;
  hashArquivo?: string;
  origem?: "UPLOAD" | "VARREDURA_PASTA";
  caminhoOrigem?: string;
}): Promise<ResultadoImportacaoGiam> {
  const { clienteId, nomeArquivo, conteudo, importadoPor, hashArquivo, origem = "UPLOAD", caminhoOrigem } = params;
  const tamanhoBytes = Buffer.byteLength(conteudo, "utf8");

  let parseResult: GiamApuracaoParsed;
  try {
    parseResult = parseGiam(conteudo);
  } catch (e) {
    const msg = e instanceof GiamFormatError ? e.message : String(e);
    const imp = await prisma.giamImportacao.create({
      data: {
        clienteId,
        nomeArquivo,
        tamanhoBytes,
        hashArquivo,
        origem,
        caminhoOrigem,
        sucesso: false,
        mensagem: `Erro no parser: ${msg}`,
        importadoPor,
      },
    });
    return {
      importacaoId: imp.id,
      sucesso: false,
      mensagem: imp.mensagem ?? "erro no parser",
      ieArquivo: null,
      periodoArquivo: null,
      retificacaoArquivo: null,
      apuracaoGravada: false,
      apuracaoSubstituida: false,
    };
  }

  // Sanity: IE do arquivo bate com IE cadastrada no cliente?
  const cliente = await prisma.cliente.findUnique({
    where: { id: clienteId },
    select: { inscricaoEstadual: true },
  });
  const ieCadastrada = (cliente?.inscricaoEstadual ?? "").replace(/\D/g, "");
  const ieArquivo = parseResult.inscricaoEstadual.replace(/\D/g, "");
  if (ieCadastrada && ieArquivo && ieCadastrada !== ieArquivo) {
    const imp = await prisma.giamImportacao.create({
      data: {
        clienteId,
        nomeArquivo,
        tamanhoBytes,
        hashArquivo,
        origem,
        caminhoOrigem,
        sucesso: false,
        mensagem: `IE do arquivo (${ieArquivo}) não bate com IE cadastrada do cliente (${ieCadastrada}) — arquivo de outro cliente?`,
        ieArquivo,
        periodoArquivo: parseResult.periodoMMAAAA,
        retificacaoArquivo: parseResult.retificacao,
        versaoArquivo: parseResult.versaoArquivo,
        nomeContabilista: parseResult.nomeContabilista,
        crcContabilista: `${parseResult.crcContabilista}${parseResult.ufCrcContabilista ? "/" + parseResult.ufCrcContabilista : ""}`,
        importadoPor,
      },
    });
    return {
      importacaoId: imp.id,
      sucesso: false,
      mensagem: imp.mensagem ?? "IE não bate",
      ieArquivo,
      periodoArquivo: parseResult.periodoMMAAAA,
      retificacaoArquivo: parseResult.retificacao,
      apuracaoGravada: false,
      apuracaoSubstituida: false,
    };
  }

  const importacao = await prisma.giamImportacao.create({
    data: {
      clienteId,
      nomeArquivo,
      tamanhoBytes,
      hashArquivo,
      origem,
      caminhoOrigem,
      sucesso: true,
      ieArquivo,
      periodoArquivo: parseResult.periodoMMAAAA,
      retificacaoArquivo: parseResult.retificacao,
      versaoArquivo: parseResult.versaoArquivo,
      nomeContabilista: parseResult.nomeContabilista,
      crcContabilista: `${parseResult.crcContabilista}${parseResult.ufCrcContabilista ? "/" + parseResult.ufCrcContabilista : ""}`,
      importadoPor,
    },
  });

  // Upsert da apuração (chave: cliente + competência + revisão)
  const existente = await prisma.giamApuracao.findUnique({
    where: {
      clienteId_periodoApuracao_retificacao: {
        clienteId,
        periodoApuracao: parseResult.periodoApuracao,
        retificacao: parseResult.retificacao,
      },
    },
  });

  const dadosApur = {
    debitoSaidas: parseResult.debitoSaidas,
    outrosDebitos: parseResult.outrosDebitos,
    estornoCreditos: parseResult.estornoCreditos,
    creditoEntradas: parseResult.creditoEntradas,
    outrosCreditos: parseResult.outrosCreditos,
    estornosDebito: parseResult.estornosDebito,
    saldoCredorAnterior: parseResult.saldoCredorAnterior,
    deducoes: parseResult.deducoes,
    difAliquotaARecolher: parseResult.difAliquotaARecolher,
    icmsARecolherTotal: parseResult.icmsARecolherTotal,
    totalRegistros: parseResult.totalRegistros,
    importacaoId: importacao.id,
  };

  // Se já existe, apaga os filhos GiamIcmsARecolher pra recriar (mudança de tipo/valor).
  if (existente) {
    await prisma.giamIcmsARecolher.deleteMany({ where: { apuracaoId: existente.id } });
  }

  const apuracao = await prisma.giamApuracao.upsert({
    where: {
      clienteId_periodoApuracao_retificacao: {
        clienteId,
        periodoApuracao: parseResult.periodoApuracao,
        retificacao: parseResult.retificacao,
      },
    },
    create: {
      clienteId,
      periodoApuracao: parseResult.periodoApuracao,
      retificacao: parseResult.retificacao,
      ...dadosApur,
    },
    update: dadosApur,
  });

  // Cria as linhas do Segmento E
  if (parseResult.icmsARecolher.length > 0) {
    await prisma.giamIcmsARecolher.createMany({
      data: parseResult.icmsARecolher.map((e) => ({
        apuracaoId: apuracao.id,
        tipo: e.tipo,
        dataVencimento: e.dataVencimento,
        valor: e.valor,
      })),
    });
  }

  const mensagem = existente ? "apuração substituída" : "apuração nova";
  await prisma.giamImportacao.update({
    where: { id: importacao.id },
    data: { mensagem },
  });

  return {
    importacaoId: importacao.id,
    sucesso: true,
    mensagem,
    ieArquivo,
    periodoArquivo: parseResult.periodoMMAAAA,
    retificacaoArquivo: parseResult.retificacao,
    apuracaoGravada: !existente,
    apuracaoSubstituida: !!existente,
  };
}
