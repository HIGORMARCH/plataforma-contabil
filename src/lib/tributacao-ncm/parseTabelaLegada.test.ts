import { describe, it, expect } from "vitest";
import { parseTabelaLegada, decodificarLatin1 } from "./parseTabelaLegada";

describe("parseTabelaLegada", () => {
  it("lê o formato codigo|descricao|ncm", () => {
    const r = parseTabelaLegada("2|DENTIFRICIOS|33061000\n3|HIGIENE BUCAL|33069000");
    expect(r.linhas).toHaveLength(2);
    expect(r.linhas[0]).toEqual({ codigo: 2, descricao: "DENTIFRICIOS", ncm: "33061000" });
    expect(r.avisos).toHaveLength(0);
  });

  it("agrupa vários NCMs sob o mesmo código", () => {
    const r = parseTabelaLegada(
      ["6|DE MATERIAS TEXTEIS|61034900", "6|DE MATERIAS TEXTEIS|61069000"].join("\n"),
    );
    expect(r.grupos).toHaveLength(1);
    expect(r.grupos[0].ncms).toEqual(["61034900", "61069000"]);
  });

  it("reporta o maior código — é de onde a numeração dos novos continua", () => {
    const r = parseTabelaLegada("2|A|33061000\n71|B|90211010");
    expect(r.maiorCodigo).toBe(71);
  });

  it("preserva acentuação quando o arquivo vem em windows-1252", () => {
    // "CALÇAS" em Windows-1252: Ç = 0xC7
    const bytes = new Uint8Array([
      0x31, 0x30, 0x7c, 0x43, 0x41, 0x4c, 0xc7, 0x41, 0x53, 0x7c, 0x36, 0x31, 0x30, 0x33, 0x34,
      0x32, 0x30, 0x30,
    ]);
    const r = parseTabelaLegada(bytes);
    expect(r.linhas[0].descricao).toBe("CALÇAS");
    expect(decodificarLatin1(bytes)).toContain("CALÇAS");
  });

  it("ignora linhas em branco sem gerar aviso", () => {
    const r = parseTabelaLegada("2|A|33061000\n\n\n3|B|33069000\n");
    expect(r.linhas).toHaveLength(2);
    expect(r.avisos).toHaveLength(0);
  });

  it("avisa em vez de descartar silenciosamente quando o NCM não tem 8 dígitos", () => {
    const r = parseTabelaLegada("2|A|3306100");
    expect(r.linhas).toHaveLength(0);
    expect(r.avisos[0]).toMatch(/não tem 8 dígitos/);
  });

  it("avisa quando o mesmo NCM aparece em dois códigos — incoerência do cliente", () => {
    const r = parseTabelaLegada("6|TEXTEIS|61034900\n11|ALGODAO|61034900");
    expect(r.linhas).toHaveLength(2); // importa fiel os dois
    expect(r.avisos.some((a) => a.includes("61034900"))).toBe(true);
  });

  it("avisa quando um código tem duas descrições diferentes", () => {
    const r = parseTabelaLegada("6|TEXTEIS|61034900\n6|OUTRA COISA|61069000");
    expect(r.grupos[0].descricao).toBe("TEXTEIS");
    expect(r.avisos.some((a) => a.includes("descrições diferentes"))).toBe(true);
  });

  it("deduplica NCMs repetidos no mesmo código", () => {
    const r = parseTabelaLegada("6|A|61034900\n6|A|61034900");
    expect(r.ncmsUnicos).toEqual(["61034900"]);
    expect(r.grupos[0].ncms).toEqual(["61034900"]);
  });
});
