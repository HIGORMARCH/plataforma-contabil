import { describe, it, expect } from "vitest";
import { parseDeclaracaoPgdasd, valorBr } from "./parseDeclaracaoPdf";

/**
 * Fixture do texto que o `pdf-parse` devolve pra uma declaração PGDAS-D.
 *
 * Reproduz o layout descrito na memória `reference_layout_pgdasd_pdf` (validado
 * com declaração real de 12/2023) e usa os valores reais do DAS 12/2025 da LUPO
 * QUIOSQUE — assim os números do teste são de uma competência que existe de
 * verdade e a soma fecha com o total do documento.
 */
function fixtura(over: { total?: string; exigivel?: string; rpa?: string } = {}) {
  const exigivel =
    over.exigivel ?? "416,63 265,13 965,06 209,07 3.181,51 2.537,63 0,00 0,00 7.575,03";
  const total = over.total ?? "7.575,03";
  const rpa = over.rpa ?? "58.402,17 0,00 58.402,17";
  return `
Programa Gerador do Documento de Arrecadação do Simples Nacional - Declaratório
Declaração Original
Período de Apuração: 01/12/2025 a 31/12/2025
1. Identificação do Contribuinte
CNPJ Matriz: 34.351.482/0001-46
Nome empresarial: PALMAS QUIOSQUE COMERCIO DE ACESSORIOS E VESTUARIO LTDA
Data de abertura no CNPJ: 12/08/2019
Optante pelo Simples Nacional: Sim
Regime de Apuração: Competência
Nº da Declaração: 34351482202512001
1.1 CNPJ das filiais presentes nesta declaração: Nenhuma
2.1 Discriminativo de Receitas
Mercado Interno Mercado Externo Total
Receita Bruta do PA (RPA) - Competência ${rpa}
Receita bruta acumulada nos doze meses anteriores ao PA (RBT12) 612.880,44 0,00 612.880,44
Receita bruta acumulada nos doze meses anteriores ao PA proporcionalizada (RBT12p) 0,00 0,00 0,00
Receita bruta acumulada no ano-calendário corrente (RBA) 640.113,90 0,00 640.113,90
2.2 Receitas Brutas Anteriores
2.6 Resumo da Declaração
Receita Bruta Auferida (regime competência) 58.402,17
Valor Total do Débito Declarado (R$) ${total}
2.7 Informações da Declaração por Estabelecimento
CNPJ Estabelecimento: 34.351.482/0001-46 Município: PALMAS UF: TO
Impedido de recolher ICMS/ISS no DAS: Não
Revenda de mercadorias, exceto para o exterior - Sem substituição tributária
Receita Bruta Informada 58.402,17
IRPJ CSLL COFINS PIS/Pasep INSS/CPP ICMS IPI ISS Total
Total do Débito Declarado (exigível + suspenso) ${exigivel}
Total do Débito com Exigibilidade Suspensa 0,00 0,00 0,00 0,00 0,00 0,00 0,00 0,00 0,00
Total do Débito Exigível ${exigivel}
2.8 Total Geral da Empresa
IRPJ CSLL COFINS PIS/Pasep INSS/CPP ICMS IPI ISS Total
Total do Débito Declarado (exigível + suspenso) ${exigivel}
Total do Débito com Exigibilidade Suspensa 0,00 0,00 0,00 0,00 0,00 0,00 0,00 0,00 0,00
Total do Débito Exigível ${exigivel}
3. Informações da Recepção
Data e horário da transmissão da Declaração: 19/01/2026 às 15:02:40
Número do Recibo: 34351482.2025.12.0001
Autenticação: ABC123DEF456
`;
}

describe("valorBr", () => {
  it("lê o formato brasileiro", () => {
    expect(valorBr("1.234,56")).toBe(1234.56);
    expect(valorBr("0,00")).toBe(0);
    expect(valorBr("-58.402,17")).toBe(-58402.17);
  });

  it("recusa o que não é valor monetário", () => {
    expect(valorBr("12/2025")).toBeNull();
    expect(valorBr("34351482202512001")).toBeNull();
    expect(valorBr("")).toBeNull();
  });
});

describe("parseDeclaracaoPgdasd", () => {
  it("extrai identificação, receita e débito por tributo", () => {
    const r = parseDeclaracaoPgdasd(fixtura(), { ano: 2025, mes: 12 });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const d = r.declaracao;

    expect(d.ano).toBe(2025);
    expect(d.mes).toBe(12);
    expect(d.cnpjMatriz).toBe("34351482000146");
    expect(d.numeroDeclaracao).toBe("34351482202512001");
    expect(d.numeroRecibo).toBe("34351482.2025.12.0001");
    expect(d.situacao).toBe("ORIGINAL");
    expect(d.optanteSimples).toBe(true);
    expect(d.regimeApuracao).toBe("COMPETENCIA");
    expect(d.dataTransmissao?.toISOString()).toBe("2026-01-19T15:02:40.000Z");

    expect(d.rpaInterno).toBe(58402.17);
    expect(d.rpaExterno).toBe(0);
    expect(d.rpaTotal).toBe(58402.17);
    expect(d.rbt12).toBe(612880.44);
    expect(d.rba).toBe(640113.9);

    expect(d.tributos).toEqual({
      irpj: 416.63,
      csll: 265.13,
      cofins: 965.06,
      pis: 209.07,
      inss: 3181.51,
      icms: 2537.63,
      ipi: 0,
      iss: 0,
    });
    expect(d.totalDebito).toBe(7575.03);
    expect(d.alertas).toEqual([]);
  });

  it("usa a soma dos tributos quando o total impresso não confere, e acusa", () => {
    // Coluna "Total" da tabela inflada em R$ 100 em relação à soma das oito
    // colunas de tributo. Quem compõe a guia são os oito tributos: o valor sai
    // deles, e o que o PDF imprimiu vai no alerta para o contador conferir.
    const r = parseDeclaracaoPgdasd(
      fixtura({ exigivel: "416,63 265,13 965,06 209,07 3.181,51 2.537,63 0,00 0,00 7.675,03" }),
      { ano: 2025, mes: 12 },
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.declaracao.totalDebito).toBe(7575.03);
    expect(r.declaracao.tributos.irpj).toBe(416.63);
    expect(r.declaracao.alertas.some((a) => /Total impresso/i.test(a))).toBe(true);
    expect(r.declaracao.alertas.some((a) => /7675\.03|7\.675,03/.test(a))).toBe(true);
  });

  it("não confunde receita bruta com imposto no layout antigo (caso LUPO 10/2019)", () => {
    // Regressão do bug que gravou R$ 45.244,92 de imposto num mês de R$ 1.809,80:
    // no layout até 04/2025, o número lido como "total" é a própria receita.
    const exigivel = "99,54 63,34 230,57 49,95 751,07 615,33 0,00 0,00 45.244,92";
    const r = parseDeclaracaoPgdasd(
      fixtura({ rpa: "45.244,92 0,00 45.244,92", total: "45.244,92", exigivel }),
      { ano: 2019, mes: 10 },
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.declaracao.totalDebito).toBeCloseTo(1809.8, 2);
    expect(r.declaracao.rpaTotal).toBeCloseTo(45244.92, 2);
    expect(r.declaracao.alertas.some((a) => /Total impresso/i.test(a))).toBe(true);
  });

  it("acusa quando o PDF vem de competência diferente da pedida", () => {
    const r = parseDeclaracaoPgdasd(fixtura(), { ano: 2025, mes: 11 });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    // Mantém o que o PDF diz — não força a competência pedida.
    expect(r.declaracao.mes).toBe(12);
    expect(r.declaracao.alertas.some((a) => /competencia|competência/i.test(a))).toBe(true);
  });

  it("lê declaração sem movimento sem inventar alerta de layout", () => {
    const zerado = "0,00 0,00 0,00 0,00 0,00 0,00 0,00 0,00 0,00";
    const r = parseDeclaracaoPgdasd(
      fixtura({ exigivel: zerado, total: "0,00", rpa: "0,00 0,00 0,00" }),
      { ano: 2025, mes: 12 },
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.declaracao.rpaTotal).toBe(0);
    expect(r.declaracao.totalDebito).toBe(0);
    expect(r.declaracao.alertas).toEqual([]);
  });

  it("falha explicitamente quando o PDF não é uma declaração PGDAS-D", () => {
    const r = parseDeclaracaoPgdasd("Documento de Arrecadação do Simples Nacional\nValor 7.575,03");
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.motivo).toMatch(/PGDAS-D|Per[ií]odo de Apura/i);
  });

  it("usa o débito exigível como total do DAS, não o resumo 2.6 mal-lido (caso 10/2019)", () => {
    // Bug real: em layouts antigos o resumo 2.6 foi lido como a RECEITA BRUTA.
    // O DAS tem de vir da soma do débito exigível, não do resumo.
    const exigivel = "99,54 63,34 230,57 49,95 751,07 615,33 0,00 0,00 1.809,80";
    const r = parseDeclaracaoPgdasd(
      // resumo 2.6 e RPA iguais (45.244,92) = a pegadinha
      fixtura({ rpa: "45.244,92 0,00 45.244,92", total: "45.244,92", exigivel }),
      { ano: 2019, mes: 10 },
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    // O total do DAS é a soma dos tributos (1.809,80), NÃO a receita (45.244,92).
    expect(r.declaracao.totalDebito).toBeCloseTo(1809.8, 2);
    expect(r.declaracao.totalDebito).not.toBeCloseTo(45244.92, 2);
    expect(r.declaracao.rpaTotal).toBeCloseTo(45244.92, 2);
  });

  it("falha explicitamente quando o layout perde os valores", () => {
    const semValores = `
Programa Gerador do Documento de Arrecadação do Simples Nacional - Declaratório
Período de Apuração: 01/12/2025 a 31/12/2025
Nenhum valor monetário aqui.
`;
    const r = parseDeclaracaoPgdasd(semValores, { ano: 2025, mes: 12 });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.motivo).toMatch(/layout/i);
  });
});
