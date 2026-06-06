import { describe, expect, it } from "vitest";
import { analisar } from "../accounting/analyze";
import { EXERCICIOS_EXEMPLO, EXERCICIO_2024 } from "../accounting/sample";
import { revisaoCriticaDeterministica } from "./revisaoCritica";
import type { DemonstrativosExercicio } from "../accounting/types";

describe("revisão crítica — caso saudável", () => {
  const analise = analisar(EXERCICIOS_EXEMPLO);
  it("conclusão coerente fica 'alinhado'", () => {
    const r = revisaoCriticaDeterministica(
      analise,
      ["A empresa apresenta situação regular, com lucro e liquidez adequada, mas requer acompanhamento."],
    );
    expect(r.alinhamento).not.toBe("divergente");
    expect(r.perguntas.length).toBeGreaterThan(0);
  });
});

// Cenário crítico: PL negativo (passivo a descoberto) que fecha o balanço.
const CRITICO: DemonstrativosExercicio = {
  ...EXERCICIO_2024,
  balanco: {
    ...EXERCICIO_2024.balanco,
    patrimonioLiquido: { capitalSocial: 100000, reservas: 0, lucrosAcumulados: 0, prejuizosAcumulados: 800000, outros: 0 },
    passivoNaoCirculante: { emprestimosFinanciamentos: 1800000, outros: 0 }, // fecha: AC=1.5M
  },
};

describe("revisão crítica — caso crítico com conclusão otimista", () => {
  const analise = analisar([CRITICO]);
  const r = revisaoCriticaDeterministica(
    analise,
    ["A empresa está em situação favorável e saudável, com cenário tranquilo e sólido."],
  );
  it("detecta divergência de tom", () => {
    expect(r.alinhamento).toBe("divergente");
    expect(r.observacoes.some((o) => o.tipo === "divergencia")).toBe(true);
  });
  it("aponta omissão do patrimônio líquido negativo", () => {
    expect(r.observacoes.some((o) => o.tipo === "omissao" && /Patrim/i.test(o.texto))).toBe(true);
  });
});

describe("revisão crítica — afirmação sem base", () => {
  const analise = analisar(EXERCICIOS_EXEMPLO);
  it("sinaliza 'regularidade fiscal'", () => {
    const r = revisaoCriticaDeterministica(analise, ["A empresa está em plena regularidade fiscal."]);
    expect(r.observacoes.some((o) => o.tipo === "excesso")).toBe(true);
  });
});
