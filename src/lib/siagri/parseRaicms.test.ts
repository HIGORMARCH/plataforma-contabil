import { describe, expect, it } from "vitest";
import { parseRaicmsSiagri } from "./parseRaicms";

// Trecho do RAICMS 03/2026 da Filial 01 (Porto Nacional) da CONEXAO AGRICOLA,
// como o pdf-parse extrai: linhas de CFOP com o CFOP no fim após TAB, TOTAIS com
// a ordem das colunas trocada, e o 014 com o valor antes do rótulo.
const RAICMS = [
  "LIVRO REGISTRO DE APURAÇÃO DO ICMS - RAICMS - MODELO P9",
  "Período: Folha: 05",
  "293570418 01.066.625/0002-08",
  "01/03/2026 a 31/03/2026",
  "Livro:",
  "CONEXAO AGRICOLA COM E REPRES LTDA",
  "ENTRADAS",
  "593.021,99 6.006,54 1.201,31 587.015,45 0,00\t1.102",
  "2.715.761,11 1.633.784,70 110.274,45 1.061.806,58 20.156,66\t2.102",
  "SUBTOTAIS ENTRADAS",
  "1.639.791,24 111.475,76 1.648.822,03 20.156,66\tT O T A I S 3.308.783,10",
  "SAÍDAS",
  "2.445.362,96 215.867,35 43.173,46 2.227.417,22 2.078,39\t5.102",
  "75.109,00 43.975,52 3.080,64 31.133,48 0,00\t6.202",
  "2.520.471,96 259.842,87 46.254,10 2.258.550,70 2.078,39\tT O T A I S",
  "DÉBITO DO IMPOSTO",
  "001 - Por saídas com débito do imposto 46.254,10",
  "0,00",
  "004 - TOTAL 46.254,10",
  "CRÉDITO DO IMPOSTO",
  "005 - Por entradas/aquisições com crédito do imposto 111.475,76",
  "010 - TOTAL 1.393.199,08",
  "008 - SUBTOTAL 111.475,76",
  "009 - Saldo credor do período anterior 1.281.723,32",
  "APURAÇÃO DOS SALDOS",
  "011 - Saldo devedor (débito menos crédito) 0,00",
  "0,00",
  "013 - Imposto a recolher",
  "1.346.944,98\t014 - Saldo credor (crédito menos débito) a transportar para o período seguinte",
  "015 - Valor à recolher Extra-Apuração 0,00",
  "016 - Total de Impostos à Recolher no Período 0,00",
].join("\n");

describe("parseRaicmsSiagri", () => {
  const r = parseRaicmsSiagri(RAICMS);

  it("identifica o estabelecimento e o período", () => {
    expect(r.inscricaoEstadual).toBe("293570418");
    expect(r.cnpj).toBe("01066625000208");
    expect(r.dataInicial?.toISOString().slice(0, 10)).toBe("2026-03-01");
    expect(r.dataFinal?.toISOString().slice(0, 10)).toBe("2026-03-31");
  });
  it("lê uma linha por CFOP, com natureza", () => {
    expect(r.linhas.map((l) => `${l.natureza}${l.cfop}`)).toEqual(["E1102", "E2102", "S5102", "S6202"]);
    expect(r.linhas[1]).toMatchObject({ valorContabil: 2715761.11, baseCalculo: 1633784.7, imposto: 110274.45 });
  });
  it("totais = soma dos CFOP, conferidos com a linha TOTAIS", () => {
    expect(r.entradas.valorContabil).toBe(3308783.1);
    expect(r.saidas.imposto).toBe(46254.1);
    expect(r.alertas).toEqual([]);
  });
  it("apuração do P9", () => {
    expect(r.apuracao.debitoSaidas).toBe(46254.1);
    expect(r.apuracao.creditoEntradas).toBe(111475.76);
    expect(r.apuracao.saldoCredorAnterior).toBe(1281723.32);
    expect(r.apuracao.saldoCredorTransportar).toBe(1346944.98);
    expect(r.apuracao.icmsARecolher).toBe(0);
    expect(r.apuracao.outrosDebitos).toBe(0);
  });
  it("aponta quando o item 001 não bate com as saídas", () => {
    const r2 = parseRaicmsSiagri(RAICMS.replace("001 - Por saídas com débito do imposto 46.254,10", "001 - Por saídas com débito do imposto 46.000,00"));
    expect(r2.alertas.some((a) => a.startsWith("Item 001"))).toBe(true);
  });
});
