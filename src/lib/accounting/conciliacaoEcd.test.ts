import { describe, expect, it } from "vitest";
import { conciliarPorConta, conciliarPorSintetica } from "./conciliacaoEcd";
import { descNormAgressiva, type ContaAnalitica } from "./contasAnaliticas";

/** Helper: monta uma ContaAnalitica com defaults sensatos pra teste. */
function conta(
  codigo: string,
  descricao: string,
  valor: number,
  grupo: ContaAnalitica["grupo"] = "ativo-circulante",
): ContaAnalitica {
  return { codigo, descricao, descNorm: descricao.toLowerCase().trim(), valor, grupo };
}

describe("conciliarPorConta — matching Domínio × ECD por descrição", () => {
  it("classifica identicas, divergentes, só-Domínio e só-ECD", () => {
    const dominio: ContaAnalitica[] = [
      conta("1.1.1.001", "CAIXA GERAL", 1000),
      conta("1.1.2.001", "CLIENTES NACIONAIS", 50_000),
      conta("1.1.2.002", "CHEQUES A COMPENSAR", 500), // só no Domínio
      conta("2.1.1.001", "FORNECEDORES", -30_000, "passivo-circulante"),
    ];
    const ecd: ContaAnalitica[] = [
      // códigos diferentes intencionalmente — matching é por descrição
      conta("1.01.001", "CAIXA GERAL", 1000),
      conta("1.01.010", "CLIENTES NACIONAIS", 45_000), // diverge R$ 5k
      conta("1.02.001", "APLICAÇÕES FINANCEIRAS", 12_000), // só na ECD
      conta("2.01.001", "FORNECEDORES", -30_000, "passivo-circulante"),
    ];

    const r = conciliarPorConta(dominio, ecd, 2023);

    expect(r.contagem.identica).toBe(2); // CAIXA + FORNECEDORES
    expect(r.contagem.divergente).toBe(1); // CLIENTES
    expect(r.contagem.soDominio).toBe(1); // CHEQUES
    expect(r.contagem.soEcd).toBe(1); // APLICACOES
  });

  it("mantém código de cada lado (Dom e ECD) mesmo quando difere", () => {
    const r = conciliarPorConta(
      [conta("1.1.2.001", "CLIENTES", 100)],
      [conta("1.01.010", "CLIENTES", 90)],
      2023,
    );
    const divergente = r.blocos.flatMap((b) => b.linhas).find((l) => l.status === "divergente");
    expect(divergente?.codigoDominio).toBe("1.1.2.001");
    expect(divergente?.codigoEcd).toBe("1.01.010");
    expect(divergente?.diferenca).toBe(10);
  });

  it("agrupa por grupo do balanço e ordena por |diferença| desc", () => {
    const r = conciliarPorConta(
      [
        conta("1.1.1", "CAIXA", 100),
        conta("1.1.2", "CLIENTES", 10_000),
        conta("2.1.1", "FORNECEDORES", -500, "passivo-circulante"),
      ],
      [
        conta("1.01", "CAIXA", 100), // idêntica
        conta("1.02", "CLIENTES", 8_000), // diverge R$ 2k
        conta("2.01", "FORNECEDORES", -100, "passivo-circulante"), // diverge R$ 400
      ],
      2023,
    );

    const ac = r.blocos.find((b) => b.grupo === "ativo-circulante");
    expect(ac).toBeDefined();
    // Dentro do AC, CLIENTES (dif 2k) vem antes de CAIXA (dif 0)
    expect(ac!.linhas[0].descricao).toBe("CLIENTES");

    const pc = r.blocos.find((b) => b.grupo === "passivo-circulante");
    expect(pc).toBeDefined();
    expect(pc!.linhas[0].descricao).toBe("FORNECEDORES");
  });

  it("soma múltiplas contas com mesma descrição antes de comparar", () => {
    const dominio: ContaAnalitica[] = [
      conta("1.1.2.001", "CLIENTES", 600),
      conta("1.1.2.002", "CLIENTES", 400), // mesma descrição, agrupa
    ];
    const ecd: ContaAnalitica[] = [conta("1.01", "CLIENTES", 1000)];
    const r = conciliarPorConta(dominio, ecd, 2023);
    expect(r.contagem.identica).toBe(1);
    expect(r.contagem.divergente).toBe(0);
  });

  it("tolerância: diferença ≤ R$ 1 conta como idêntica", () => {
    const r = conciliarPorConta(
      [conta("1.1.1", "CAIXA", 1000.5)],
      [conta("1.01", "CAIXA", 1000.0)],
      2023,
    );
    expect(r.contagem.identica).toBe(1);
    expect(r.contagem.divergente).toBe(0);
  });
});

describe("descNormAgressiva — matching tolerante entre Domínio e ECD", () => {
  it("plural × singular casam", () => {
    expect(descNormAgressiva("CLIENTES DIVERSOS")).toBe(descNormAgressiva("CLIENTE DIVERSO"));
  });

  it("acento e pontuação não importam", () => {
    expect(descNormAgressiva("APLICAÇÃO FINANCEIRA")).toBe(descNormAgressiva("APLICACAO FINANCEIRA"));
    expect(descNormAgressiva("VULCABRAS S/A")).toBe(descNormAgressiva("VULCABRAS S.A."));
  });

  it("prefixos como '(-)' não impedem match", () => {
    expect(descNormAgressiva("(-) DEPRECIAÇÃO ACUMULADA")).toBe(
      descNormAgressiva("DEPRECIACAO ACUMULADA"),
    );
  });

  it("ordem de palavras não importa", () => {
    expect(descNormAgressiva("MACOPAN MATERIAIS DE CONSTRUCAO")).toBe(
      descNormAgressiva("CONSTRUCAO MATERIAIS MACOPAN DE"),
    );
  });

  it("descrições realmente diferentes NÃO casam", () => {
    expect(descNormAgressiva("CLEBER ARAUJO DA SILVA")).not.toBe(
      descNormAgressiva("CLEDSON ALMEIDA BARROS"),
    );
    expect(descNormAgressiva("CAIXA GERAL")).not.toBe(descNormAgressiva("BANCO GERAL"));
  });
});

describe("conciliarPorSintetica — agrupamento hierárquico por sintética ECD", () => {
  /** Adiciona sintética à conta (só faz sentido no lado ECD normalmente). */
  const comSintetica = (c: ContaAnalitica, codSint: string, descSint: string): ContaAnalitica => ({
    ...c,
    codigoSintetica: codSint,
    descricaoSintetica: descSint,
  });

  it("agrupa por sintética ECD e computa Δ = Dom − ECD", () => {
    const dominio: ContaAnalitica[] = [
      conta("1.1.20.100.1", "CLIENTES DIVERSOS", 100),
      conta("1.1.20.100.2", "CLIENTES ATACADO", 50),
    ];
    const ecd: ContaAnalitica[] = [
      comSintetica(conta("504", "CLIENTES DIVERSOS", 80), "50", "CLIENTES"),
      comSintetica(conta("505", "CLIENTES ATACADO", 50), "50", "CLIENTES"),
    ];
    const r = conciliarPorSintetica(dominio, ecd, 2023);

    // Uma sintética "CLIENTES" agrupando as duas analíticas.
    expect(r.blocos).toHaveLength(1);
    const [bloco] = r.blocos;
    expect(bloco.descricaoSintetica).toBe("CLIENTES");
    expect(bloco.totalDominio).toBe(150);
    expect(bloco.totalEcd).toBe(130);
    expect(bloco.diferenca).toBe(20); // Dom sobra R$ 20
    expect(bloco.fecha).toBe(false);
    expect(bloco.analiticas).toHaveLength(2);
  });

  it("sintética que fecha (Δ ≤ 1) tem fecha=true", () => {
    const r = conciliarPorSintetica(
      [conta("1.1.20.100.1", "FORNECEDORES ALPHA", 500), conta("1.1.20.100.2", "FORNECEDORES BETA", 300)],
      [
        comSintetica(conta("801", "FORNECEDORES ALPHA", 500), "80", "FORNECEDORES"),
        comSintetica(conta("802", "FORNECEDORES BETA", 300), "80", "FORNECEDORES"),
      ],
      2023,
    );
    expect(r.blocos[0].fecha).toBe(true);
    expect(r.contagem.sinteticasFechadas).toBe(1);
    expect(r.contagem.sinteticasDivergentes).toBe(0);
  });

  it("sintética que fecha por compensação interna (uma analítica diverge, outra compensa)", () => {
    const r = conciliarPorSintetica(
      [conta("1.1.20.100.1", "CLIENTE A", 100), conta("1.1.20.100.2", "CLIENTE B", 200)],
      [
        comSintetica(conta("501", "CLIENTE A", 150), "50", "CLIENTES"), // Dom −50
        comSintetica(conta("502", "CLIENTE B", 150), "50", "CLIENTES"), // Dom +50
      ],
      2023,
    );
    // Total sintético fecha (300 vs 300), mesmo com analíticas divergindo.
    expect(r.blocos[0].fecha).toBe(true);
    expect(r.blocos[0].diferenca).toBe(0);
    // Mas as analíticas continuam marcadas como divergentes.
    expect(r.blocos[0].analiticas.filter((a) => a.status === "divergente")).toHaveLength(2);
  });

  it("analíticas Domínio sem match ECD vão pra soDominioSemSintetica", () => {
    const dominio: ContaAnalitica[] = [
      conta("1.1.20.100.1", "CLIENTE NOVO", 500), // só no Domínio, sem sintética
    ];
    const ecd: ContaAnalitica[] = []; // ECD vazia
    const r = conciliarPorSintetica(dominio, ecd, 2023);
    expect(r.blocos).toHaveLength(0);
    expect(r.soDominioSemSintetica).toHaveLength(1);
    expect(r.soDominioSemSintetica[0].linhas[0].descricao).toBe("CLIENTE NOVO");
  });

  it("ordena blocos: não-fechados primeiro, depois por |Δ| desc", () => {
    const r = conciliarPorSintetica(
      [
        conta("A1", "CAIXA GERAL", 100),
        conta("B1", "CLIENTE X", 1000),
        conta("C1", "FORNECEDOR X", 500, "passivo-circulante"),
      ],
      [
        comSintetica(conta("A", "CAIXA GERAL", 100), "1", "CAIXA E EQUIV"), // fecha
        comSintetica(conta("B", "CLIENTE X", 500), "5", "CLIENTES"), // Δ 500
        comSintetica({ ...conta("C", "FORNECEDOR X", 400, "passivo-circulante") }, "80", "FORNECEDORES"), // Δ 100
      ],
      2023,
    );
    // Ordem esperada por bloco: CLIENTES (Δ 500), FORNECEDORES (Δ 100), CAIXA (fecha).
    // Mas a ordem primária é por grupo do BP — AC vem antes de PC.
    // Dentro do AC: CLIENTES (Δ 500, não fecha) antes de CAIXA (fecha).
    expect(r.blocos[0].descricaoSintetica).toBe("CLIENTES");
    expect(r.blocos[1].descricaoSintetica).toBe("CAIXA E EQUIV");
    expect(r.blocos[2].descricaoSintetica).toBe("FORNECEDORES");
  });
});
