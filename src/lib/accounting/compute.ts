/**
 * Derivação de totais e subtotais a partir da estrutura padronizada.
 * Tudo aqui é determinístico e auditável — nenhum número é "estimado".
 */

import type {
  BalancoPatrimonial,
  DemonstrativosExercicio,
  DRE,
  Maybe,
} from "./types";

/** Soma tratando null como 0, mas retorna null se TODOS forem null. */
export function soma(...valores: Maybe[]): Maybe {
  const presentes = valores.filter((v): v is number => v !== null && v !== undefined);
  if (presentes.length === 0) return null;
  return presentes.reduce((a, b) => a + b, 0);
}

/** Divisão segura: null se denominador ausente, zero ou numerador ausente. */
export function div(num: Maybe, den: Maybe): Maybe {
  if (num === null || num === undefined) return null;
  if (den === null || den === undefined || den === 0) return null;
  return num / den;
}

export interface TotaisBalanco {
  ativoCirculante: Maybe;
  ativoNaoCirculante: Maybe;
  ativoTotal: Maybe;
  passivoCirculante: Maybe;
  passivoNaoCirculante: Maybe;
  patrimonioLiquido: Maybe;
  /** Passivo + PL (lado direito do balanço). */
  passivoMaisPL: Maybe;
  capitalTerceiros: Maybe; // passivo circ + não circ
}

export function totaisBalanco(b: BalancoPatrimonial): TotaisBalanco {
  const ac = soma(
    b.ativoCirculante.caixaEquivalentes,
    b.ativoCirculante.contasReceber,
    b.ativoCirculante.estoques,
    b.ativoCirculante.tributosRecuperar,
    b.ativoCirculante.outros,
  );
  const anc = soma(
    b.ativoNaoCirculante.realizavelLongoPrazo,
    b.ativoNaoCirculante.investimentos,
    b.ativoNaoCirculante.imobilizado,
    b.ativoNaoCirculante.intangivel,
    b.ativoNaoCirculante.outros,
  );
  const pc = soma(
    b.passivoCirculante.fornecedores,
    b.passivoCirculante.emprestimosFinanciamentos,
    b.passivoCirculante.obrigacoesTrabalhistas,
    b.passivoCirculante.obrigacoesTributarias,
    b.passivoCirculante.outros,
  );
  const pnc = soma(
    b.passivoNaoCirculante.emprestimosFinanciamentos,
    b.passivoNaoCirculante.outros,
  );
  const prejuizo = b.patrimonioLiquido.prejuizosAcumulados ?? 0;
  const plPositivo = soma(
    b.patrimonioLiquido.capitalSocial,
    b.patrimonioLiquido.reservas,
    b.patrimonioLiquido.lucrosAcumulados,
    b.patrimonioLiquido.outros,
  );
  const pl = plPositivo === null ? null : plPositivo - prejuizo;

  return {
    ativoCirculante: ac,
    ativoNaoCirculante: anc,
    ativoTotal: soma(ac, anc),
    passivoCirculante: pc,
    passivoNaoCirculante: pnc,
    patrimonioLiquido: pl,
    passivoMaisPL: soma(pc, pnc, pl),
    capitalTerceiros: soma(pc, pnc),
  };
}

export interface ResultadosDRE {
  receitaLiquida: Maybe;
  lucroBruto: Maybe;
  resultadoOperacional: Maybe; // antes do resultado financeiro
  resultadoFinanceiro: Maybe; // receitas - despesas financeiras
  resultadoAntesTributos: Maybe;
  resultadoLiquido: Maybe;
  ebitda: Maybe;
}

export function resultadosDRE(d: DRE): ResultadosDRE {
  const receitaLiquida =
    d.receitaBrutaVendas === null
      ? null
      : d.receitaBrutaVendas - (d.deducoes ?? 0);
  const lucroBruto =
    receitaLiquida === null ? null : receitaLiquida - (d.custos ?? 0);
  const resultadoOperacional =
    lucroBruto === null
      ? null
      : lucroBruto - (d.despesasOperacionais ?? 0) + (d.outrasReceitasDespesas ?? 0);
  const resultadoFinanceiro = soma(
    d.receitasFinanceiras,
    d.despesasFinanceiras === null ? null : -(d.despesasFinanceiras ?? 0),
  );
  const resultadoAntesTributos =
    resultadoOperacional === null
      ? null
      : resultadoOperacional +
        (d.receitasFinanceiras ?? 0) -
        (d.despesasFinanceiras ?? 0);
  const resultadoLiquido =
    resultadoAntesTributos === null
      ? null
      : resultadoAntesTributos - (d.tributosSobreLucro ?? 0);
  // EBITDA = resultado operacional + depreciação/amortização (aproximação
  // a partir do lucro operacional antes do resultado financeiro).
  const ebitda =
    resultadoOperacional === null || d.depreciacaoAmortizacao === null
      ? null
      : resultadoOperacional + (d.depreciacaoAmortizacao ?? 0);

  return {
    receitaLiquida,
    lucroBruto,
    resultadoOperacional,
    resultadoFinanceiro,
    resultadoAntesTributos,
    resultadoLiquido,
    ebitda,
  };
}

export interface TotaisExercicio {
  ano: number;
  balanco: TotaisBalanco;
  dre: ResultadosDRE;
}

export function totaisExercicio(ex: DemonstrativosExercicio): TotaisExercicio {
  return {
    ano: ex.ano,
    balanco: totaisBalanco(ex.balanco),
    dre: resultadosDRE(ex.dre),
  };
}
