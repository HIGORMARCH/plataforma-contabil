import { describe, expect, it } from "vitest";
import { parseDctfMensalPdf } from "./parseDctfMensalPdf";
import { parseReciboDctfWebPdf } from "./parseReciboDctfWebPdf";

// Linhas reais: FISCAL\DCTF\2018\DCTF 122018.pdf (Casa São Paulo)
const DCTF_122018 = [
  "14/09/2026, 00:53 Impressão da Declaração - 2004",
  "D C T F MENSAL - 3.50",
  "CNPJ: 37.417.896/0001-19 Dezembro/2018",
  "Dados do Processamento",
  "Número da Declaração: 100.2018.2019.1841711004",
  "Número do Recibo: 27.87.15.50.99-92",
  "Data de Recepção: 19/02/2019",
  "Data de Processamento: 19/02/2019",
  "Dados Iniciais",
  "Período: 01/12/2018 a 31/12/2018",
  "Declaração Retificadora: Não",
  "Situação: Normal",
  "Forma de Tributação do Lucro: Real/Estimativa",
  "CNPJ: 37.417.896/0001-19 Dezembro/2018",
  "Débito Apurado e Créditos Vinculados - R$",
  "GRUPO DO TRIBUTO : IRRF - IMPOSTO SOBRE A RENDA RETIDO NA FONTE",
  "CÓDIGO RECEITA : 0561-07",
  "PERIODICIDADE: Mensal PERÍODO DE APURAÇÃO: Dezembro/2018",
  "DÉBITO APURADO 254,84",
  "CRÉDITOS VINCULADOS",
  "- PAGAMENTO 254,84",
  "- COMPENSAÇÕES 0,00",
  "- PARCELAMENTO 0,00",
  "- SUSPENSÃO 0,00",
  "SOMA DOS CRÉDITOS VINCULADOS: 254,84",
  "SALDO A PAGAR DO DÉBITO: 0,00",
  "Valor do Débito - R$ Total: 254,84",
  "PA: 31/12/2018 CPF/CNPJ: 37.417.896/0001-19 Código da Receita: 0561",
  "Valor do Principal: 254,84",
  "***** FIM DE IMPRESSÃO *****",
];

// Linhas reais: FISCAL\DCTFWEB\2024\Recibo Declaracao 122024.pdf (Casa São Paulo)
const RECIBO_122024 = [
  "Recibo de Entrega da Declaração de Débitos e Créditos Tributários Federais - DCTFWeb",
  "CNPJ/CPF 37.417.896/0001-19",
  "Nome CASA SAO PAULO CALCADOS LTDA",
  "Período de apuração 12/2024",
  "Declaração Retificadora Não",
  "Identificação da apuração de débitos 29788160412 / eSocial",
  "Totalização dos tributos apurados no período",
  "Tributos Débitos Apurados Saldo a Pagar",
  "Contribuição Previdenciária Segurados R$ 429,86 R$ 429,86",
  "Contribuição Previdenciária Patronal R$ 908,00 R$ 908,00",
  "Contribuição para Outras Entidades e Fundos R$ 90,48 R$ 90,48",
  "Contribuições Diversas R$ 0,00 R$ 0,00",
  "COFINS R$ 0,00 R$ 0,00",
  "CSLL R$ 0,00 R$ 0,00",
  "IRPJ R$ 0,00 R$ 0,00",
  "IRRF R$ 0,00 R$ 0,00",
  "PIS R$ 0,00 R$ 0,00",
  "RET/Pagamento Unificado R$ 0,00 R$ 0,00",
  "TOTAL R$ 1.428,34 R$ 1.428,34",
  "Dados do Representante da Pessoa Jurídica",
  "Nome ERNANI SOARES DE SIQUEIRA",
  "DCTFWeb recebida via Internet pelo Agente Receptor SERPRO em 19/12/2024 16:11:09",
  "Nº do recibo de entrega 0000050000295497340",
];

describe("DCTF Mensal (PDF do e-CAC)", () => {
  const r = parseDctfMensalPdf(DCTF_122018);

  it("cabeçalho e processamento", () => {
    expect(r.cnpj).toBe("37417896000119");
    expect(r.periodoApuracao?.toISOString().slice(0, 10)).toBe("2018-12-01");
    expect(r.numeroDeclaracao).toBe("100.2018.2019.1841711004");
    expect(r.numeroRecibo).toBe("27.87.15.50.99-92");
    expect(r.dataRecepcao?.toISOString().slice(0, 10)).toBe("2019-02-19");
    expect(r.retificadora).toBe(false);
    expect(r.formaTributacaoLucro).toBe("Real/Estimativa");
  });

  it("débito do IRRF exatamente como impresso", () => {
    expect(r.debitos).toHaveLength(1);
    const d = r.debitos[0];
    expect(d.grupoTributo).toBe("IRRF - IMPOSTO SOBRE A RENDA RETIDO NA FONTE");
    expect(d.codigoReceita).toBe("0561");
    expect(d.codigoReceitaCompleto).toBe("0561-07");
    expect(d.periodicidade).toBe("Mensal");
    expect(d.debitoApurado).toBe(254.84);
    expect(d.pagamento).toBe(254.84);
    expect(d.saldoAPagar).toBe(0);
  });

  it("sem incoerência quando a conta fecha", () => expect(r.alertas).toEqual([]));

  it("aponta — sem corrigir — quando débito − créditos ≠ saldo", () => {
    const x = parseDctfMensalPdf(DCTF_122018.map((l) => (l.startsWith("SALDO A PAGAR") ? "SALDO A PAGAR DO DÉBITO: 10,00" : l)));
    expect(x.debitos[0].saldoAPagar).toBe(10);
    expect(x.alertas.some((a) => a.includes("0561-07"))).toBe(true);
  });
});

describe("Recibo de entrega da DCTFWeb (PDF do e-CAC)", () => {
  const r = parseReciboDctfWebPdf(RECIBO_122024);

  it("cabeçalho", () => {
    expect(r.cnpj).toBe("37417896000119");
    expect(r.nome).toBe("CASA SAO PAULO CALCADOS LTDA");
    expect(r.periodoTexto).toBe("12/2024");
    expect(r.anual).toBe(false);
    expect(r.periodoApuracao?.toISOString().slice(0, 10)).toBe("2024-12-01");
    expect(r.retificadora).toBe(false);
    expect(r.identificacaoApuracao).toBe("29788160412 / eSocial");
  });

  it("tributos e total como impressos", () => {
    const patronal = r.tributos.find((t) => t.tributo === "Contribuição Previdenciária Patronal");
    expect(patronal).toEqual({ tributo: "Contribuição Previdenciária Patronal", debitoApurado: 908, saldoAPagar: 908 });
    expect(r.tributos.find((t) => t.tributo === "IRPJ")?.debitoApurado).toBe(0);
    expect(r.totalDebitoApurado).toBe(1428.34);
    expect(r.totalSaldoAPagar).toBe(1428.34);
  });

  it("recepção e nº do recibo", () => {
    expect(r.numeroRecibo).toBe("0000050000295497340");
    expect(r.recebidaEm?.toISOString()).toBe("2024-12-19T19:11:09.000Z");
  });

  it("soma dos tributos confere com o TOTAL", () => expect(r.alertas).toEqual([]));

  it("13º salário (período só com ano) é anual", () => {
    const x = parseReciboDctfWebPdf(RECIBO_122024.map((l) => (l.startsWith("Período de apuração") ? "Período de apuração 2024" : l)));
    expect(x.anual).toBe(true);
    expect(x.periodoTexto).toBe("2024");
  });
});
