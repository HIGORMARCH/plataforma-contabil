import { prisma } from "@/lib/db";
import { decifrar } from "@/lib/crypto";
import { raspaGiamSefaz, SefazPortalError, type GiamSefazApuracaoRaspada } from "./sefazScraper";
import { foraDoPeriodo, competenciaUtc } from "@/lib/atendimento";
import { garantirMatriz, obterEstabelecimento } from "@/lib/estabelecimento";

export interface ResumoSincronizacaoSefaz {
  sincronizacaoId: string;
  sucesso: boolean;
  mensagem: string;
  competenciasImportadas: number;
  competenciasSubstituidas: number;
  competenciasComErro: string[];
}

/**
 * Roda o robô SEFAZ para um estabelecimento/ano e persiste os resultados.
 * O login no portal é por inscrição estadual, então cada estabelecimento do
 * cadastro roda separado; sem `estabelecimentoId`, roda a matriz.
 *
 * Regra de sessão:
 *   - Decifra a senha SEFAZ APENAS aqui, dentro do processo. Nunca loga a
 *     senha, nunca devolve pra tela.
 *   - Se o estabelecimento não tem IE ou senha cadastrada, retorna erro claro (não roda).
 */
export async function sincronizarGiamSefaz(opts: {
  clienteId: string;
  estabelecimentoId?: string;
  ano: number;
  meses?: number[];
  executadoPor?: string;
  headless?: boolean;
}): Promise<ResumoSincronizacaoSefaz> {
  const { clienteId, ano, meses, executadoPor, headless = true } = opts;

  const cliente = await prisma.cliente.findUnique({
    where: { id: clienteId },
    select: {
      id: true,
      razaoSocial: true,
      atendimentoInicio: true,
      atendimentoFim: true,
    },
  });
  if (!cliente) {
    throw new Error("Cliente não encontrado.");
  }
  const estabelecimentoId = opts.estabelecimentoId ?? (await garantirMatriz(clienteId));
  const estab = await obterEstabelecimento(clienteId, estabelecimentoId);
  if (!estab) {
    throw new Error("Estabelecimento não pertence a este cliente.");
  }
  const erro = (msg: string) => criarErro(clienteId, estabelecimentoId, ano, meses, executadoPor, msg);
  if (!estab.inscricaoEstadual) {
    return erro(`${estab.rotulo} sem Inscrição Estadual cadastrada.`);
  }
  if (!estab.senhaSefaz) {
    return erro(`${estab.rotulo} sem senha SEFAZ cadastrada.`);
  }
  // Período de atendimento é da empresa; vigência da IE é do estabelecimento.
  const periodo = {
    atendimentoInicio: cliente.atendimentoInicio,
    atendimentoFim: cliente.atendimentoFim,
    ieInicio: estab.ieInicio,
    ieFim: estab.ieFim,
  };

  // GUARD DE PERÍODO — a GIAM é obrigação ESTADUAL, então além do período de
  // atendimento vale a vigência da inscrição estadual: antes de existir IE não
  // há GIAM a buscar no portal (caso LUPO QUIOSQUE, 07/2019).
  const mesesPedidos = meses ?? [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
  const mesesNoPeriodo = mesesPedidos.filter(
    (m) => foraDoPeriodo(periodo, competenciaUtc(ano, m), { exigeIe: true }) === null,
  );
  if (mesesNoPeriodo.length === 0) {
    return erro(
      `Nenhuma competência de ${ano} está dentro do período de atendimento / vigência da inscrição estadual — o portal não foi consultado.`,
    );
  }
  const mesesDescartados = mesesPedidos.filter((m) => !mesesNoPeriodo.includes(m));

  let senha: string;
  try {
    senha = decifrar(estab.senhaSefaz);
  } catch (e) {
    return erro("Falha ao decifrar senha SEFAZ. Verifique ENCRYPTION_KEY.");
  }

  const sync = await prisma.giamSefazSincronizacao.create({
    data: {
      clienteId,
      estabelecimentoId,
      ano,
      mesInicial: Math.min(...mesesNoPeriodo),
      mesFinal: Math.max(...mesesNoPeriodo),
      competenciasSolicitadas: mesesNoPeriodo.length,
      sucesso: false,
      executadoPor,
    },
  });

  const erros: string[] = [];
  let importadas = 0;
  let substituidas = 0;

  try {
    const { apuracoes: raspadas, erros: naoBaixadas } = await raspaGiamSefaz({
      ie: estab.inscricaoEstadual,
      senha,
      ano,
      meses: mesesNoPeriodo,
      headless,
    });
    // Mês que o portal lista mas não baixou em nenhuma tentativa: a sincronização
    // fica "com erro" e diz qual — nunca some calado.
    for (const n of naoBaixadas) {
      erros.push(`${String(n.mes).padStart(2, "0")}/${n.ano}: não baixou após as tentativas (${n.motivo})`);
    }

    for (const r of raspadas) {
      try {
        const feito = await gravarApuracao(clienteId, estabelecimentoId, sync.id, r);
        if (feito.substituiu) substituidas++;
        else importadas++;
      } catch (e) {
        const chave = `${String(r.mes).padStart(2, "0")}/${r.ano}`;
        erros.push(`${chave}: ${String(e)}`);
      }
    }
  } catch (e) {
    const msg = e instanceof SefazPortalError ? e.message : String(e);
    await prisma.giamSefazSincronizacao.update({
      where: { id: sync.id },
      data: { sucesso: false, mensagem: msg, competenciasImportadas: importadas, competenciasSubstituidas: substituidas },
    });
    return {
      sincronizacaoId: sync.id,
      sucesso: false,
      mensagem: msg,
      competenciasImportadas: importadas,
      competenciasSubstituidas: substituidas,
      competenciasComErro: [],
    };
  }

  const base = erros.length === 0
    ? `${importadas} nova(s), ${substituidas} substituída(s)`
    : `${importadas} ok, ${substituidas} substituídas, ${erros.length} com erro`;
  // Deixa explícito o que o guard cortou — senão o contador pede 12 meses,
  // recebe 5 e não sabe por quê.
  const mensagem =
    mesesDescartados.length > 0
      ? `${base}. ${mesesDescartados.length} competência(s) fora do período de atendimento / vigência da IE não foram consultadas: ${mesesDescartados
          .map((m) => String(m).padStart(2, "0"))
          .join(", ")}.`
      : base;

  await prisma.giamSefazSincronizacao.update({
    where: { id: sync.id },
    data: {
      sucesso: erros.length === 0,
      mensagem,
      competenciasImportadas: importadas,
      competenciasSubstituidas: substituidas,
    },
  });

  return {
    sincronizacaoId: sync.id,
    sucesso: erros.length === 0,
    mensagem,
    competenciasImportadas: importadas,
    competenciasSubstituidas: substituidas,
    competenciasComErro: erros,
  };
}

async function gravarApuracao(
  clienteId: string,
  estabelecimentoId: string,
  sincronizacaoId: string,
  r: GiamSefazApuracaoRaspada,
): Promise<{ substituiu: boolean }> {
  const periodoApuracao = new Date(Date.UTC(r.ano, r.mes - 1, 1));

  const chave = {
    estabelecimentoId_periodoApuracao_retificacao: {
      estabelecimentoId,
      periodoApuracao,
      retificacao: r.retificacao,
    },
  };
  const existente = await prisma.giamSefazApuracao.findUnique({ where: chave });

  if (existente) {
    await prisma.giamSefazLinhaSegmentoB.deleteMany({ where: { apuracaoId: existente.id } });
  }

  const dados = {
    clienteId,
    estabelecimentoId,
    periodoApuracao,
    retificacao: r.retificacao,
    numeroControle: r.numeroControle,
    dataRecepcao: r.dataRecepcao,
    debitoSaidas: r.debitoSaidas,
    creditoEntradas: r.creditoEntradas,
    saldoCredorAnterior: r.saldoCredorAnterior,
    deducoes: r.deducoes,
    icmsARecolherNormal: r.icmsARecolherNormal,
    totalEntradasBaseCalculo: r.totalEntradas.baseCalculo,
    totalEntradasIsentas: r.totalEntradas.isentasNaoTributadas,
    totalEntradasOutras: r.totalEntradas.outras,
    totalEntradasST: r.totalEntradas.substituicaoTributaria,
    totalEntradasValorContabil: r.totalEntradas.valorContabil,
    totalEntradasCredito: r.totalEntradas.creditoDebitoImposto,
    totalSaidasBaseCalculo: r.totalSaidas.baseCalculo,
    totalSaidasIsentas: r.totalSaidas.isentasNaoTributadas,
    totalSaidasOutras: r.totalSaidas.outras,
    totalSaidasST: r.totalSaidas.substituicaoTributaria,
    totalSaidasValorContabil: r.totalSaidas.valorContabil,
    totalSaidasDebito: r.totalSaidas.creditoDebitoImposto,
    totalCompras: r.totalEntradas.valorContabil,
    totalVendas: r.totalSaidas.valorContabil,
    sincronizacaoId,
    // Carimbo explícito: o @default(now()) do schema só vale na criação, e sem
    // isto uma competência regravada continuava com a data da PRIMEIRA leitura
    // — o relatório usa essa data pra saber se a apuração (saldo credor,
    // deduções, imposto a recolher) veio do robô que lê esses campos.
    sincronizadoEm: new Date(),
  };

  const apuracao = await prisma.giamSefazApuracao.upsert({
    where: chave,
    create: dados,
    update: dados,
  });

  if (r.linhasSegmentoB.length > 0) {
    await prisma.giamSefazLinhaSegmentoB.createMany({
      data: r.linhasSegmentoB.map((l) => ({
        apuracaoId: apuracao.id,
        natureza: l.natureza,
        cfop: l.cfop,
        baseCalculo: l.baseCalculo,
        isentasNaoTributadas: l.isentasNaoTributadas,
        outras: l.outras,
        substituicaoTributaria: l.substituicaoTributaria,
        valorContabil: l.valorContabil,
        creditoDebitoImposto: l.creditoDebitoImposto,
      })),
    });
  }

  return { substituiu: !!existente };
}

async function criarErro(
  clienteId: string,
  estabelecimentoId: string,
  ano: number,
  meses: number[] | undefined,
  executadoPor: string | undefined,
  msg: string,
): Promise<ResumoSincronizacaoSefaz> {
  const sync = await prisma.giamSefazSincronizacao.create({
    data: {
      clienteId,
      estabelecimentoId,
      ano,
      mesInicial: meses ? Math.min(...meses) : 1,
      mesFinal: meses ? Math.max(...meses) : 12,
      competenciasSolicitadas: meses?.length ?? 12,
      sucesso: false,
      mensagem: msg,
      executadoPor,
    },
  });
  return {
    sincronizacaoId: sync.id,
    sucesso: false,
    mensagem: msg,
    competenciasImportadas: 0,
    competenciasSubstituidas: 0,
    competenciasComErro: [],
  };
}
