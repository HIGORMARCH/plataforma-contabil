import { describe, expect, it } from "vitest";
import { resultadosDRE, totaisBalanco } from "./compute";
import { calcularIndicadores } from "./indicators";
import { validarExercicio, existeBloqueio } from "./validation";
import { analisar } from "./analyze";
import { cruzarExercicios } from "./comparison";
import { EXERCICIO_2024, EXERCICIOS_EXEMPLO } from "./sample";
import type { DemonstrativosExercicio } from "./types";

const val = (lista: ReturnType<typeof calcularIndicadores>, chave: string) =>
  lista.find((i) => i.chave === chave)?.valor ?? null;

describe("compute - totais do balanço", () => {
  const t = totaisBalanco(EXERCICIO_2024.balanco);
  it("soma o ativo circulante", () => {
    expect(t.ativoCirculante).toBe(800000);
  });
  it("soma o ativo total", () => {
    expect(t.ativoTotal).toBe(1500000);
  });
  it("fecha o balanço (Ativo = Passivo + PL)", () => {
    expect(t.ativoTotal).toBe(t.passivoMaisPL);
  });
  it("calcula o PL", () => {
    expect(t.patrimonioLiquido).toBe(700000);
  });
});

describe("compute - resultados da DRE", () => {
  const r = resultadosDRE(EXERCICIO_2024.dre);
  it("receita líquida", () => expect(r.receitaLiquida).toBe(2100000));
  it("lucro bruto", () => expect(r.lucroBruto).toBe(700000));
  it("resultado operacional", () => expect(r.resultadoOperacional).toBe(250000));
  it("resultado líquido bate com o informado", () => {
    expect(r.resultadoLiquido).toBe(130000);
  });
  it("EBITDA", () => expect(r.ebitda).toBe(330000));
});

describe("indicadores", () => {
  const ind = calcularIndicadores(EXERCICIO_2024);
  it("liquidez corrente = AC/PC = 800000/500000", () => {
    expect(val(ind, "liquidez_corrente")).toBeCloseTo(1.6, 5);
  });
  it("liquidez seca = (800000-350000)/500000", () => {
    expect(val(ind, "liquidez_seca")).toBeCloseTo(0.9, 5);
  });
  it("endividamento geral = 800000/1500000", () => {
    expect(val(ind, "endividamento_geral")).toBeCloseTo(0.5333, 3);
  });
  it("margem líquida = 130000/2100000", () => {
    expect(val(ind, "margem_liquida")).toBeCloseTo(0.061904, 4);
  });
  it("ROE = 130000/700000", () => {
    expect(val(ind, "roe")).toBeCloseTo(0.18571, 4);
  });
});

describe("validação", () => {
  it("exemplo válido não tem bloqueio", () => {
    expect(existeBloqueio(validarExercicio(EXERCICIO_2024))).toBe(false);
  });

  it("balanço que não fecha gera bloqueio", () => {
    const quebrado: DemonstrativosExercicio = {
      ...EXERCICIO_2024,
      balanco: {
        ...EXERCICIO_2024.balanco,
        passivoCirculante: {
          ...EXERCICIO_2024.balanco.passivoCirculante,
          fornecedores: 999999,
        },
      },
    };
    const probs = validarExercicio(quebrado);
    expect(existeBloqueio(probs)).toBe(true);
    expect(probs.some((p) => p.codigo === "BP_NAO_FECHA")).toBe(true);
  });

  it("PL negativo é sinalizado, mas NÃO bloqueia (condição estrutural, não erro de dados)", () => {
    const insolvente: DemonstrativosExercicio = {
      ...EXERCICIO_2024,
      balanco: {
        ...EXERCICIO_2024.balanco,
        patrimonioLiquido: {
          capitalSocial: 100000,
          reservas: 0,
          lucrosAcumulados: 0,
          prejuizosAcumulados: 900000,
          outros: 0,
        },
        // Ativo total = 1.500.000; PC = 500.000; PL = -800.000 → PNC = 1.800.000 (balanço fecha).
        passivoNaoCirculante: { emprestimosFinanciamentos: 1800000, outros: 0 },
      },
    };
    const probs = validarExercicio(insolvente);
    const pl = probs.find((p) => p.codigo === "PL_NEGATIVO");
    expect(pl).toBeDefined();
    expect(pl?.severidade).toBe("critico");
    expect(pl?.bloqueia).toBe(false);
    expect(existeBloqueio(probs)).toBe(false);
  });
});

describe("cruzamento ano a ano", () => {
  const c = cruzarExercicios(EXERCICIOS_EXEMPLO);
  it("ordena os anos", () => expect(c.anos).toEqual([2023, 2024]));
  it("evolução da receita líquida é positiva", () => {
    const linha = c.resultado.find((l) => l.rotulo === "Receita líquida");
    expect(linha?.variacaoTotal).toBeGreaterThan(0);
  });
});

describe("análise integrada", () => {
  const a = analisar(EXERCICIOS_EXEMPLO);
  it("não bloqueia o exemplo saudável", () => expect(a.bloqueado).toBe(false));
  it("produz uma situação geral não inconclusiva", () => {
    expect(a.situacao).not.toBe("inconclusiva");
  });
  it("inclui indicadores do exercício mais recente", () => {
    expect(a.indicadoresRecentes.length).toBeGreaterThan(15);
  });
});
