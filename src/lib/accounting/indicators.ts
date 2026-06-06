/**
 * Cálculo determinístico dos indicadores econômico-financeiros.
 * Cada indicador traz fórmula, valor, classificação, interpretação técnica
 * e recomendação gerencial. Quando faltam dados, a classificação é
 * "inconclusivo" e nenhuma conclusão é forçada.
 */

import {
  div,
  resultadosDRE,
  soma,
  totaisBalanco,
  type TotaisExercicio,
} from "./compute";
import { dias, indice, moeda, percentual } from "./format";
import type {
  Classificacao,
  DemonstrativosExercicio,
  Indicador,
  Maybe,
} from "./types";

type Faixa = { ate: number; classe: Classificacao };

/**
 * Classifica um valor "quanto maior melhor" usando faixas crescentes.
 * Ex.: liquidez corrente — abaixo de 1,0 crítico; 1,0–1,2 atenção; acima saudável.
 */
function classificaMaiorMelhor(valor: Maybe, faixas: Faixa[], acima: Classificacao): Classificacao {
  if (valor === null) return "inconclusivo";
  for (const f of faixas) {
    if (valor < f.ate) return f.classe;
  }
  return acima;
}

/** Classifica "quanto menor melhor" usando faixas crescentes. */
function classificaMenorMelhor(valor: Maybe, faixas: Faixa[], acima: Classificacao): Classificacao {
  if (valor === null) return "inconclusivo";
  for (const f of faixas) {
    if (valor < f.ate) return f.classe;
  }
  return acima;
}

export function calcularIndicadores(ex: DemonstrativosExercicio): Indicador[] {
  const b = totaisBalanco(ex.balanco);
  const r = resultadosDRE(ex.dre);
  const ind: Indicador[] = [];

  // PL só serve de denominador quando positivo. Com PL <= 0 (passivo a
  // descoberto), os índices baseados no PL não têm significado econômico e
  // ficam inconclusivos — o destaque passa a ser a própria insolvência.
  const plPositivo =
    b.patrimonioLiquido !== null && b.patrimonioLiquido > 0 ? b.patrimonioLiquido : null;

  const add = (i: Indicador) => ind.push(i);

  // ---------- LIQUIDEZ ----------
  const liqCorrente = div(b.ativoCirculante, b.passivoCirculante);
  add({
    chave: "liquidez_corrente",
    nome: "Liquidez Corrente",
    categoria: "liquidez",
    formula: "Ativo Circulante ÷ Passivo Circulante",
    valor: liqCorrente,
    valorFormatado: indice(liqCorrente),
    unidade: "indice",
    classificacao: classificaMaiorMelhor(
      liqCorrente,
      [
        { ate: 1.0, classe: "critico" },
        { ate: 1.2, classe: "atencao" },
      ],
      "saudavel",
    ),
    interpretacao:
      liqCorrente === null
        ? "Não foi possível calcular por ausência de dados do circulante."
        : `Para cada R$ 1,00 de dívida de curto prazo, a empresa dispõe de ${indice(liqCorrente)} em bens e direitos de curto prazo.`,
    recomendacao:
      liqCorrente !== null && liqCorrente < 1
        ? "Capital de giro insuficiente: avaliar renegociação de prazos, redução de estoques ou aporte."
        : "Manter monitoramento do capital de giro.",
  });

  const liqSeca = div(
    soma(b.ativoCirculante, ex.balanco.ativoCirculante.estoques === null ? null : -(ex.balanco.ativoCirculante.estoques ?? 0)),
    b.passivoCirculante,
  );
  add({
    chave: "liquidez_seca",
    nome: "Liquidez Seca",
    categoria: "liquidez",
    formula: "(Ativo Circulante − Estoques) ÷ Passivo Circulante",
    valor: liqSeca,
    valorFormatado: indice(liqSeca),
    unidade: "indice",
    classificacao: classificaMaiorMelhor(
      liqSeca,
      [
        { ate: 0.8, classe: "critico" },
        { ate: 1.0, classe: "atencao" },
      ],
      "saudavel",
    ),
    interpretacao:
      liqSeca === null
        ? "Não calculável: faltam estoques ou passivo circulante."
        : `Desconsiderando estoques, a empresa cobre ${indice(liqSeca)} de cada R$ 1,00 de dívida de curto prazo.`,
    recomendacao:
      liqSeca !== null && liqSeca < 0.8
        ? "Forte dependência de estoques para honrar dívidas: revisar giro e composição dos estoques."
        : "Situação confortável quanto à dependência de estoques.",
  });

  const liqImediata = div(ex.balanco.ativoCirculante.caixaEquivalentes, b.passivoCirculante);
  add({
    chave: "liquidez_imediata",
    nome: "Liquidez Imediata",
    categoria: "liquidez",
    formula: "Caixa e Equivalentes ÷ Passivo Circulante",
    valor: liqImediata,
    valorFormatado: indice(liqImediata),
    unidade: "indice",
    classificacao: classificaMaiorMelhor(
      liqImediata,
      [
        { ate: 0.1, classe: "atencao" },
        { ate: 0.2, classe: "atencao" },
      ],
      "saudavel",
    ),
    interpretacao:
      liqImediata === null
        ? "Não calculável: falta caixa ou passivo circulante."
        : `A empresa quita imediatamente ${percentual(liqImediata)} de suas dívidas de curto prazo apenas com caixa.`,
    recomendacao:
      "Disponibilidade imediata muito alta também pode indicar caixa ocioso; muito baixa, risco de liquidez.",
  });

  const ativoCircLP = soma(b.ativoCirculante, ex.balanco.ativoNaoCirculante.realizavelLongoPrazo);
  const liqGeral = div(ativoCircLP, b.capitalTerceiros);
  add({
    chave: "liquidez_geral",
    nome: "Liquidez Geral",
    categoria: "liquidez",
    formula: "(Ativo Circulante + Realizável a LP) ÷ (Passivo Circulante + Passivo Não Circulante)",
    valor: liqGeral,
    valorFormatado: indice(liqGeral),
    unidade: "indice",
    classificacao: classificaMaiorMelhor(
      liqGeral,
      [
        { ate: 0.8, classe: "critico" },
        { ate: 1.0, classe: "atencao" },
      ],
      "saudavel",
    ),
    interpretacao:
      liqGeral === null
        ? "Não calculável por ausência de dados."
        : `Considerando curto e longo prazo, há ${indice(liqGeral)} de recursos para cada R$ 1,00 de dívida total.`,
    recomendacao:
      liqGeral !== null && liqGeral < 1
        ? "O total de dívidas supera os recursos realizáveis: atenção à solvência de longo prazo."
        : "Estrutura de solvência adequada no horizonte total.",
  });

  // ---------- ENDIVIDAMENTO / ESTRUTURA ----------
  const endividamentoGeral = div(b.capitalTerceiros, b.ativoTotal);
  add({
    chave: "endividamento_geral",
    nome: "Endividamento Geral",
    categoria: "endividamento",
    formula: "Capital de Terceiros ÷ Ativo Total",
    valor: endividamentoGeral,
    valorFormatado: percentual(endividamentoGeral),
    unidade: "percentual",
    classificacao: classificaMenorMelhor(
      endividamentoGeral,
      [
        { ate: 0.6, classe: "saudavel" },
        { ate: 0.8, classe: "atencao" },
      ],
      "critico",
    ),
    interpretacao:
      endividamentoGeral === null
        ? "Não calculável por ausência de dados."
        : `${percentual(endividamentoGeral)} do ativo é financiado por capital de terceiros (dívidas).`,
    recomendacao:
      endividamentoGeral !== null && endividamentoGeral > 0.8
        ? "Endividamento elevado: priorizar geração de caixa e redução de passivos onerosos."
        : "Nível de endividamento dentro de parâmetros administráveis.",
  });

  const composicaoEndiv = div(b.passivoCirculante, b.capitalTerceiros);
  add({
    chave: "composicao_endividamento",
    nome: "Composição do Endividamento",
    categoria: "endividamento",
    formula: "Passivo Circulante ÷ Capital de Terceiros",
    valor: composicaoEndiv,
    valorFormatado: percentual(composicaoEndiv),
    unidade: "percentual",
    classificacao: classificaMenorMelhor(
      composicaoEndiv,
      [
        { ate: 0.5, classe: "saudavel" },
        { ate: 0.7, classe: "atencao" },
      ],
      "critico",
    ),
    interpretacao:
      composicaoEndiv === null
        ? "Não calculável por ausência de dados."
        : `${percentual(composicaoEndiv)} das dívidas vencem no curto prazo.`,
    recomendacao:
      composicaoEndiv !== null && composicaoEndiv > 0.7
        ? "Dívida concentrada no curto prazo pressiona o caixa: buscar alongamento de prazos."
        : "Perfil de vencimento das dívidas equilibrado.",
  });

  const participacaoTerceiros = div(b.capitalTerceiros, plPositivo);
  add({
    chave: "participacao_terceiros",
    nome: "Participação de Capital de Terceiros",
    categoria: "endividamento",
    formula: "Capital de Terceiros ÷ Patrimônio Líquido",
    valor: participacaoTerceiros,
    valorFormatado: percentual(participacaoTerceiros),
    unidade: "percentual",
    classificacao: classificaMenorMelhor(
      participacaoTerceiros,
      [
        { ate: 1.0, classe: "saudavel" },
        { ate: 2.0, classe: "atencao" },
      ],
      "critico",
    ),
    interpretacao:
      participacaoTerceiros === null
        ? "Não calculável (PL ausente ou negativo)."
        : `Para cada R$ 1,00 de capital próprio há ${indice(participacaoTerceiros)} de capital de terceiros.`,
    recomendacao:
      participacaoTerceiros !== null && participacaoTerceiros > 2
        ? "Forte dependência de capital de terceiros: avaliar capitalização/reforço do PL."
        : "Relação entre capital próprio e de terceiros equilibrada.",
  });

  const ativoPermanente = soma(
    ex.balanco.ativoNaoCirculante.investimentos,
    ex.balanco.ativoNaoCirculante.imobilizado,
    ex.balanco.ativoNaoCirculante.intangivel,
  );
  const imobilizacaoPL = div(ativoPermanente, plPositivo);
  add({
    chave: "imobilizacao_pl",
    nome: "Imobilização do Patrimônio Líquido",
    categoria: "estrutura",
    formula: "(Investimentos + Imobilizado + Intangível) ÷ Patrimônio Líquido",
    valor: imobilizacaoPL,
    valorFormatado: percentual(imobilizacaoPL),
    unidade: "percentual",
    classificacao: classificaMenorMelhor(
      imobilizacaoPL,
      [
        { ate: 0.5, classe: "saudavel" },
        { ate: 1.0, classe: "atencao" },
      ],
      "critico",
    ),
    interpretacao:
      imobilizacaoPL === null
        ? "Não calculável (PL ausente ou negativo)."
        : `${percentual(imobilizacaoPL)} do capital próprio está aplicado em ativos de longo prazo.`,
    recomendacao:
      imobilizacaoPL !== null && imobilizacaoPL > 1
        ? "PL totalmente comprometido com ativos fixos: capital de giro financiado por terceiros."
        : "Sobra de capital próprio para financiar o giro.",
  });

  // ---------- RENTABILIDADE ----------
  const margemBruta = div(r.lucroBruto, r.receitaLiquida);
  add({
    chave: "margem_bruta",
    nome: "Margem Bruta",
    categoria: "rentabilidade",
    formula: "Lucro Bruto ÷ Receita Líquida",
    valor: margemBruta,
    valorFormatado: percentual(margemBruta),
    unidade: "percentual",
    classificacao: classificaMaiorMelhor(
      margemBruta,
      [
        { ate: 0.1, classe: "critico" },
        { ate: 0.25, classe: "atencao" },
      ],
      "saudavel",
    ),
    interpretacao:
      margemBruta === null
        ? "Não calculável por ausência de receita ou custos."
        : `Sobram ${percentual(margemBruta)} da receita líquida após os custos diretos.`,
    recomendacao:
      margemBruta !== null && margemBruta < 0.1
        ? "Margem bruta apertada: revisar precificação e custos diretos."
        : "Margem bruta consistente com a operação.",
  });

  const margemOperacional = div(r.resultadoOperacional, r.receitaLiquida);
  add({
    chave: "margem_operacional",
    nome: "Margem Operacional",
    categoria: "rentabilidade",
    formula: "Resultado Operacional ÷ Receita Líquida",
    valor: margemOperacional,
    valorFormatado: percentual(margemOperacional),
    unidade: "percentual",
    classificacao: classificaMaiorMelhor(
      margemOperacional,
      [
        { ate: 0.0, classe: "critico" },
        { ate: 0.08, classe: "atencao" },
      ],
      "saudavel",
    ),
    interpretacao:
      margemOperacional === null
        ? "Não calculável por ausência de dados."
        : `A operação principal gera ${percentual(margemOperacional)} de resultado sobre a receita líquida.`,
    recomendacao:
      margemOperacional !== null && margemOperacional < 0
        ? "Operação deficitária antes do resultado financeiro: revisar estrutura de despesas."
        : "Operação principal rentável.",
  });

  const margemLiquida = div(r.resultadoLiquido, r.receitaLiquida);
  add({
    chave: "margem_liquida",
    nome: "Margem Líquida",
    categoria: "rentabilidade",
    formula: "Resultado Líquido ÷ Receita Líquida",
    valor: margemLiquida,
    valorFormatado: percentual(margemLiquida),
    unidade: "percentual",
    classificacao: classificaMaiorMelhor(
      margemLiquida,
      [
        { ate: 0.0, classe: "critico" },
        { ate: 0.05, classe: "atencao" },
      ],
      "saudavel",
    ),
    interpretacao:
      margemLiquida === null
        ? "Não calculável por ausência de dados."
        : `De cada R$ 100 de receita líquida, sobram ${moeda((margemLiquida ?? 0) * 100)} de lucro líquido.`,
    recomendacao:
      margemLiquida !== null && margemLiquida < 0
        ? "Resultado líquido negativo: prejuízo no período exige plano de recuperação."
        : "Resultado líquido positivo.",
  });

  const roa = div(r.resultadoLiquido, b.ativoTotal);
  add({
    chave: "roa",
    nome: "Retorno sobre o Ativo (ROA)",
    categoria: "rentabilidade",
    formula: "Resultado Líquido ÷ Ativo Total",
    valor: roa,
    valorFormatado: percentual(roa),
    unidade: "percentual",
    classificacao: classificaMaiorMelhor(
      roa,
      [
        { ate: 0.0, classe: "critico" },
        { ate: 0.05, classe: "atencao" },
      ],
      "saudavel",
    ),
    interpretacao:
      roa === null
        ? "Não calculável por ausência de dados."
        : `Cada R$ 1,00 investido em ativos gerou ${moeda(roa ?? 0)} de lucro líquido no período.`,
    recomendacao:
      "Comparar com o custo médio das dívidas: ROA abaixo do custo da dívida destrói valor.",
  });

  const roe = div(r.resultadoLiquido, plPositivo);
  add({
    chave: "roe",
    nome: "Retorno sobre o Patrimônio Líquido (ROE)",
    categoria: "rentabilidade",
    formula: "Resultado Líquido ÷ Patrimônio Líquido",
    valor: roe,
    valorFormatado: percentual(roe),
    unidade: "percentual",
    classificacao: classificaMaiorMelhor(
      roe,
      [
        { ate: 0.0, classe: "critico" },
        { ate: 0.08, classe: "atencao" },
      ],
      "saudavel",
    ),
    interpretacao:
      roe === null
        ? "Não calculável (PL ausente ou negativo)."
        : `O capital próprio rendeu ${percentual(roe)} no período.`,
    recomendacao:
      "Confrontar com aplicações de baixo risco; ROE persistentemente baixo questiona a remuneração do sócio.",
  });

  const giroAtivo = div(r.receitaLiquida, b.ativoTotal);
  add({
    chave: "giro_ativo",
    nome: "Giro do Ativo",
    categoria: "atividade",
    formula: "Receita Líquida ÷ Ativo Total",
    valor: giroAtivo,
    valorFormatado: indice(giroAtivo),
    unidade: "indice",
    classificacao: classificaMaiorMelhor(
      giroAtivo,
      [
        { ate: 0.5, classe: "atencao" },
        { ate: 1.0, classe: "atencao" },
      ],
      "saudavel",
    ),
    interpretacao:
      giroAtivo === null
        ? "Não calculável por ausência de dados."
        : `Cada R$ 1,00 de ativo gerou ${moeda(giroAtivo ?? 0)} de receita líquida.`,
    recomendacao: "Giro baixo sugere ativos subutilizados; alto, boa eficiência operacional.",
  });

  // ---------- ATIVIDADE (PRAZOS) ----------
  const pmr = div(
    ex.balanco.ativoCirculante.contasReceber,
    ex.dre.receitaBrutaVendas,
  );
  const pmrDias = pmr === null ? null : pmr * 360;
  add({
    chave: "pmr",
    nome: "Prazo Médio de Recebimento",
    categoria: "atividade",
    formula: "(Contas a Receber ÷ Receita Bruta) × 360",
    valor: pmrDias,
    valorFormatado: dias(pmrDias),
    unidade: "dias",
    classificacao:
      pmrDias === null
        ? "inconclusivo"
        : pmrDias <= 45
          ? "saudavel"
          : pmrDias <= 90
            ? "atencao"
            : "critico",
    interpretacao:
      pmrDias === null
        ? "Não calculável: faltam contas a receber ou receita bruta."
        : `A empresa leva, em média, ${dias(pmrDias)} para receber de seus clientes.`,
    recomendacao: "Comparar com o prazo de pagamento a fornecedores para avaliar o ciclo financeiro.",
  });

  const pmp = div(ex.balanco.passivoCirculante.fornecedores, ex.dre.custos);
  const pmpDias = pmp === null ? null : pmp * 360;
  add({
    chave: "pmp",
    nome: "Prazo Médio de Pagamento",
    categoria: "atividade",
    formula: "(Fornecedores ÷ Custos) × 360",
    valor: pmpDias,
    valorFormatado: dias(pmpDias),
    unidade: "dias",
    classificacao: "inconclusivo",
    interpretacao:
      pmpDias === null
        ? "Não calculável: faltam fornecedores ou custos."
        : `A empresa paga seus fornecedores, em média, em ${dias(pmpDias)}.`,
    recomendacao:
      pmrDias !== null && pmpDias !== null && pmpDias < pmrDias
        ? "Paga antes de receber: o ciclo financeiro pressiona o caixa e exige capital de giro."
        : "Prazo de pagamento favorável ao fluxo de caixa.",
  });

  // ---------- CAPITAL DE GIRO ----------
  const acOperacional = soma(
    ex.balanco.ativoCirculante.contasReceber,
    ex.balanco.ativoCirculante.estoques,
    ex.balanco.ativoCirculante.tributosRecuperar,
  );
  const pcOperacional = soma(
    ex.balanco.passivoCirculante.fornecedores,
    ex.balanco.passivoCirculante.obrigacoesTrabalhistas,
    ex.balanco.passivoCirculante.obrigacoesTributarias,
  );
  const ncg = acOperacional === null || pcOperacional === null ? null : acOperacional - pcOperacional;
  add({
    chave: "ncg",
    nome: "Necessidade de Capital de Giro",
    categoria: "atividade",
    formula: "Ativo Circulante Operacional − Passivo Circulante Operacional",
    valor: ncg,
    valorFormatado: moeda(ncg),
    unidade: "moeda",
    classificacao: "inconclusivo",
    interpretacao:
      ncg === null
        ? "Não calculável por ausência de dados operacionais."
        : ncg > 0
          ? `A operação demanda ${moeda(ncg)} de capital de giro para sustentar o ciclo.`
          : `A operação gera folga de ${moeda(Math.abs(ncg))} (fornecedores financiam o giro).`,
    recomendacao: "NCG crescente sem geração de caixa correspondente pressiona o endividamento de curto prazo.",
  });

  const caixaFin = ex.balanco.ativoCirculante.caixaEquivalentes;
  const emprestimosCP = ex.balanco.passivoCirculante.emprestimosFinanciamentos;
  const saldoTesouraria =
    caixaFin === null && emprestimosCP === null ? null : (caixaFin ?? 0) - (emprestimosCP ?? 0);
  add({
    chave: "saldo_tesouraria",
    nome: "Saldo de Tesouraria",
    categoria: "atividade",
    formula: "Caixa e Equivalentes − Empréstimos de Curto Prazo",
    valor: saldoTesouraria,
    valorFormatado: moeda(saldoTesouraria),
    unidade: "moeda",
    classificacao:
      saldoTesouraria === null ? "inconclusivo" : saldoTesouraria >= 0 ? "saudavel" : "critico",
    interpretacao:
      saldoTesouraria === null
        ? "Não calculável por ausência de dados."
        : saldoTesouraria >= 0
          ? `Há folga financeira de ${moeda(saldoTesouraria)} em recursos próprios de curtíssimo prazo.`
          : `Tesouraria negativa de ${moeda(Math.abs(saldoTesouraria))}: o giro é bancado por dívida onerosa de curto prazo.`,
    recomendacao:
      saldoTesouraria !== null && saldoTesouraria < 0
        ? "Sinal de aperto de liquidez (efeito tesoura): revisar fontes de financiamento do giro."
        : "Tesouraria equilibrada.",
  });

  // ---------- EBITDA ----------
  add({
    chave: "ebitda",
    nome: "EBITDA",
    categoria: "rentabilidade",
    formula: "Resultado Operacional + Depreciação/Amortização",
    valor: r.ebitda,
    valorFormatado: moeda(r.ebitda),
    unidade: "moeda",
    classificacao:
      r.ebitda === null ? "inconclusivo" : r.ebitda > 0 ? "saudavel" : "critico",
    interpretacao:
      r.ebitda === null
        ? "Não calculável: depreciação/amortização não informada."
        : `Geração operacional de caixa (antes de juros, impostos e depreciação) de ${moeda(r.ebitda)}.`,
    recomendacao: "EBITDA negativo indica que a operação não gera caixa próprio.",
  });

  return ind;
}

/** Resumo de quantos indicadores caíram em cada classificação. */
export function resumoClassificacoes(indicadores: Indicador[]) {
  const r = { saudavel: 0, atencao: 0, critico: 0, inconclusivo: 0 };
  for (const i of indicadores) r[i.classificacao]++;
  return r;
}

export type { TotaisExercicio };
