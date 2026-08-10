/**
 * Conciliação Domínio × ECD — compara dois exercícios (mesmo ano, mesmo
 * cliente) campo a campo e devolve as divergências.
 *
 * Estratégia:
 *  1. Compara TOTAIS DE GRUPO (AC, ANC, PC, PNC, PL, Ativo, Passivo+PL,
 *     Resultado). Divergência aqui é a mais grave — significa que os dois
 *     documentos não representam o mesmo balanço.
 *  2. Compara CONTAS DE DETALHE. Divergência aqui pode ser reclassificação
 *     (ex.: o Domínio classificou algo em PL.lucros, a ECD em PNC.outros) e
 *     é útil pra o contador identificar o que reagrupar.
 *
 * Aplica-se apenas a clientes Lucro Real/Presumido. Simples Nacional NÃO
 * entrega ECD — usar conciliação × DEFIS. Ver [[project-conciliacao-balanco-por-regime]].
 */

import type { DemonstrativosExercicio, Maybe } from "./types";
import { totaisBalanco, resultadosDRE } from "./compute";
import { moeda } from "./format";

/** Uma linha do quadro comparativo. */
export interface LinhaConciliacao {
  categoria: "total" | "detalhe";
  grupo: "ativo" | "passivo" | "pl" | "resultado" | "geral";
  campo: string;
  rotulo: string;
  valorDominio: Maybe;
  valorEcd: Maybe;
  diferenca: Maybe;
  /** true quando |dif| > 0,5% do valor absoluto do maior lado, com piso de R$ 1. */
  divergente: boolean;
}

export interface RelatorioConciliacao {
  ano: number;
  linhas: LinhaConciliacao[];
  divergenciasCriticas: LinhaConciliacao[]; // totais que divergem
  divergenciasDetalhe: LinhaConciliacao[]; // reclassificações
  fecha: boolean; // true se nenhuma divergência crítica
}

const TOLERANCIA_REL = 0.005; // 0,5%
const TOLERANCIA_ABS = 1.0; // R$ 1

function ehDivergente(valDom: Maybe, valEcd: Maybe): boolean {
  const a = valDom ?? 0;
  const b = valEcd ?? 0;
  const dif = Math.abs(a - b);
  if (dif <= TOLERANCIA_ABS) return false;
  const base = Math.max(Math.abs(a), Math.abs(b), 1);
  return dif / base > TOLERANCIA_REL;
}

function linha(
  categoria: LinhaConciliacao["categoria"],
  grupo: LinhaConciliacao["grupo"],
  campo: string,
  rotulo: string,
  valorDominio: Maybe,
  valorEcd: Maybe,
): LinhaConciliacao {
  const dif =
    valorDominio === null && valorEcd === null
      ? null
      : (valorDominio ?? 0) - (valorEcd ?? 0);
  return {
    categoria,
    grupo,
    campo,
    rotulo,
    valorDominio,
    valorEcd,
    diferenca: dif,
    divergente: ehDivergente(valorDominio, valorEcd),
  };
}

/** Compara dois exercícios já parseados. */
export function conciliar(
  dominio: DemonstrativosExercicio,
  ecd: DemonstrativosExercicio,
): RelatorioConciliacao {
  const bD = totaisBalanco(dominio.balanco);
  const bE = totaisBalanco(ecd.balanco);
  const rD = resultadosDRE(dominio.dre);
  const rE = resultadosDRE(ecd.dre);

  const linhas: LinhaConciliacao[] = [
    // ---- Totais de grupo (mais importantes) ----
    linha("total", "ativo", "ac.total", "Total Ativo Circulante", bD.ativoCirculante, bE.ativoCirculante),
    linha("total", "ativo", "anc.total", "Total Ativo Não Circulante", bD.ativoNaoCirculante, bE.ativoNaoCirculante),
    linha("total", "ativo", "ativoTotal", "TOTAL DO ATIVO", bD.ativoTotal, bE.ativoTotal),
    linha("total", "passivo", "pc.total", "Total Passivo Circulante", bD.passivoCirculante, bE.passivoCirculante),
    linha("total", "passivo", "pnc.total", "Total Passivo Não Circulante", bD.passivoNaoCirculante, bE.passivoNaoCirculante),
    linha("total", "pl", "pl.total", "Total Patrimônio Líquido", bD.patrimonioLiquido, bE.patrimonioLiquido),
    linha("total", "geral", "passivoMaisPL", "TOTAL PASSIVO + PL", bD.passivoMaisPL, bE.passivoMaisPL),
    linha("total", "resultado", "dre.receitaLiquida", "Receita Líquida", rD.receitaLiquida, rE.receitaLiquida),
    linha("total", "resultado", "dre.lucroBruto", "Lucro Bruto", rD.lucroBruto, rE.lucroBruto),
    linha("total", "resultado", "dre.resultadoAntesTributos", "Resultado Antes dos Tributos (LAIR)", dominio.dre.resultadoAntesTributos ?? null, ecd.dre.resultadoAntesTributos ?? null),
    linha("total", "resultado", "dre.resultadoLiquido", "Resultado Líquido do Exercício", rD.resultadoLiquido, rE.resultadoLiquido),
    linha("total", "resultado", "dre.resultadoInformado", "Resultado Líquido Informado", dominio.dre.resultadoLiquidoInformado ?? null, ecd.dre.resultadoLiquidoInformado ?? null),
    // ---- Detalhes do balanço ----
    linha("detalhe", "ativo", "ac.caixaEquivalentes", "Caixa e Equivalentes", dominio.balanco.ativoCirculante.caixaEquivalentes, ecd.balanco.ativoCirculante.caixaEquivalentes),
    linha("detalhe", "ativo", "ac.contasReceber", "Contas a Receber", dominio.balanco.ativoCirculante.contasReceber, ecd.balanco.ativoCirculante.contasReceber),
    linha("detalhe", "ativo", "ac.estoques", "Estoques", dominio.balanco.ativoCirculante.estoques, ecd.balanco.ativoCirculante.estoques),
    linha("detalhe", "ativo", "ac.tributosRecuperar", "Tributos a Recuperar", dominio.balanco.ativoCirculante.tributosRecuperar, ecd.balanco.ativoCirculante.tributosRecuperar),
    linha("detalhe", "ativo", "ac.outros", "AC — Outros", dominio.balanco.ativoCirculante.outros, ecd.balanco.ativoCirculante.outros),
    linha("detalhe", "ativo", "anc.imobilizado", "Imobilizado", dominio.balanco.ativoNaoCirculante.imobilizado, ecd.balanco.ativoNaoCirculante.imobilizado),
    linha("detalhe", "passivo", "pc.fornecedores", "Fornecedores", dominio.balanco.passivoCirculante.fornecedores, ecd.balanco.passivoCirculante.fornecedores),
    linha("detalhe", "passivo", "pc.emprestimosFinanciamentos", "Empréstimos (CP)", dominio.balanco.passivoCirculante.emprestimosFinanciamentos, ecd.balanco.passivoCirculante.emprestimosFinanciamentos),
    linha("detalhe", "passivo", "pc.obrigacoesTrabalhistas", "Obrigações Trabalhistas", dominio.balanco.passivoCirculante.obrigacoesTrabalhistas, ecd.balanco.passivoCirculante.obrigacoesTrabalhistas),
    linha("detalhe", "passivo", "pc.obrigacoesTributarias", "Obrigações Tributárias", dominio.balanco.passivoCirculante.obrigacoesTributarias, ecd.balanco.passivoCirculante.obrigacoesTributarias),
    linha("detalhe", "passivo", "pnc.emprestimosFinanciamentos", "Empréstimos (LP)", dominio.balanco.passivoNaoCirculante.emprestimosFinanciamentos, ecd.balanco.passivoNaoCirculante.emprestimosFinanciamentos),
    linha("detalhe", "passivo", "pnc.outros", "PNC — Outros", dominio.balanco.passivoNaoCirculante.outros, ecd.balanco.passivoNaoCirculante.outros),
    linha("detalhe", "pl", "pl.capitalSocial", "Capital Social", dominio.balanco.patrimonioLiquido.capitalSocial, ecd.balanco.patrimonioLiquido.capitalSocial),
    linha("detalhe", "pl", "pl.lucrosAcumulados", "Lucros Acumulados", dominio.balanco.patrimonioLiquido.lucrosAcumulados, ecd.balanco.patrimonioLiquido.lucrosAcumulados),
    linha("detalhe", "pl", "pl.prejuizosAcumulados", "Prejuízos Acumulados", dominio.balanco.patrimonioLiquido.prejuizosAcumulados, ecd.balanco.patrimonioLiquido.prejuizosAcumulados),
    // ---- Detalhes da DRE ----
    linha("detalhe", "resultado", "dre.receitaBrutaVendas", "Receita Bruta", dominio.dre.receitaBrutaVendas, ecd.dre.receitaBrutaVendas),
    linha("detalhe", "resultado", "dre.deducoes", "Deduções", dominio.dre.deducoes, ecd.dre.deducoes),
    linha("detalhe", "resultado", "dre.custos", "Custos (CMV)", dominio.dre.custos, ecd.dre.custos),
    linha("detalhe", "resultado", "dre.despesasOperacionais", "Despesas Operacionais", dominio.dre.despesasOperacionais, ecd.dre.despesasOperacionais),
  ];

  const divergenciasCriticas = linhas.filter((l) => l.categoria === "total" && l.divergente);
  const divergenciasDetalhe = linhas.filter((l) => l.categoria === "detalhe" && l.divergente);

  return {
    ano: dominio.ano,
    linhas,
    divergenciasCriticas,
    divergenciasDetalhe,
    fecha: divergenciasCriticas.length === 0,
  };
}

/** Formata uma linha para output CLI. */
export function formatarLinha(l: LinhaConciliacao): string {
  const marker = l.divergente ? "✗" : " ";
  const dom = l.valorDominio === null ? "-" : moeda(l.valorDominio);
  const ecd = l.valorEcd === null ? "-" : moeda(l.valorEcd);
  const dif = l.diferenca === null ? "-" : moeda(l.diferenca);
  return `  ${marker} ${l.rotulo.padEnd(35)} DOM: ${dom.padStart(18)}   ECD: ${ecd.padStart(18)}   DIF: ${dif.padStart(18)}`;
}
