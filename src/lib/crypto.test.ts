import { describe, it, expect, beforeAll } from "vitest";
import { cifrar, decifrar } from "./crypto";

beforeAll(() => {
  process.env.ENCRYPTION_KEY = "test-key-with-at-least-32-chars-!!!";
});

describe("crypto AES-256-GCM", () => {
  it("cifra e decifra o mesmo texto", () => {
    const original = "senha-super-secreta-123";
    const cifrado = cifrar(original);
    expect(cifrado).not.toBe(original);
    expect(cifrado.startsWith("v1:")).toBe(true);
    expect(decifrar(cifrado)).toBe(original);
  });

  it("gera cifras diferentes pro mesmo texto (salt+iv aleatórios)", () => {
    const a = cifrar("mesma-senha");
    const b = cifrar("mesma-senha");
    expect(a).not.toBe(b);
    expect(decifrar(a)).toBe(decifrar(b));
  });

  it("string vazia retorna vazia", () => {
    expect(cifrar("")).toBe("");
    expect(decifrar("")).toBe("");
  });

  it("cifra caracteres unicode corretamente", () => {
    const original = "áçñÜ €🔐 senha";
    expect(decifrar(cifrar(original))).toBe(original);
  });

  it("rejeita cifra adulterada (tag GCM)", () => {
    const cifrado = cifrar("segredo");
    // altera 1 char no meio da parte cipher
    const partes = cifrado.split(":");
    const cipherHex = partes[4];
    const outroChar = cipherHex[0] === "a" ? "b" : "a";
    partes[4] = outroChar + cipherHex.slice(1);
    const adulterado = partes.join(":");
    expect(() => decifrar(adulterado)).toThrow();
  });

  it("rejeita formato de versão desconhecido", () => {
    expect(() => decifrar("v99:aa:bb:cc:dd")).toThrow(/Formato/);
  });
});
