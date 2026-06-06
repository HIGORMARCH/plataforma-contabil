import { describe, expect, it } from "vitest";
import { parseNumero, montarExercicio } from "./import";
import { totaisBalanco } from "./accounting/compute";

describe("parseNumero", () => {
  it("interpreta formato pt-BR com milhar e decimal", () => {
    expect(parseNumero("1.234,56")).toBeCloseTo(1234.56, 2);
  });
  it("interpreta apenas decimal com vírgula", () => {
    expect(parseNumero("89,9")).toBeCloseTo(89.9, 2);
  });
  it("remove R$ e espaços", () => {
    expect(parseNumero("R$ 2.000,00")).toBe(2000);
  });
  it("vazio vira null", () => {
    expect(parseNumero("")).toBeNull();
    expect(parseNumero(null)).toBeNull();
  });
});

describe("montarExercicio", () => {
  it("monta a estrutura e calcula totais corretamente", () => {
    const ex = montarExercicio(2024, {
      "ac.caixaEquivalentes": 100,
      "ac.estoques": 50,
      "pc.fornecedores": 30,
      "pl.capitalSocial": 120,
    });
    const t = totaisBalanco(ex.balanco);
    expect(t.ativoCirculante).toBe(150);
    expect(t.passivoCirculante).toBe(30);
    expect(t.patrimonioLiquido).toBe(120);
  });
});
