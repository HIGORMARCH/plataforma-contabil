import { prisma } from "@/lib/db";
import { acharPorIe, garantirMatriz, listarEstabelecimentos } from "@/lib/estabelecimento";
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
 * GiamIcmsARecolher. Idempotente por (estabelecimento, periodoApuracao,
 * retificacao) — reimport substitui.
 *
 * ESTABELECIMENTO: a GIAM é por inscrição estadual, então vai para o
 * estabelecimento do cadastro cuja IE é a do arquivo. Se nenhuma IE bate e o
 * cadastro tem alguma IE preenchida, marca como erro (evita associar GIAM de
 * outro cliente por engano — importante pra pastas compartilhadas onde vários
 * clientes têm arquivos juntos). Cadastro sem nenhuma IE: vai para a matriz.
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
  const matrizId = await garantirMatriz(clienteId);

  let parseResult: GiamApuracaoParsed;
  try {
    parseResult = parseGiam(conteudo);
  } catch (e) {
    const msg = e instanceof GiamFormatError ? e.message : String(e);
    const imp = await prisma.giamImportacao.create({
      data: {
        clienteId,
        estabelecimentoId: matrizId,
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

  // Estabelecimento da GIAM, pela IE do arquivo.
  const ieArquivo = parseResult.inscricaoEstadual.replace(/\D/g, "");
  const estab = ieArquivo ? await acharPorIe(clienteId, ieArquivo) : null;
  const iesCadastradas = (await listarEstabelecimentos(clienteId))
    .map((e) => (e.inscricaoEstadual ?? "").replace(/\D/g, ""))
    .filter(Boolean);
  const estabelecimentoId = estab?.id ?? matrizId;
  if (!estab && ieArquivo && iesCadastradas.length > 0) {
    const imp = await prisma.giamImportacao.create({
      data: {
        clienteId,
        estabelecimentoId: matrizId,
        nomeArquivo,
        tamanhoBytes,
        hashArquivo,
        origem,
        caminhoOrigem,
        sucesso: false,
        mensagem: `IE do arquivo (${ieArquivo}) não é de nenhum estabelecimento do cadastro (${iesCadastradas.join(", ")}) — arquivo de outro cliente?`,
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
      estabelecimentoId,
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

  // Upsert da apuração (chave: estabelecimento + competência + revisão)
  const chave = {
    estabelecimentoId_periodoApuracao_retificacao: {
      estabelecimentoId,
      periodoApuracao: parseResult.periodoApuracao,
      retificacao: parseResult.retificacao,
    },
  };
  const existente = await prisma.giamApuracao.findUnique({ where: chave });

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
    // Totais consolidados do Segmento B — Quadro 4 do Espelho da GIAM.
    totalEntradasBaseCalculo: parseResult.totalEntradas.baseCalculo,
    totalEntradasIsentas: parseResult.totalEntradas.isentasNaoTributadas,
    totalEntradasOutras: parseResult.totalEntradas.outras,
    totalEntradasST: parseResult.totalEntradas.substituicaoTributaria,
    totalEntradasValorContabil: parseResult.totalEntradas.valorContabil,
    totalEntradasCredito: parseResult.totalEntradas.creditoDebitoImposto,
    totalSaidasBaseCalculo: parseResult.totalSaidas.baseCalculo,
    totalSaidasIsentas: parseResult.totalSaidas.isentasNaoTributadas,
    totalSaidasOutras: parseResult.totalSaidas.outras,
    totalSaidasST: parseResult.totalSaidas.substituicaoTributaria,
    totalSaidasValorContabil: parseResult.totalSaidas.valorContabil,
    totalSaidasDebito: parseResult.totalSaidas.creditoDebitoImposto,
    // Compat com quem já lia os totais anteriores.
    totalCompras: parseResult.totalCompras,
    totalVendas: parseResult.totalVendas,
    icmsARecolherTotal: parseResult.icmsARecolherTotal,
    totalRegistros: parseResult.totalRegistros,
    importacaoId: importacao.id,
  };

  // Se já existe, apaga os filhos (GiamIcmsARecolher + GiamLinhaSegmentoB) pra
  // recriar. Reimport = substitui: qualquer alteração na GIAM (CFOP mudou,
  // linha removida etc.) reflete no banco sem sobrar registro velho.
  if (existente) {
    await prisma.$transaction([
      prisma.giamIcmsARecolher.deleteMany({ where: { apuracaoId: existente.id } }),
      prisma.giamLinhaSegmentoB.deleteMany({ where: { apuracaoId: existente.id } }),
    ]);
  }

  const apuracao = await prisma.giamApuracao.upsert({
    where: chave,
    create: {
      clienteId,
      estabelecimentoId,
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

  // Cria as linhas do Segmento B (uma por CFOP × natureza)
  if (parseResult.linhasSegmentoB.length > 0) {
    await prisma.giamLinhaSegmentoB.createMany({
      data: parseResult.linhasSegmentoB.map((l) => ({
        apuracaoId: apuracao.id,
        natureza: l.natureza,
        cfop: l.cfop,
        baseCalculo: l.baseCalculo,
        isentasNaoTributadas: l.isentasNaoTributadas,
        outras: l.outras,
        substituicaoTributaria: l.substituicaoTributaria,
        valorContabil: l.valorContabil,
        creditoDebitoImposto: l.creditoDebitoImposto,
        domicilioFiscal: l.domicilioFiscal,
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
