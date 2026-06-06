/**
 * Validações contábeis automáticas executadas ANTES da análise.
 * Quando há inconsistência relevante (bloqueia=true), a plataforma não
 * emite conclusão definitiva — exige revisão do contador.
 */

import { resultadosDRE, totaisBalanco } from "./compute";
import { moeda, percentual } from "./format";
import type { DemonstrativosExercicio, Inconsistencia, Maybe } from "./types";

/** Tolerância relativa para conferência do balanço (0,5%). */
const TOLERANCIA = 0.005;

function relevante(diferenca: number, base: Maybe): boolean {
  if (base === null || base === 0) return diferenca !== 0;
  return Math.abs(diferenca) / Math.abs(base) > TOLERANCIA;
}

export function validarExercicio(ex: DemonstrativosExercicio): Inconsistencia[] {
  const problemas: Inconsistencia[] = [];
  const b = totaisBalanco(ex.balanco);
  const r = resultadosDRE(ex.dre);

  // 1) Ativo Total = Passivo + PL
  if (b.ativoTotal !== null && b.passivoMaisPL !== null) {
    const dif = b.ativoTotal - b.passivoMaisPL;
    if (relevante(dif, b.ativoTotal)) {
      problemas.push({
        codigo: "BP_NAO_FECHA",
        severidade: "critico",
        titulo: "Balanço não fecha",
        descricao: `Ativo Total (${moeda(b.ativoTotal)}) difere de Passivo + PL (${moeda(
          b.passivoMaisPL,
        )}) em ${moeda(dif)}. A equação patrimonial fundamental não se confirma.`,
        bloqueia: true,
      });
    }
  } else {
    problemas.push({
      codigo: "BP_INCOMPLETO",
      severidade: "critico",
      titulo: "Balanço incompleto",
      descricao: "Não há dados suficientes para conferir a equação Ativo = Passivo + Patrimônio Líquido.",
      bloqueia: true,
    });
  }

  // 2) Conferência do Ativo Total informado x calculado
  if (ex.balanco.ativoTotalInformado != null && b.ativoTotal !== null) {
    const dif = b.ativoTotal - ex.balanco.ativoTotalInformado;
    if (relevante(dif, ex.balanco.ativoTotalInformado)) {
      problemas.push({
        codigo: "ATIVO_DIVERGENTE",
        severidade: "atencao",
        titulo: "Ativo total divergente do informado",
        descricao: `Soma das contas do ativo (${moeda(b.ativoTotal)}) difere do total informado no documento (${moeda(
          ex.balanco.ativoTotalInformado,
        )}). Possível erro de digitação ou conta faltante.`,
        bloqueia: false,
      });
    }
  }

  // 3) Coerência entre o resultado da DRE e o informado
  if (ex.dre.resultadoLiquidoInformado != null && r.resultadoLiquido !== null) {
    const dif = r.resultadoLiquido - ex.dre.resultadoLiquidoInformado;
    if (relevante(dif, ex.dre.resultadoLiquidoInformado)) {
      problemas.push({
        codigo: "DRE_DIVERGENTE",
        severidade: "atencao",
        titulo: "Resultado da DRE divergente do informado",
        descricao: `Resultado líquido recalculado (${moeda(r.resultadoLiquido)}) difere do informado (${moeda(
          ex.dre.resultadoLiquidoInformado,
        )}). Verificar deduções, custos ou tributos.`,
        bloqueia: false,
      });
    }
  }

  // 4) Patrimônio Líquido negativo (passivo a descoberto).
  // NÃO é uma inconsistência de dados — é uma condição patrimonial REAL (desde
  // que o balanço feche). Não bloqueia a conclusão: a empresa pode e deve ser
  // analisada. A resolução é de natureza societária/estrutural (decisão dos
  // sócios e da administração), não um ajuste técnico-contábil.
  if (b.patrimonioLiquido !== null && b.patrimonioLiquido < 0) {
    problemas.push({
      codigo: "PL_NEGATIVO",
      severidade: "critico",
      titulo: "Patrimônio Líquido negativo (passivo a descoberto)",
      descricao: `O Patrimônio Líquido é negativo (${moeda(
        b.patrimonioLiquido,
      )}): as obrigações superam o ativo. Em geral reflete prejuízos acumulados de exercícios anteriores. É uma fragilidade patrimonial relevante cuja recomposição depende de deliberação societária (aporte/capitalização), não de correção contábil.`,
      bloqueia: false,
    });
  }

  // 5) Contas com saldo invertido (valores negativos onde se espera positivo)
  const contasPositivas: Array<[string, Maybe]> = [
    ["Caixa e equivalentes", ex.balanco.ativoCirculante.caixaEquivalentes],
    ["Contas a receber", ex.balanco.ativoCirculante.contasReceber],
    ["Estoques", ex.balanco.ativoCirculante.estoques],
    ["Imobilizado", ex.balanco.ativoNaoCirculante.imobilizado],
    ["Fornecedores", ex.balanco.passivoCirculante.fornecedores],
    ["Capital social", ex.balanco.patrimonioLiquido.capitalSocial],
  ];
  for (const [nome, valor] of contasPositivas) {
    if (valor !== null && valor < 0) {
      problemas.push({
        codigo: "SALDO_INVERTIDO",
        severidade: "atencao",
        titulo: `Saldo invertido: ${nome}`,
        descricao: `A conta "${nome}" apresenta saldo negativo (${moeda(
          valor,
        )}), o que normalmente indica erro de classificação contábil.`,
        bloqueia: false,
      });
    }
  }

  // 6) Ausência de contas essenciais
  const essenciais: Array<[string, Maybe]> = [
    ["Receita bruta de vendas", ex.dre.receitaBrutaVendas],
    ["Passivo circulante", b.passivoCirculante],
    ["Ativo circulante", b.ativoCirculante],
    ["Patrimônio líquido", b.patrimonioLiquido],
  ];
  for (const [nome, valor] of essenciais) {
    if (valor === null) {
      problemas.push({
        codigo: "CONTA_ESSENCIAL_AUSENTE",
        severidade: "atencao",
        titulo: `Conta essencial ausente: ${nome}`,
        descricao: `Não há dados de "${nome}", o que limita a análise e a confiabilidade de indicadores dependentes.`,
        bloqueia: false,
      });
    }
  }

  // 7) Indício de distribuição de lucros incompatível com prejuízos acumulados
  const prejuizo = ex.balanco.patrimonioLiquido.prejuizosAcumulados ?? 0;
  const lucros = ex.balanco.patrimonioLiquido.lucrosAcumulados ?? 0;
  if (prejuizo > 0 && lucros > 0) {
    problemas.push({
      codigo: "LUCRO_E_PREJUIZO",
      severidade: "atencao",
      titulo: "Lucros e prejuízos acumulados simultâneos",
      descricao:
        "Há lucros acumulados e prejuízos acumulados ao mesmo tempo. Reservas/prejuízos devem ser compensados — verificar classificação no PL.",
      bloqueia: false,
    });
  }

  return problemas;
}

/** Compara dois exercícios e sinaliza variações relevantes entre períodos. */
export function validarVariacoes(
  anterior: DemonstrativosExercicio,
  atual: DemonstrativosExercicio,
  limiteVariacao = 0.5, // 50%
): Inconsistencia[] {
  const problemas: Inconsistencia[] = [];
  const ba = totaisBalanco(anterior.balanco);
  const bb = totaisBalanco(atual.balanco);

  const checar = (nome: string, base: Maybe, novo: Maybe) => {
    if (base === null || base === 0 || novo === null) return;
    const variacao = (novo - base) / Math.abs(base);
    if (Math.abs(variacao) > limiteVariacao) {
      problemas.push({
        codigo: "VARIACAO_RELEVANTE",
        severidade: "info",
        titulo: `Variação relevante: ${nome}`,
        descricao: `${nome} variou ${percentual(variacao)} de ${anterior.ano} para ${atual.ano} (${moeda(
          base,
        )} → ${moeda(novo)}). Confirmar se a oscilação tem respaldo documental.`,
        bloqueia: false,
      });
    }
  };

  checar("Ativo total", ba.ativoTotal, bb.ativoTotal);
  checar("Patrimônio líquido", ba.patrimonioLiquido, bb.patrimonioLiquido);
  checar("Capital de terceiros", ba.capitalTerceiros, bb.capitalTerceiros);
  checar("Estoques", anterior.balanco.ativoCirculante.estoques, atual.balanco.ativoCirculante.estoques);
  checar("Contas a receber", anterior.balanco.ativoCirculante.contasReceber, atual.balanco.ativoCirculante.contasReceber);

  return problemas;
}

/** Há ao menos uma inconsistência que bloqueia a conclusão automática? */
export function existeBloqueio(problemas: Inconsistencia[]): boolean {
  return problemas.some((p) => p.bloqueia);
}
