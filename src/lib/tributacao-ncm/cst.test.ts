import { describe, it, expect } from "vitest";
import { lerCstEntrada, lerCstSaida } from "./cst";

describe("lerCstEntrada", () => {
  it("marca 50 como gerador de crédito", () => {
    const c = lerCstEntrada("50");
    expect(c?.geraCredito).toBe(true);
    expect(c?.vinculo).toContain("Gera crédito");
  });

  it("marca os CSTs de aquisição sem crédito", () => {
    // 70, 71, 73 e 75 são os que a base usa nos regimes especiais — nenhum
    // deles dá direito a crédito na entrada.
    for (const cst of ["70", "71", "73", "75"]) {
      expect(lerCstEntrada(cst)?.geraCredito).toBe(false);
    }
  });

  it("aceita CST com zero à esquerda", () => {
    expect(lerCstEntrada("050")?.codigo).toBe("50");
  });

  it("devolve null pra CST desconhecido, em vez de inventar leitura", () => {
    expect(lerCstEntrada("99")).toBeNull();
  });
});

describe("lerCstSaida", () => {
  it("descreve os CSTs de saída usados na base", () => {
    expect(lerCstSaida("1")).toContain("alíquota básica");
    expect(lerCstSaida("4")).toContain("monofásica");
    expect(lerCstSaida("6")).toContain("alíquota zero");
    expect(lerCstSaida("7")).toContain("isenta");
  });

  it("devolve null pra desconhecido", () => {
    expect(lerCstSaida("42")).toBeNull();
  });
});
