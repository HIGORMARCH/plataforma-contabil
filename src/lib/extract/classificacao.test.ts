import { describe, expect, it } from "vitest";
import {
  ehFormatoClassificacao,
  ehSoDemonstracaoResultado,
  extrairDemonstracaoResultado,
  extrairPorClassificacao,
} from "./classificacao";
import { montarExercicio } from "../import";
import { totaisBalanco, resultadosDRE } from "../accounting/compute";
import type { Maybe } from "../accounting/types";

// Plano de contas com PL no código 2.4 (estrutura diferente) e D/C.
const LINHAS = [
  "Balanço encerrado em: 31/12/2025",
  "1 1 ATIVO 1.000,00D",
  "2 1.1 ATIVO CIRCULANTE 600,00D",
  "3 1.1.1 DISPONÍVEL 100,00D",
  "12 1.1.2 CLIENTES 200,00D",
  "53 1.1.5 ESTOQUE 300,00D",
  "501 1.2 ATIVO NÃO-CIRCULANTE 400,00D",
  "111 1.2.3 IMOBILIZADO 400,00D",
  "200 2 PASSIVO 1.000,00C",
  "203 2.1 PASSIVO CIRCULANTE 250,00C",
  "211 2.1.3 FORNECEDORES 250,00C",
  "290 2.2 PASSIVO NÃO CIRCULANTE 150,00C",
  "291 2.2.1.01 EMPRÉSTIMOS E FINANCIAMENTOS 150,00C",
  "317 2.4 PATRIMÔNIO LÍQUIDO 600,00C",
  "318 2.4.0.1 CAPITAL SOCIAL 500,00C",
  "341 2.4.0.3 LUCROS ACUMULADOS 100,00C",
  "DEMONSTRAÇÃO DO RESULTADO DO EXERCÍCIO EM 31/12/2025",
  "RECEITA BRUTA 1.000,00",
  "DEDUÇÕES (100,00)",
  "RECEITA LÍQUIDA 900,00",
  "CMV (400,00)",
  "LUCRO BRUTO 500,00",
  "DESPESAS OPERACIONAIS (200,00)",
  "OUTRAS RECEITAS OPERACIONAIS 50,00",
  "LUCRO LÍQUIDO DO EXERCÍCIO 350,00",
];

describe("parser de plano de contas", () => {
  const r = extrairPorClassificacao(LINHAS);
  const v = (k: string) => r.campos[k]?.valor;

  it("detecta o formato", () => expect(ehFormatoClassificacao(LINHAS)).toBe(true));
  it("detecta o ano de referência", () => expect(r.ano).toBe(2025));
  it("localiza o PL mesmo no código 2.4", () => {
    expect(v("pl.capitalSocial")).toBe(500);
    expect(v("pl.lucrosAcumulados")).toBe(100);
  });
  it("roteia empréstimos para o não circulante", () => {
    expect(v("pnc.emprestimosFinanciamentos")).toBe(150);
  });
  it("captura outras receitas e o resultado declarado", () => {
    expect(v("dre.outrasReceitasDespesas")).toBe(50);
    expect(v("dre.resultadoLiquidoInformado")).toBe(350);
  });

  it("o balanço fecha (Ativo = Passivo + PL)", () => {
    const mapa: Record<string, Maybe> = {};
    for (const [k, c] of Object.entries(r.campos)) mapa[k] = c.valor;
    const ex = montarExercicio(2025, mapa);
    const b = totaisBalanco(ex.balanco);
    expect(b.ativoTotal).toBe(1000);
    expect(b.passivoMaisPL).toBe(1000);
    expect(resultadosDRE(ex.dre).resultadoLiquido).toBe(350);
  });
});

// PL do balanço do Domínio — Casa São Paulo 2019: prejuízo ainda na conta
// "resultado do exercício em curso" e retirada antecipada de lucro.
const LINHAS_PL_RESULTADO = [
  "Balanço encerrado em: 31/12/2019",
  "1 1 ATIVO 1.900.129,15D",
  "2 1.1 ATIVO CIRCULANTE 1.900.129,15D",
  "3 1.1.1 DISPONÍVEL 1.900.129,15D",
  "149 2 PASSIVO 1.900.129,15C",
  "242 2.3 PATRIMÔNIO LÍQUIDO 1.900.129,15C",
  "243 2.3.1 CAPITAL SOCIAL 70.000,00C",
  "244 2.3.10.1 CAPITAL SUBSCRITO 70.000,00C",
  "245 2.3.10.100.1 CAPITAL SOCIAL 70.000,00C",
  "264 2.3.5 LUCROS OU PREJUÍZOS ACUMULADOS 1.830.129,15C",
  "265 2.3.50.1 LUCROS OU PREJUÍZOS ACUMULADOS 1.830.129,15C",
  "266 2.3.50.100.1 LUCROS ACUMULADOS 1.980.951,65C",
  "268 2.3.50.100.3 RESULTADO DO EXERCÍCIO EM CURSO 149.966,26D",
  "1311 2.3.50.100.4 RETIRADA DE LUCRO ANTECIPADA 856,24D",
];

describe("PL — resultado do exercício separado", () => {
  const r = extrairPorClassificacao(LINHAS_PL_RESULTADO);
  const v = (k: string) => r.campos[k]?.valor;

  it("prejuízo do exercício em campo próprio, com sinal", () => expect(v("pl.resultadoExercicio")).toBe(-149966.26));
  it("retirada antecipada em Outros (PL)", () => expect(v("pl.outros")).toBe(-856.24));
  it("lucros acumulados é o impresso", () => expect(v("pl.lucrosAcumulados")).toBe(1980951.65));
  it("PL continua fechando", () => {
    const mapa: Record<string, Maybe> = {};
    for (const [k, c] of Object.entries(r.campos)) mapa[k] = c.valor;
    const pl = totaisBalanco(montarExercicio(2019, mapa).balanco).patrimonioLiquido!;
    expect(Math.round(pl * 100) / 100).toBe(1900129.15);
  });
});

// D.R.E. impressa pelo Domínio (sem código de conta) — Casa São Paulo 2019.
const LINHAS_DRE_DOMINIO = [
  "Número livro: 0001",
  "Empresa: CASA SAO PAULO CALCADOS LTDA Folha: 0001",
  "Emissão: 13/09/2026",
  "Hora: 18:17:42",
  "DEMONSTRAÇÃO DO RESULTADO DO EXERCÍCIO EM 31/12/2019",
  "Descrição Saldo Atual",
  "RECEITA BRUTA 3.602.537,78",
  "VENDA DE MERCADORIAS 3.602.537,78",
  "DEDUÇÕES (174.081,93)",
  "(-) DEVOLUÇÃO DE VENDA DE MERCADORIAS (103.487,68)",
  "RECEITA LÍQUIDA 3.428.455,85",
  "CMV (2.781.009,56)",
  "CMV (2.781.009,56)",
  "LUCRO BRUTO 647.446,29",
  "DESPESAS OPERACIONAIS (853.178,73)",
  "DESPESAS COM VENDAS (356.952,50)",
  "DEPRECIAÇÕES E AMORTIZAÇÕES (124.859,52)",
  "DESPESAS ADMINISTRATIVAS (496.226,23)",
  "SALÁRIOS E ORDENADOS (54.517,73)",
  "INSS (19.011,93)",
  "RECEITAS FINANCEIRAS 56.266,18",
  "OUTRAS DESPESAS OPERACIONAIS (500,00)",
  "RESULTADO OPERACIONAL (149.966,26)",
  "RESULTADO ANTES DO IR E CSL (149.966,26)",
  "PREJUÍZO DO EXERCÍCIO (149.966,26)",
];

describe("D.R.E. do Domínio — importa o que está impresso", () => {
  const linhas = LINHAS_DRE_DOMINIO;
  const r = extrairDemonstracaoResultado(linhas);
  const v = (k: string) => r.campos[k]?.valor;

  it("é reconhecida como DRE avulsa", () => {
    expect(ehFormatoClassificacao(linhas)).toBe(false);
    expect(ehSoDemonstracaoResultado(linhas)).toBe(true);
  });
  it("ano é o do exercício, não o da emissão", () => expect(r.ano).toBe(2019));
  it("nenhum campo do balanço é preenchido", () => {
    expect(Object.keys(r.campos).filter((k) => !k.startsWith("dre."))).toEqual([]);
  });
  it("cada linha é o valor impresso", () => {
    expect(v("dre.receitaBrutaVendas")).toBe(3602537.78);
    expect(v("dre.deducoes")).toBe(174081.93);
    expect(v("dre.custos")).toBe(2781009.56);
    expect(v("dre.despesasOperacionais")).toBe(853178.73);
    expect(v("dre.receitasFinanceiras")).toBe(56266.18);
    expect(v("dre.outrasReceitasDespesas")).toBe(-500);
    expect(v("dre.depreciacaoAmortizacao")).toBe(124859.52);
    expect(v("dre.resultadoAntesTributos")).toBe(-149966.26);
    expect(v("dre.resultadoLiquidoInformado")).toBe(-149966.26);
    expect(v("dre.tributosSobreLucro")).toBeUndefined();
  });
  it("as linhas impressas fecham com o prejuízo do documento", () => {
    const mapa: Record<string, Maybe> = {};
    for (const [k, c] of Object.entries(r.campos)) mapa[k] = c.valor;
    const res = resultadosDRE(montarExercicio(2019, mapa).dre).resultadoLiquido!;
    expect(Math.round(res * 100) / 100).toBe(-149966.26);
  });
});

// Passivo a descoberto: PL com saldo DEVEDOR (D) deve resultar negativo.
const LINHAS_PL_NEGATIVO = [
  "Balanço encerrado em: 31/12/2025",
  "1 1 ATIVO 100,00D",
  "2 1.1 ATIVO CIRCULANTE 100,00D",
  "3 1.1.1 DISPONÍVEL 100,00D",
  "200 2 PASSIVO 100,00C",
  "203 2.1 PASSIVO CIRCULANTE 500,00C",
  "211 2.1.3 FORNECEDORES 500,00C",
  "317 2.3 PATRIMÔNIO LÍQUIDO 400,00D",
  "318 2.3.1 CAPITAL SOCIAL 100,00C",
];

describe("parser — passivo a descoberto", () => {
  it("PL devedor vira prejuízo e o balanço fecha negativo", () => {
    const r = extrairPorClassificacao(LINHAS_PL_NEGATIVO);
    const mapa: Record<string, Maybe> = {};
    for (const [k, c] of Object.entries(r.campos)) mapa[k] = c.valor;
    const b = totaisBalanco(montarExercicio(2025, mapa).balanco);
    expect(b.patrimonioLiquido).toBe(-400);
    expect(b.passivoMaisPL).toBe(100); // 500 (PC) + (-400) (PL) = 100 = Ativo
    expect(b.ativoTotal).toBe(100);
  });
});
