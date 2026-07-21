import { describe, it, expect } from "vitest";
import { parseGiam } from "./parseGiam";

/**
 * Monta uma linha do Segmento B respeitando o layout do Anexo III da Portaria
 * SEFAZ 1.392/2019. Preenche todas as posições fixas — as posições ficam
 * conferidas pela contagem de caracteres.
 */
function linhaSegB(opts: {
  ie?: string;
  periodo?: string;
  retif?: string;
  natureza: "0" | "1";
  cfop: string;
  baseCalculoCentavos: number;
  isentasCentavos: number;
  outrasCentavos: number;
  stCentavos: number;
  valorContabilCentavos: number;
  creditoDebitoCentavos: number;
  domicilio?: "A" | "B";
}): string {
  const ie = (opts.ie ?? "295202190").padStart(9, "0");
  const periodo = opts.periodo ?? "032022";
  const retif = opts.retif ?? "00";
  const pad14 = (n: number) => String(n).padStart(14, "0");
  return (
    "B" + // B1
    ie + // B2 (9)
    "  " + // vazio (2)
    periodo + // B3 (6)
    retif + // B4 (2)
    opts.natureza + // B5 (1) — pos 21
    opts.cfop.padStart(4, "0") + // B6 (4) — pos 22-25
    pad14(opts.baseCalculoCentavos) + // B7 — pos 26-39
    pad14(opts.isentasCentavos) + // B8 — pos 40-53
    pad14(opts.outrasCentavos) + // B9 — pos 54-67
    pad14(opts.stCentavos) + // B10 — pos 68-81
    pad14(opts.valorContabilCentavos) + // B11 — pos 82-95
    pad14(opts.creditoDebitoCentavos) + // B12 — pos 96-109
    (opts.domicilio ?? "A") // B13 — pos 110
  );
}

/** Segmento A mínimo válido (só o que o parser exige — não-Simples). */
function linhaSegA(): string {
  const ie = "295202190";
  const parte1 =
    "A" + // A1
    ie + // A2 (9)
    "  " + // vazio (2)
    "032022" + // A3 período MMAAAA (6)
    "00" + // A4 retif (2)
    "4781400" + // A5 CNAE (7)
    "M" + // A6 tipo (1)
    "N" + // A7 tare (1)
    "F" + // A8 escrituração (1)
    "0".repeat(14) + // A9 saldo inicial caixa (14)
    "0".repeat(14) + // A10 saldo final caixa (14)
    "S" + // A11 ECF (1) — pos 59
    "12345678900" + // A12 CPF (11)
    "DECLARANTE".padEnd(50, " ") + // A13 (50)
    "0002480000" + // A14 CRC (10)
    "TO" + // A15 UF CRC (2)
    "HIGOR NOLETO".padEnd(50, " ") + // A16 (50)
    "63332289870000000000"; // A17 telefone (20) — chega em pos 202
  const debCred =
    "0".repeat(14) + // A18 débito saídas (14)
    "0".repeat(14) + // A19 outros débitos (14)
    "0".repeat(14) + // A20 estorno créditos (14)
    "0".repeat(14) + // A21 créditos entradas (14)
    "0".repeat(14) + // A22 outros créditos (14)
    "0".repeat(14) + // A23 estornos débito (14)
    "0".repeat(14) + // A24 saldo credor anterior (14)
    "0".repeat(14) + // A25 deduções (14)
    "0".repeat(14); // A26 dif alíq recolher (14) — termina em pos 328
  // A27 a A31 (ST) + A32 tare + A33 versão + resto zerado até 783
  const resto = "0".repeat(70) + " ".repeat(20) + "10.00" + "0".repeat(360);
  return parte1 + debCred + resto;
}

function linhaSegZ(totalRegistros: number): string {
  return (
    "Z" +
    "295202190" +
    "  " +
    "032022" +
    "00" +
    String(totalRegistros).padStart(3, "0")
  );
}

describe("parseGiam — Segmento B (Quadro 4 do Espelho da GIAM)", () => {
  it("lê CFOP e todas as colunas de uma linha de entrada", () => {
    const arquivo = [
      linhaSegA(),
      linhaSegB({
        natureza: "0",
        cfop: "1102",
        baseCalculoCentavos: 2941518, // 29.415,18
        isentasCentavos: 0,
        outrasCentavos: 2820000, // 28.200,00
        stCentavos: 0,
        valorContabilCentavos: 5761518, // 57.615,18
        creditoDebitoCentavos: 529473, // 5.294,73
      }),
      linhaSegZ(3),
    ].join("\n");

    const parsed = parseGiam(arquivo);

    expect(parsed.linhasSegmentoB).toHaveLength(1);
    const linha = parsed.linhasSegmentoB[0];
    expect(linha.natureza).toBe("0");
    expect(linha.cfop).toBe("1102");
    expect(linha.baseCalculo).toBeCloseTo(29415.18, 2);
    expect(linha.outras).toBeCloseTo(28200.0, 2);
    expect(linha.valorContabil).toBeCloseTo(57615.18, 2);
    expect(linha.creditoDebitoImposto).toBeCloseTo(5294.73, 2);
    expect(linha.domicilioFiscal).toBe("A");
  });

  it("consolida totais por natureza (entradas vs saídas)", () => {
    const arquivo = [
      linhaSegA(),
      // Entrada 1
      linhaSegB({
        natureza: "0",
        cfop: "1102",
        baseCalculoCentavos: 1000000, // 10.000
        isentasCentavos: 0,
        outrasCentavos: 500000, // 5.000
        stCentavos: 0,
        valorContabilCentavos: 1500000, // 15.000
        creditoDebitoCentavos: 100000, // 1.000
      }),
      // Entrada 2
      linhaSegB({
        natureza: "0",
        cfop: "1403",
        baseCalculoCentavos: 200000,
        isentasCentavos: 30000,
        outrasCentavos: 0,
        stCentavos: 50000,
        valorContabilCentavos: 280000,
        creditoDebitoCentavos: 20000,
      }),
      // Saída
      linhaSegB({
        natureza: "1",
        cfop: "5102",
        baseCalculoCentavos: 5000000, // 50.000
        isentasCentavos: 0,
        outrasCentavos: 100000, // 1.000
        stCentavos: 0,
        valorContabilCentavos: 5100000, // 51.000
        creditoDebitoCentavos: 900000, // 9.000
      }),
      linhaSegZ(5),
    ].join("\n");

    const parsed = parseGiam(arquivo);
    expect(parsed.linhasSegmentoB).toHaveLength(3);
    expect(parsed.totalEntradas.linhas).toBe(2);
    expect(parsed.totalSaidas.linhas).toBe(1);

    expect(parsed.totalEntradas.baseCalculo).toBeCloseTo(12000, 2);
    expect(parsed.totalEntradas.isentasNaoTributadas).toBeCloseTo(300, 2);
    expect(parsed.totalEntradas.outras).toBeCloseTo(5000, 2);
    expect(parsed.totalEntradas.substituicaoTributaria).toBeCloseTo(500, 2);
    expect(parsed.totalEntradas.valorContabil).toBeCloseTo(17800, 2);
    expect(parsed.totalEntradas.creditoDebitoImposto).toBeCloseTo(1200, 2);

    expect(parsed.totalSaidas.valorContabil).toBeCloseTo(51000, 2);
    expect(parsed.totalSaidas.creditoDebitoImposto).toBeCloseTo(9000, 2);

    // Compat: totalCompras == totalEntradas.valorContabil, totalVendas == totalSaidas.valorContabil
    expect(parsed.totalCompras).toBeCloseTo(17800, 2);
    expect(parsed.totalVendas).toBeCloseTo(51000, 2);
  });

  it("ignora linhas B com natureza desconhecida", () => {
    const bMalformado =
      linhaSegB({
        natureza: "0",
        cfop: "1102",
        baseCalculoCentavos: 0,
        isentasCentavos: 0,
        outrasCentavos: 0,
        stCentavos: 0,
        valorContabilCentavos: 100000,
        creditoDebitoCentavos: 0,
      });
    // troca a natureza pra "9" (inválido)
    const linhaInvalida = "B" + bMalformado.slice(1, 20) + "9" + bMalformado.slice(21);
    const arquivo = [linhaSegA(), linhaInvalida, linhaSegZ(2)].join("\n");
    const parsed = parseGiam(arquivo);
    expect(parsed.linhasSegmentoB).toHaveLength(0);
  });
});
