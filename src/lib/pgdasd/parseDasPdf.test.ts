import { describe, it, expect } from "vitest";
import { parseDasSimples } from "./parseDasPdf";

/**
 * Texto que o `pdf-parse` devolve para uma guia de DAS.
 *
 * Copiado da extração real de `PGDASD-DAS-12.2025.pdf` da LUPO QUIOSQUE —
 * inclusive a ordem embaralhada dos blocos, que é o que o parser precisa
 * aguentar. Os valores são os da guia de verdade: soma 7.575,03.
 */
const DAS_12_2025 = `
Documento de Arrecadação
do Simples Nacional
34.351.482/0001-46 PALMAS QUIOSQUE COMERCIO DE ACESSORIOS E VESTUARIO
Período de Apuração Data de Vencimento Número do Documento
07.20.26019.4202197-9 Pagar este documento até
20/01/2026	Observações
Valor Total do Documento
7.575,03
CNPJ Razão Social
Dezembro/2025 20/01/2026
Código Principal	Denominação Total	Multa Juros
Composição do Documento de Arrecadação
1001 IRPJ - SIMPLES NACIONAL 416,63 416,63
12/2025
1002 CSLL - SIMPLES NACIONAL 265,13 265,13
12/2025
1004 COFINS - SIMPLES NACIONAL 965,06 965,06
12/2025
1005 PIS - SIMPLES NACIONAL 209,07 209,07
12/2025
1006 INSS - SIMPLES NACIONAL 3.181,51 3.181,51
12/2025
1007 ICMS - SIMPLES NACIONAL 2.537,63 2.537,63
TO - 12/2025
Totais 7.575,03 7.575,03
SENDA (Versão:5.2.9) 19/01/2026 15:02:40	1 1	Página: /
Documento de Arrecadação do Simples Nacional
Número: 07.20.26019.4202197-9
Pagar até: 20/01/2026
Valor: 7.575,03
Pague com o PIX
`;

describe("parseDasSimples", () => {
  it("lê a guia inteira do arquivo real", () => {
    const r = parseDasSimples(DAS_12_2025);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const d = r.das;

    expect(d.cnpj).toBe("34351482000146");
    expect(d.ano).toBe(2025);
    expect(d.mes).toBe(12);
    expect(d.numeroDocumento).toBe("07.20.26019.4202197-9");
    expect(d.dataVencimento?.toISOString().slice(0, 10)).toBe("2026-01-20");
    expect(d.valorTotal).toBe(7575.03);
    expect(d.principal).toBeCloseTo(7575.03, 2);
    expect(d.alertas).toEqual([]);
  });

  it("separa a composição por código de receita", () => {
    const r = parseDasSimples(DAS_12_2025);
    if (!r.ok) throw new Error("deveria ter lido");
    const porCodigo = Object.fromEntries(
      r.das.composicao.map((l) => [l.codigo, l.principal]),
    );
    expect(porCodigo).toEqual({
      "1001": 416.63,
      "1002": 265.13,
      "1004": 965.06,
      "1005": 209.07,
      "1006": 3181.51,
      "1007": 2537.63,
    });
    // A soma da composição é o valor da guia — é o número que interessa.
    const soma = r.das.composicao.reduce((s, l) => s + l.total, 0);
    expect(soma).toBeCloseTo(r.das.valorTotal, 2);
  });

  it("acusa quando a composição não fecha com o total do documento", () => {
    const adulterado = DAS_12_2025.replace("Valor Total do Documento\n7.575,03", "Valor Total do Documento\n8.000,00");
    const r = parseDasSimples(adulterado);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.das.alertas.some((a) => /Soma da composição/i.test(a))).toBe(true);
  });

  it("recusa PDF que não é DAS", () => {
    const r = parseDasSimples("Comprovante de Arrecadação\nTotais 1.000,00");
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.motivo).toMatch(/n[ãa]o é um DAS/i);
  });
});
