import { describe, expect, it } from "vitest";
import { parseSpedEcf } from "./parseSpedEcf";

// Lucro Real trimestral — layout conferido nas ECF da Casa São Paulo (0006 a 0010).
const LUCRO_REAL = [
  "|0000|LECF|0010|37417896000119|CASA SAO PAULO CALCADOS LTDA|0|0|||01012023|31122023|N||0||",
  "|0010|9D45A725BFF6198A50C9A5966A789997A9195677|N|1|T|01|RRRR|||||||",
  "|N030|01012023|31032023|T01|",
  "|N630|1|BASE DE CÁLCULO DO IRPJ|10000,00|",
  "|N630|26|IMPOSTO DE RENDA A PAGAR|1.500,50|",
  "|N670|21|CSLL A PAGAR|540,18|",
  "|N030|01042023|30062023|T02|",
  "|N630|26|IMPOSTO DE RENDA A PAGAR|0,00|",
  "|N670|21|CSLL A PAGAR|0,00|",
].join("\n");

// Lucro Presumido — bloco P, como antes.
const PRESUMIDO = [
  "|0000|LECF|0010|11111111000191|EMPRESA PRESUMIDA LTDA|0|0|||01012024|31122024|N||0||",
  "|P030|01012024|31032024|T01|",
  "|P300|15|IMPOSTO DE RENDA A PAGAR|11545,07|",
  "|P500|13|CSLL A PAGAR|6927,04|",
].join("\n");

describe("parseSpedEcf — Lucro Real (bloco N)", () => {
  const r = parseSpedEcf(LUCRO_REAL);

  it("lê CNPJ e ano do 0000", () => {
    expect(r.cnpj).toBe("37417896000119");
    expect(r.ano).toBe(2023);
  });
  it("abre um trimestre por N030", () => expect(r.apuracoes.map((a) => a.trimestre)).toEqual([1, 2]));
  it("marca o regime como Real trimestral", () => expect(r.apuracoes[0].regime).toBe("REAL_TRIMESTRAL"));
  it("IRPJ a pagar = N630 item 26, só ele", () => expect(r.apuracoes[0].irpjApurado).toBe(1500.5));
  it("CSLL a pagar = N670 item 21", () => expect(r.apuracoes[0].csllApurado).toBe(540.18));
  it("trimestre zerado continua presente", () => {
    expect(r.apuracoes[1].irpjApurado).toBe(0);
    expect(r.apuracoes[1].csllApurado).toBe(0);
  });
});

describe("parseSpedEcf — Presumido (bloco P) continua igual", () => {
  const r = parseSpedEcf(PRESUMIDO);
  it("IRPJ e CSLL do P300/P500", () => {
    expect(r.apuracoes).toHaveLength(1);
    expect(r.apuracoes[0].irpjApurado).toBe(11545.07);
    expect(r.apuracoes[0].csllApurado).toBe(6927.04);
  });
});
