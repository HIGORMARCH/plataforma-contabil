import { describe, it, expect } from "vitest";
import { detectarTributoPeloNome, recolheSeparadamente, TRIBUTOS_RAZAO } from "./tributos";

describe("recolheSeparadamente", () => {
  it("no Simples, IRPJ, CSLL, PIS e COFINS estão dentro do DAS", () => {
    for (const t of ["IRPJ", "CSLL", "PIS", "COFINS"] as const) {
      expect(recolheSeparadamente(t, true), t).toBe(false);
    }
  });

  it("no Simples, retenções e FGTS continuam à parte", () => {
    // INSS aqui é a retenção dos segurados; a cota patronal é que está no DAS.
    // ICMS à parte é a complementação de alíquota / difal, em guia estadual.
    for (const t of ["INSS", "IRRF", "FGTS", "ICMS", "SIMPLES_NACIONAL"] as const) {
      expect(recolheSeparadamente(t, true), t).toBe(true);
    }
  });

  it("fora do Simples, todos são recolhidos à parte", () => {
    for (const t of TRIBUTOS_RAZAO) {
      expect(recolheSeparadamente(t, false), t).toBe(true);
    }
  });
});

describe("detectarTributoPeloNome", () => {
  it("reconhece os nomes combinados com o Higor", () => {
    const esperado: Record<string, string> = {
      "Razao simples nacional": "SIMPLES_NACIONAL",
      "Razao INSS": "INSS",
      "Razao FGTS": "FGTS",
      "Razao IRRF": "IRRF",
      "Razao Pis": "PIS",
      "Razao Cofins": "COFINS",
      "Razao ICMS": "ICMS",
      "Razao Irpj": "IRPJ",
      "Razao Csll": "CSLL",
    };
    for (const [nome, tributo] of Object.entries(esperado)) {
      expect(detectarTributoPeloNome(nome), nome).toBe(tributo);
    }
  });

  it("aceita nome colado, sem separador", () => {
    // Foi assim que o primeiro arquivo real chegou.
    expect(detectarTributoPeloNome("RazaoINSS.pdf")).toBe("INSS");
    expect(detectarTributoPeloNome("RazaoICMS.pdf")).toBe("ICMS");
    expect(detectarTributoPeloNome("RAZAOFGTS.PDF")).toBe("FGTS");
  });

  it("aceita acento, caixa e extensão", () => {
    expect(detectarTributoPeloNome("RAZÃO ICMS.pdf")).toBe("ICMS");
    expect(detectarTributoPeloNome("razao_irpj_2025.PDF")).toBe("IRPJ");
    expect(detectarTributoPeloNome("Razão - Simples Nacional 2024.pdf")).toBe("SIMPLES_NACIONAL");
  });

  it("não confunde IRPJ com IRRF", () => {
    expect(detectarTributoPeloNome("Razao IRPJ")).toBe("IRPJ");
    expect(detectarTributoPeloNome("Razao IRRF")).toBe("IRRF");
  });

  it("devolve null quando o nome não diz o tributo", () => {
    expect(detectarTributoPeloNome("Razao")).toBeNull();
    expect(detectarTributoPeloNome("balancete 2025.pdf")).toBeNull();
  });

  it("devolve null quando o nome casa com mais de um tributo", () => {
    // Arquivo com dois razões juntos precisa ser separado — escolher um seria
    // adivinhar, e a metade que sobrasse entraria no tributo errado.
    expect(detectarTributoPeloNome("Razao PIS e COFINS.pdf")).toBeNull();
  });

  it("cobre os nove tributos da lista", () => {
    expect(TRIBUTOS_RAZAO).toHaveLength(9);
  });
});
