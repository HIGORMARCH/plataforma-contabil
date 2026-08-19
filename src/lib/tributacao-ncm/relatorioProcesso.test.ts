import { describe, it, expect } from "vitest";
import { montarRelatorioProcesso, type LinhaParaRelatorio } from "./relatorioProcesso";

function linha(p: Partial<LinhaParaRelatorio> & { ncm: string }): LinhaParaRelatorio {
  return {
    origem: "cliente_legado",
    codigoCliente: null,
    descricaoCliente: null,
    tipo: null,
    codigoConfig: null,
    descricaoConfig: null,
    ...p,
  };
}

describe("montarRelatorioProcesso", () => {
  it("acusa código do cliente que mistura regimes diferentes", () => {
    // O cliente pôs xampu (monofásico) e uma bolsa (tributada) no MESMO código
    // do Domínio dele. Como o código carrega um único conjunto de parâmetros
    // fiscais, um dos dois está sendo tributado errado — seja qual for o CST
    // que ele escolheu.
    const r = montarRelatorioProcesso([
      linha({ ncm: "33051000", codigoCliente: 9, descricaoCliente: "DIVERSOS", tipo: "monofasico" }),
      linha({ ncm: "42022210", codigoCliente: 9, descricaoCliente: "DIVERSOS", tipo: "normal" }),
    ]);

    expect(r.codigosIncoerentes).toHaveLength(1);
    expect(r.codigosIncoerentes[0].codigoCliente).toBe(9);
    expect(r.codigosIncoerentes[0].regimes.sort()).toEqual(["monofasico", "normal"]);
  });

  it("não acusa código coerente, mesmo com vários NCMs", () => {
    const r = montarRelatorioProcesso([
      linha({ ncm: "61034900", codigoCliente: 6, tipo: "normal" }),
      linha({ ncm: "61069000", codigoCliente: 6, tipo: "normal" }),
      linha({ ncm: "62034900", codigoCliente: 6, tipo: "normal" }),
    ]);
    expect(r.codigosIncoerentes).toHaveLength(0);
  });

  it("ignora linha sem classificação ao julgar coerência", () => {
    // NCM que ainda não foi classificado não pode gerar acusação: não sabemos
    // o regime dele, e apontar erro sem saber é adivinhar.
    const r = montarRelatorioProcesso([
      linha({ ncm: "33051000", codigoCliente: 9, tipo: "monofasico" }),
      linha({ ncm: "62193000", codigoCliente: 9, tipo: null }),
    ]);
    expect(r.codigosIncoerentes).toHaveLength(0);
    expect(r.semClassificacao).toEqual(["62193000"]);
  });

  it("lista os NCMs em regime especial, sem os normais", () => {
    const r = montarRelatorioProcesso([
      linha({ ncm: "33051000", codigoCliente: 61, descricaoCliente: "XAMPUS", tipo: "monofasico" }),
      linha({ ncm: "33061000", codigoCliente: 2, descricaoCliente: "DENTIFRÍCIOS", tipo: "aliquota_zero" }),
      linha({ ncm: "61034900", codigoCliente: 6, tipo: "normal" }),
    ]);
    expect(r.regimesEspeciais.map((i) => i.ncm)).toEqual(["33061000", "33051000"]);
  });

  it("só acusa incoerência na tabela do cliente, mas lista regime especial de qualquer origem", () => {
    // Incoerência: NCM incluído pela nossa base recebe numeração nova, que não
    // corresponde a um código de configuração real no Domínio dele — não serve
    // de evidência de erro no cadastro.
    //
    // Regime especial: entra na lista de qualquer forma. Se veio da tabela
    // dele, é conferência; se entrou agora, é o que precisa ser cadastrado com
    // o regime certo. Nos dois casos, tratar como tributado custa dinheiro.
    const r = montarRelatorioProcesso([
      linha({ ncm: "33051000", origem: "base_plataforma", codigoCliente: 80, tipo: "monofasico" }),
      linha({ ncm: "42022210", origem: "base_plataforma", codigoCliente: 80, tipo: "normal" }),
    ]);
    expect(r.codigosIncoerentes).toHaveLength(0);
    expect(r.regimesEspeciais.map((i) => i.ncm)).toEqual(["33051000"]);
  });

  it("conta origens e regimes", () => {
    const r = montarRelatorioProcesso([
      linha({ ncm: "1", origem: "cliente_legado", codigoCliente: 1, tipo: "normal" }),
      linha({ ncm: "2", origem: "base_plataforma", tipo: "normal" }),
      linha({ ncm: "3", origem: "econet_auto", tipo: "monofasico" }),
      linha({ ncm: "4", origem: "econet_auto", tipo: null }),
    ]);
    expect(r.total).toBe(4);
    expect(r.classificados).toBe(3);
    expect(r.porOrigem.find((o) => o.origem === "econet_auto")?.quantidade).toBe(2);
    expect(r.porRegime.find((t) => t.tipo === "normal")?.quantidade).toBe(2);
  });
});
