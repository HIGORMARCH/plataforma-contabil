import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { conferirApuracaoIcms, PASTA_APURACAO } from "./conferirApuracaoIcms";

function montar(arvore: Record<string, string[]>): string {
  const raiz = mkdtempSync(path.join(tmpdir(), "apuracao-"));
  for (const [empresa, arquivos] of Object.entries(arvore)) {
    const dir = path.join(raiz, empresa, "FISCAL", PASTA_APURACAO, "2026");
    mkdirSync(dir, { recursive: true });
    for (const a of arquivos) writeFileSync(path.join(dir, a), "x");
  }
  return raiz;
}

describe("conferirApuracaoIcms", () => {
  it("aponta o inventário que falta — sem ele o sistema não apura o ICMS", () => {
    const raiz = montar({
      CONEXAO_AGRICOLA_01066625000119: [
        "APURAÇÃO ICMS 01.2026.pdf",
        "ENTRADAS 01.2026.pdf",
        "SAIDAS 01.2026.pdf",
        "RESUMO POR CFOP 01.2026.pdf",
      ],
    });

    const [linha] = conferirApuracaoIcms(raiz);
    expect(linha.faltando).toEqual(["INVENTARIO"]);
    expect(linha.empresa).toBe("CONEXAO AGRICOLA");
    expect(linha.mes).toBe(1);
  });

  it("não cobra o resumo por CFOP: é conferência, não obrigação", () => {
    const raiz = montar({
      EMPRESA_04364029000103: [
        "APURAÇÃO ICMS 03.2026.pdf",
        "ENTRADAS 03.2026.pdf",
        "SAIDAS 03.2026.pdf",
        "INVENTARIO 03.2026.pdf",
      ],
    });

    expect(conferirApuracaoIcms(raiz)[0].faltando).toEqual([]);
  });

  it("ignora empresa que escritura no Domínio — ela não tem essa pasta", () => {
    const raiz = mkdtempSync(path.join(tmpdir(), "apuracao-"));
    mkdirSync(path.join(raiz, "OUTRA_11651427000176", "FISCAL", "IMPOSTOS"), { recursive: true });

    expect(conferirApuracaoIcms(raiz)).toEqual([]);
  });

  it("separa uma competência da outra na mesma pasta do ano", () => {
    const raiz = montar({
      EMPRESA_04364029000103: [
        "APURAÇÃO ICMS 01.2026.pdf",
        "ENTRADAS 01.2026.pdf",
        "SAIDAS 01.2026.pdf",
        "INVENTARIO 01.2026.pdf",
        "APURAÇÃO ICMS 02.2026.pdf",
        "ENTRADAS 02.2026.pdf",
      ],
    });

    const linhas = conferirApuracaoIcms(raiz);
    expect(linhas).toHaveLength(2);
    // A mais recente primeiro: é a que está em aberto.
    expect(linhas[0].mes).toBe(2);
    expect(linhas[0].faltando).toEqual(["SAIDAS", "INVENTARIO"]);
    expect(linhas[1].faltando).toEqual([]);
  });
});
