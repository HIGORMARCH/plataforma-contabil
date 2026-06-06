/**
 * Orquestrador da análise: executa validações, calcula indicadores por
 * exercício, faz o cruzamento ano a ano e propõe uma conclusão geral.
 *
 * Regra central: havendo inconsistência que bloqueia, a conclusão é
 * "inconclusiva" — a plataforma NÃO emite parecer definitivo sem revisão
 * humana do contador.
 */

import { cruzarExercicios, type Cruzamento } from "./comparison";
import { calcularIndicadores, resumoClassificacoes } from "./indicators";
import {
  existeBloqueio,
  validarExercicio,
  validarVariacoes,
} from "./validation";
import type {
  Classificacao,
  DemonstrativosExercicio,
  Inconsistencia,
  Indicador,
} from "./types";

export type SituacaoGeral =
  | "favoravel"
  | "regular_com_atencao"
  | "critica"
  | "inconclusiva";

export interface AnaliseExercicio {
  ano: number;
  indicadores: Indicador[];
  inconsistencias: Inconsistencia[];
}

export interface ResultadoAnalise {
  exercicios: AnaliseExercicio[];
  /** Inconsistências de variação entre períodos. */
  inconsistenciasVariacao: Inconsistencia[];
  cruzamento: Cruzamento;
  /** true se alguma inconsistência bloqueia a conclusão automática. */
  bloqueado: boolean;
  situacao: SituacaoGeral;
  /** Indicadores do exercício mais recente, para destaque. */
  indicadoresRecentes: Indicador[];
  resumo: ReturnType<typeof resumoClassificacoes>;
}

function piorClassificacao(indicadores: Indicador[]): SituacaoGeral {
  const resumo = resumoClassificacoes(indicadores);
  const total = indicadores.length - resumo.inconclusivo;
  if (total <= 0) return "inconclusiva";
  if (resumo.critico >= 3) return "critica";
  if (resumo.critico >= 1 || resumo.atencao >= 4) return "regular_com_atencao";
  if (resumo.atencao >= 1) return "regular_com_atencao";
  return "favoravel";
}

export function analisar(exercicios: DemonstrativosExercicio[]): ResultadoAnalise {
  if (exercicios.length === 0) {
    throw new Error("Nenhum exercício fornecido para análise.");
  }
  const ordenados = [...exercicios].sort((a, b) => a.ano - b.ano);

  const analisesExercicio: AnaliseExercicio[] = ordenados.map((ex) => ({
    ano: ex.ano,
    indicadores: calcularIndicadores(ex),
    inconsistencias: validarExercicio(ex),
  }));

  // Variações entre períodos consecutivos.
  const inconsistenciasVariacao: Inconsistencia[] = [];
  for (let i = 1; i < ordenados.length; i++) {
    inconsistenciasVariacao.push(...validarVariacoes(ordenados[i - 1], ordenados[i]));
  }

  const cruzamento = cruzarExercicios(ordenados);

  const todasInconsistencias = [
    ...analisesExercicio.flatMap((a) => a.inconsistencias),
    ...inconsistenciasVariacao,
  ];
  const bloqueado = existeBloqueio(todasInconsistencias);

  const recente = analisesExercicio[analisesExercicio.length - 1];
  const situacao: SituacaoGeral = bloqueado
    ? "inconclusiva"
    : piorClassificacao(recente.indicadores);

  return {
    exercicios: analisesExercicio,
    inconsistenciasVariacao,
    cruzamento,
    bloqueado,
    situacao,
    indicadoresRecentes: recente.indicadores,
    resumo: resumoClassificacoes(recente.indicadores),
  };
}

export const ROTULO_SITUACAO: Record<SituacaoGeral, string> = {
  favoravel: "Situação favorável",
  regular_com_atencao: "Situação regular com pontos de atenção",
  critica: "Situação crítica",
  inconclusiva: "Análise inconclusiva por ausência ou inconsistência de dados",
};

export const ROTULO_CLASSIFICACAO: Record<Classificacao, string> = {
  saudavel: "Saudável",
  atencao: "Atenção",
  critico: "Crítico",
  inconclusivo: "Inconclusivo",
};
