/**
 * Cruzamento ano a ano (análise horizontal) dos principais agregados
 * patrimoniais e de resultado, além da evolução dos próprios indicadores.
 */

import { resultadosDRE, totaisBalanco } from "./compute";
import { calcularIndicadores } from "./indicators";
import { variacaoPct } from "./format";
import type { DemonstrativosExercicio, Maybe } from "./types";

export interface LinhaEvolucao {
  rotulo: string;
  /** Valores por ano (mesma ordem de `anos`). */
  valores: Maybe[];
  /** Variação percentual do primeiro para o último ano. */
  variacaoTotal: Maybe;
  /** "moeda" | "percentual" | "indice" — para formatação na UI. */
  unidade: "moeda" | "percentual" | "indice";
}

export interface Cruzamento {
  anos: number[];
  patrimonial: LinhaEvolucao[];
  resultado: LinhaEvolucao[];
  indicadores: LinhaEvolucao[];
}

/** Recebe exercícios em qualquer ordem; ordena por ano crescente. */
export function cruzarExercicios(exercicios: DemonstrativosExercicio[]): Cruzamento {
  const ordenados = [...exercicios].sort((a, b) => a.ano - b.ano);
  const anos = ordenados.map((e) => e.ano);

  const balancos = ordenados.map((e) => totaisBalanco(e.balanco));
  const dres = ordenados.map((e) => resultadosDRE(e.dre));

  const linha = (
    rotulo: string,
    valores: Maybe[],
    unidade: LinhaEvolucao["unidade"],
  ): LinhaEvolucao => ({
    rotulo,
    valores,
    variacaoTotal: variacaoPct(valores[0], valores[valores.length - 1]),
    unidade,
  });

  const patrimonial: LinhaEvolucao[] = [
    linha("Ativo total", balancos.map((b) => b.ativoTotal), "moeda"),
    linha("Ativo circulante", balancos.map((b) => b.ativoCirculante), "moeda"),
    linha("Ativo não circulante", balancos.map((b) => b.ativoNaoCirculante), "moeda"),
    linha("Passivo circulante", balancos.map((b) => b.passivoCirculante), "moeda"),
    linha("Passivo não circulante", balancos.map((b) => b.passivoNaoCirculante), "moeda"),
    linha("Capital de terceiros", balancos.map((b) => b.capitalTerceiros), "moeda"),
    linha("Patrimônio líquido", balancos.map((b) => b.patrimonioLiquido), "moeda"),
  ];

  const resultado: LinhaEvolucao[] = [
    linha("Receita líquida", dres.map((d) => d.receitaLiquida), "moeda"),
    linha("Lucro bruto", dres.map((d) => d.lucroBruto), "moeda"),
    linha("Resultado operacional", dres.map((d) => d.resultadoOperacional), "moeda"),
    linha("Resultado antes dos tributos", dres.map((d) => d.resultadoAntesTributos), "moeda"),
    linha("Resultado líquido", dres.map((d) => d.resultadoLiquido), "moeda"),
    linha("EBITDA", dres.map((d) => d.ebitda), "moeda"),
  ];

  // Evolução dos indicadores-chave
  const indicadoresPorAno = ordenados.map((e) => calcularIndicadores(e));
  const chavesAcompanhadas = [
    "liquidez_corrente",
    "endividamento_geral",
    "margem_liquida",
    "roe",
    "roa",
  ];
  const indicadores: LinhaEvolucao[] = chavesAcompanhadas.map((chave) => {
    const primeiro = indicadoresPorAno[0].find((i) => i.chave === chave)!;
    const valores = indicadoresPorAno.map(
      (lista) => lista.find((i) => i.chave === chave)?.valor ?? null,
    );
    const unidade: LinhaEvolucao["unidade"] =
      primeiro.unidade === "percentual" ? "percentual" : "indice";
    return linha(primeiro.nome, valores, unidade);
  });

  return { anos, patrimonial, resultado, indicadores };
}
