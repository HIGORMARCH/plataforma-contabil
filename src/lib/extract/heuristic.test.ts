import { describe, expect, it } from "vitest";
import { extrairDemonstrativos } from "./heuristic";

const LINHAS_BALANCO = [
  "BALANÇO PATRIMONIAL — Exercício encerrado em 31/12/2024",
  "ATIVO CIRCULANTE",
  "Caixa e equivalentes de caixa 120.000,00",
  "Clientes a receber 280.000,00",
  "Estoques 350.000,00",
  "Tributos a recuperar 40.000,00",
  "Total do ativo circulante 790.000,00",
  "ATIVO NÃO CIRCULANTE",
  "Imobilizado 600.000,00",
  "Intangível 50.000,00",
  "PASSIVO CIRCULANTE",
  "Fornecedores 220.000,00",
  "Empréstimos e financiamentos 180.000,00",
  "Obrigações trabalhistas 60.000,00",
  "Obrigações tributárias 40.000,00",
  "PASSIVO NÃO CIRCULANTE",
  "Empréstimos e financiamentos 300.000,00",
  "PATRIMÔNIO LÍQUIDO",
  "Capital social 500.000,00",
  "Reservas de lucros 100.000,00",
  "Lucros acumulados 100.000,00",
];

const LINHAS_DRE = [
  "DEMONSTRAÇÃO DO RESULTADO DO EXERCÍCIO 2024",
  "Receita bruta de vendas 2.500.000,00",
  "(-) Deduções da receita 400.000,00",
  "Custo das mercadorias vendidas 1.400.000,00",
  "Despesas operacionais 450.000,00",
  "Despesas financeiras 70.000,00",
  "Receitas financeiras 10.000,00",
  "IRPJ e CSLL 60.000,00",
];

describe("extração heurística — Balanço", () => {
  const r = extrairDemonstrativos(LINHAS_BALANCO);
  it("detecta o ano", () => expect(r.ano).toBe(2024));
  it("caixa", () => expect(r.campos["ac.caixaEquivalentes"]?.valor).toBe(120000));
  it("clientes a receber", () => expect(r.campos["ac.contasReceber"]?.valor).toBe(280000));
  it("estoques", () => expect(r.campos["ac.estoques"]?.valor).toBe(350000));
  it("imobilizado", () => expect(r.campos["anc.imobilizado"]?.valor).toBe(600000));
  it("fornecedores", () => expect(r.campos["pc.fornecedores"]?.valor).toBe(220000));
  it("empréstimos roteia CP e LP por seção", () => {
    expect(r.campos["pc.emprestimosFinanciamentos"]?.valor).toBe(180000);
    expect(r.campos["pnc.emprestimosFinanciamentos"]?.valor).toBe(300000);
  });
  it("capital social", () => expect(r.campos["pl.capitalSocial"]?.valor).toBe(500000));
  it("não captura linha de total como conta", () => {
    // o ativo circulante não é uma chave; total não deve poluir outras chaves
    expect(r.campos["ac.caixaEquivalentes"]?.valor).not.toBe(790000);
  });
});

describe("extração heurística — DRE", () => {
  const r = extrairDemonstrativos(LINHAS_DRE);
  it("receita bruta", () => expect(r.campos["dre.receitaBrutaVendas"]?.valor).toBe(2500000));
  it("deduções", () => expect(r.campos["dre.deducoes"]?.valor).toBe(400000));
  it("custos", () => expect(r.campos["dre.custos"]?.valor).toBe(1400000));
  it("despesas financeiras", () => expect(r.campos["dre.despesasFinanceiras"]?.valor).toBe(70000));
  it("tributos sobre o lucro", () => expect(r.campos["dre.tributosSobreLucro"]?.valor).toBe(60000));
});
