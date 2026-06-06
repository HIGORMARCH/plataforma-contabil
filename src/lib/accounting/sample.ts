/**
 * Conjunto de dados de exemplo (empresa fictícia de comércio) com dois
 * exercícios que fecham corretamente (Ativo = Passivo + PL). Usado nos
 * testes do motor e no seed inicial da plataforma.
 */

import type { DemonstrativosExercicio } from "./types";

export const EXERCICIO_2023: DemonstrativosExercicio = {
  ano: 2023,
  documentosFornecidos: ["Balanço Patrimonial 2023", "DRE 2023", "Balancete 12/2023"],
  balanco: {
    ativoCirculante: {
      caixaEquivalentes: 90000,
      contasReceber: 240000,
      estoques: 320000,
      tributosRecuperar: 35000,
      outros: 15000,
    },
    ativoNaoCirculante: {
      realizavelLongoPrazo: 40000,
      investimentos: 0,
      imobilizado: 560000,
      intangivel: 50000,
      outros: 0,
    },
    passivoCirculante: {
      fornecedores: 200000,
      emprestimosFinanciamentos: 170000,
      obrigacoesTrabalhistas: 55000,
      obrigacoesTributarias: 45000,
      outros: 0,
    },
    passivoNaoCirculante: { emprestimosFinanciamentos: 280000, outros: 0 },
    patrimonioLiquido: {
      capitalSocial: 500000,
      reservas: 80000,
      lucrosAcumulados: 20000,
      prejuizosAcumulados: 0,
      outros: 0,
    },
    ativoTotalInformado: 1350000,
  },
  dre: {
    receitaBrutaVendas: 2200000,
    deducoes: 360000,
    custos: 1270000,
    despesasOperacionais: 410000,
    despesasFinanceiras: 75000,
    receitasFinanceiras: 8000,
    outrasReceitasDespesas: 0,
    tributosSobreLucro: 30000,
    depreciacaoAmortizacao: 75000,
    resultadoLiquidoInformado: 63000,
  },
};

export const EXERCICIO_2024: DemonstrativosExercicio = {
  ano: 2024,
  documentosFornecidos: ["Balanço Patrimonial 2024", "DRE 2024", "Balancete 12/2024"],
  balanco: {
    ativoCirculante: {
      caixaEquivalentes: 120000,
      contasReceber: 280000,
      estoques: 350000,
      tributosRecuperar: 40000,
      outros: 10000,
    },
    ativoNaoCirculante: {
      realizavelLongoPrazo: 50000,
      investimentos: 0,
      imobilizado: 600000,
      intangivel: 50000,
      outros: 0,
    },
    passivoCirculante: {
      fornecedores: 220000,
      emprestimosFinanciamentos: 180000,
      obrigacoesTrabalhistas: 60000,
      obrigacoesTributarias: 40000,
      outros: 0,
    },
    passivoNaoCirculante: { emprestimosFinanciamentos: 300000, outros: 0 },
    patrimonioLiquido: {
      capitalSocial: 500000,
      reservas: 100000,
      lucrosAcumulados: 100000,
      prejuizosAcumulados: 0,
      outros: 0,
    },
    ativoTotalInformado: 1500000,
  },
  dre: {
    receitaBrutaVendas: 2500000,
    deducoes: 400000,
    custos: 1400000,
    despesasOperacionais: 450000,
    despesasFinanceiras: 70000,
    receitasFinanceiras: 10000,
    outrasReceitasDespesas: 0,
    tributosSobreLucro: 60000,
    depreciacaoAmortizacao: 80000,
    resultadoLiquidoInformado: 130000,
  },
};

export const EXERCICIOS_EXEMPLO: DemonstrativosExercicio[] = [
  EXERCICIO_2023,
  EXERCICIO_2024,
];
