import { prisma } from "@/lib/db";
import { decifrar } from "@/lib/crypto";
import { raspaGiamSefaz, SefazPortalError, type GiamSefazApuracaoRaspada } from "./sefazScraper";

export interface ResumoSincronizacaoSefaz {
  sincronizacaoId: string;
  sucesso: boolean;
  mensagem: string;
  competenciasImportadas: number;
  competenciasSubstituidas: number;
  competenciasComErro: string[];
}

/**
 * Roda o robô SEFAZ para um cliente/ano e persiste os resultados.
 *
 * Regra de sessão:
 *   - Decifra a senha SEFAZ do cliente APENAS aqui, dentro do processo. Nunca
 *     loga a senha, nunca devolve pra tela.
 *   - Se o cliente não tem IE ou senha cadastrada, retorna erro claro (não roda).
 */
export async function sincronizarGiamSefaz(opts: {
  clienteId: string;
  ano: number;
  meses?: number[];
  executadoPor?: string;
  headless?: boolean;
}): Promise<ResumoSincronizacaoSefaz> {
  const { clienteId, ano, meses, executadoPor, headless = true } = opts;

  const cliente = await prisma.cliente.findUnique({
    where: { id: clienteId },
    select: { id: true, inscricaoEstadual: true, senhaSefaz: true, razaoSocial: true },
  });
  if (!cliente) {
    throw new Error("Cliente não encontrado.");
  }
  if (!cliente.inscricaoEstadual) {
    return criarErro(clienteId, ano, meses, executadoPor, "Cliente sem Inscrição Estadual cadastrada.");
  }
  if (!cliente.senhaSefaz) {
    return criarErro(clienteId, ano, meses, executadoPor, "Cliente sem senha SEFAZ cadastrada.");
  }

  let senha: string;
  try {
    senha = decifrar(cliente.senhaSefaz);
  } catch (e) {
    return criarErro(clienteId, ano, meses, executadoPor, "Falha ao decifrar senha SEFAZ. Verifique ENCRYPTION_KEY.");
  }

  const sync = await prisma.giamSefazSincronizacao.create({
    data: {
      clienteId,
      ano,
      mesInicial: meses ? Math.min(...meses) : 1,
      mesFinal: meses ? Math.max(...meses) : 12,
      competenciasSolicitadas: meses?.length ?? 12,
      sucesso: false,
      executadoPor,
    },
  });

  const erros: string[] = [];
  let importadas = 0;
  let substituidas = 0;

  try {
    const raspadas = await raspaGiamSefaz({
      ie: cliente.inscricaoEstadual,
      senha,
      ano,
      meses,
      headless,
    });

    for (const r of raspadas) {
      try {
        const feito = await gravarApuracao(clienteId, sync.id, r);
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

  const mensagem = erros.length === 0
    ? `${importadas} nova(s), ${substituidas} substituída(s)`
    : `${importadas} ok, ${substituidas} substituídas, ${erros.length} com erro`;

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
  sincronizacaoId: string,
  r: GiamSefazApuracaoRaspada,
): Promise<{ substituiu: boolean }> {
  const periodoApuracao = new Date(Date.UTC(r.ano, r.mes - 1, 1));

  const existente = await prisma.giamSefazApuracao.findUnique({
    where: {
      clienteId_periodoApuracao_retificacao: {
        clienteId,
        periodoApuracao,
        retificacao: r.retificacao,
      },
    },
  });

  if (existente) {
    await prisma.giamSefazLinhaSegmentoB.deleteMany({ where: { apuracaoId: existente.id } });
  }

  const dados = {
    clienteId,
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
  };

  const apuracao = await prisma.giamSefazApuracao.upsert({
    where: {
      clienteId_periodoApuracao_retificacao: {
        clienteId,
        periodoApuracao,
        retificacao: r.retificacao,
      },
    },
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
  ano: number,
  meses: number[] | undefined,
  executadoPor: string | undefined,
  msg: string,
): Promise<ResumoSincronizacaoSefaz> {
  const sync = await prisma.giamSefazSincronizacao.create({
    data: {
      clienteId,
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
