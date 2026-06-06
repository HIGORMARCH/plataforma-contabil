import { describe, expect, it } from "vitest";
import { ehFormatoClassificacao, extrairPorClassificacao } from "./classificacao";
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
