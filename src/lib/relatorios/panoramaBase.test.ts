import { describe, it, expect } from "vitest";
import { montarPanoramaBase, medirCobertura, type LinhaBase } from "./panoramaBase";

const AGORA = new Date("2026-08-19T12:00:00Z");

function linha(p: Partial<LinhaBase> & { ncm: string }): LinhaBase {
  return {
    origem: "base_plataforma",
    tipo: "normal",
    atualizadoEm: new Date("2026-01-01T00:00:00Z"),
    ...p,
  };
}

describe("montarPanoramaBase", () => {
  it("conta total, regime e origem", () => {
    const p = montarPanoramaBase(
      [
        linha({ ncm: "1", tipo: "normal" }),
        linha({ ncm: "2", tipo: "monofasico" }),
        linha({ ncm: "3", tipo: "normal", origem: "econet_cache" }),
      ],
      AGORA,
    );
    expect(p.total).toBe(3);
    expect(p.porRegime[0]).toEqual({ tipo: "normal", quantidade: 2 });
    expect(p.porOrigem.find((o) => o.origem === "econet_cache")?.quantidade).toBe(1);
  });

  it("conta como crescimento recente só o que entrou nos últimos 30 dias", () => {
    const p = montarPanoramaBase(
      [
        linha({ ncm: "antigo", atualizadoEm: new Date("2026-06-01T00:00:00Z") }),
        linha({ ncm: "novo", atualizadoEm: new Date("2026-08-18T00:00:00Z") }),
      ],
      AGORA,
    );
    expect(p.acrescentadosRecentes).toBe(1);
    expect(p.ultimaInclusao?.toISOString()).toBe("2026-08-18T00:00:00.000Z");
  });

  it("aguenta base vazia", () => {
    const p = montarPanoramaBase([], AGORA);
    expect(p.total).toBe(0);
    expect(p.ultimaInclusao).toBeNull();
  });
});

describe("medirCobertura", () => {
  it("mede quanto da tabela do cliente a base já cobre", () => {
    const c = medirCobertura(["1", "2", "3", "4"], new Set(["1", "2", "3"]));
    expect(c.totalDoCliente).toBe(4);
    expect(c.cobertosPelaBase).toBe(3);
    expect(c.faltantes).toEqual(["4"]);
    expect(c.percentual).toBe(75);
  });

  it("não conta NCM repetido duas vezes", () => {
    const c = medirCobertura(["1", "1", "2"], new Set(["1"]));
    expect(c.totalDoCliente).toBe(2);
    expect(c.faltantes).toEqual(["2"]);
  });

  it("cliente sem NCM é 100% coberto — não há o que faltar", () => {
    expect(medirCobertura([], new Set()).percentual).toBe(100);
  });
});
