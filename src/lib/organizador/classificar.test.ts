import { describe, it, expect } from "vitest";
import { classificarPdf, classificarTexto, acharCnpj } from "./classificar";
import { destinoDoDocumento } from "./destino";
import { detectarTributoPeloNome } from "@/lib/razao/tributos";

describe("acharCnpj", () => {
  it("acha o CNPJ formatado e o cru", () => {
    expect(acharCnpj("CNPJ Matriz: 34.351.482/0001-46")).toBe("34351482000146");
    expect(acharCnpj("|0000|LECD|01012024|31122024|EMPRESA|34351482000146|TO|")).toBe(
      "34351482000146",
    );
  });

  it("devolve null quando não há CNPJ", () => {
    expect(acharCnpj("documento qualquer")).toBeNull();
  });
});

describe("classificarTexto", () => {
  it("reconhece SPED-ECD pelo layout LECD", () => {
    const r = classificarTexto(
      ".txt",
      "|0000|LECD|01012024|31122024|PALMAS QUIOSQUE|34351482000146|TO|",
      "arquivo.txt",
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.classificacao.tipo).toBe("SPED_ECD");
    expect(r.classificacao.ano).toBe(2024);
    expect(r.classificacao.cnpj).toBe("34351482000146");
  });

  it("separa SPED-Contribuições de SPED-Fiscal pelos blocos", () => {
    const contrib = classificarTexto(
      ".txt",
      "|0000|006|0|||01032024|31032024|EMPRESA|34351482000146|\n|M200|1000,00|\n",
      "a.txt",
    );
    expect(contrib.ok && contrib.classificacao.tipo).toBe("SPED_CONTRIBUICOES");

    const fiscal = classificarTexto(
      ".txt",
      "|0000|017|0|01032024|31032024|EMPRESA|34351482000146|TO|294964258|\n|C100|0|1|\n|E110|500,00|\n",
      "b.txt",
    );
    expect(fiscal.ok && fiscal.classificacao.tipo).toBe("SPED_FISCAL");
  });

  it("reconhece SPED grande sem depender de bloco na amostra", () => {
    // Em arquivo de centenas de MB, nem |M200| (Contribuições) nem |C100|
    // (Fiscal) aparecem nos primeiros 8 KB que o robô lê. Só o formato do 0000
    // resolve — e foi por isso que 100+ PISCOFINS ficaram parados na quarentena.
    const contribSemBlocoM = classificarTexto(
      ".txt",
      "|0000|006|0|||01032024|31032024|CASA SAO PAULO CALCADOS LTDA|37417896000119|\n|0001|0|\n",
      "PISCOFINS_20240301.txt",
    );
    expect(contribSemBlocoM.ok).toBe(true);
    if (!contribSemBlocoM.ok) return;
    expect(contribSemBlocoM.classificacao.tipo).toBe("SPED_CONTRIBUICOES");
    expect(contribSemBlocoM.classificacao.ano).toBe(2024);
    expect(contribSemBlocoM.classificacao.mes).toBe(3);
    expect(contribSemBlocoM.classificacao.nomeEmpresa).toBe("CASA SAO PAULO CALCADOS LTDA");

    const fiscalSemC100 = classificarTexto(
      ".txt",
      "|0000|017|0|01082023|31082023|CRS ATACADISTA LTDA|43211383000150||TO|295155671|\n|0001|0|\n",
      "sped.txt",
    );
    expect(fiscalSemC100.ok).toBe(true);
    if (!fiscalSemC100.ok) return;
    expect(fiscalSemC100.classificacao.tipo).toBe("SPED_FISCAL");
    expect(fiscalSemC100.classificacao.mes).toBe(8);
  });

  it("reconhece DCTF antiga pelo cabeçalho DCTFM", () => {
    const r = classificarTexto(".dec", "DCTFM2.5" + "R10" + "1".repeat(14) + "202203", "x.dec");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.classificacao.tipo).toBe("DCTF_ANTIGA");
    expect(r.classificacao.ano).toBe(2022);
    expect(r.classificacao.mes).toBe(3);
  });

  it("recusa .txt sem assinatura", () => {
    const r = classificarTexto(".txt", "relatorio qualquer\nlinha 2", "x.txt");
    expect(r.ok).toBe(false);
  });
});

describe("classificarPdf", () => {
  const cabecalhoCnpj = "34.351.482/0001-46 PALMAS QUIOSQUE COMERCIO";

  it("comprovante vem antes de guia — a ordem dos testes importa", () => {
    // O comprovante também fala em "arrecadação do Simples Nacional"; se a guia
    // fosse testada primeiro, todo comprovante viraria guia.
    const r = classificarPdf(
      `${cabecalhoCnpj}\nComprovante de Arrecadação\nComprovamos que consta nos sistemas da Receita Federal registro de arrecadação de DAS com os dados a seguir:\n11/2025 22/12/2025 07202534312242658`,
      "PAGAMENTO 2025.pdf",
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.classificacao.tipo).toBe("COMPROVANTE_ARRECADACAO");
  });

  it("declaração PGDAS-D é separada da guia pelo 'Declaratório'", () => {
    const decl = classificarPdf(
      `Programa Gerador do Documento de Arrecadação do Simples Nacional - Declaratório\n${cabecalhoCnpj}\nPeríodo de Apuração: 01/12/2025 a 31/12/2025`,
      "PGDASD-DECLARACAO.pdf",
    );
    expect(decl.ok).toBe(true);
    if (!decl.ok) return;
    expect(decl.classificacao.tipo).toBe("PGDASD_DECLARACAO");
    expect(decl.classificacao.ano).toBe(2025);
    expect(decl.classificacao.mes).toBe(12);

    const guia = classificarPdf(
      `Documento de Arrecadação\ndo Simples Nacional\n${cabecalhoCnpj}\nDezembro/2025 20/01/2026`,
      "PGDASD-DAS-12.2025.pdf",
    );
    expect(guia.ok).toBe(true);
    if (!guia.ok) return;
    expect(guia.classificacao.tipo).toBe("DAS_GUIA");
    expect(guia.classificacao.mes).toBe(12);
  });

  it("razão: o tributo vem da CONTA, não do nome do arquivo", () => {
    const r = classificarPdf(
      `Empresa: PALMAS QUIOSQUE\nC.N.P.J.: 34.351.482/0001-46\nPeríodo: 01/08/2019 - 31/07/2026\nRAZÃO\nData Número Histórico Saldo-Exercício\nConta: 191 - 2.1.50.200.1 INSS A RECOLHER`,
      "documento sem nome util.pdf",
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.classificacao.tipo).toBe("RAZAO");
    expect(r.classificacao.tributo).toBe("INSS");
  });

  it("razão sem tributo identificável vai para quarentena, não para um palpite", () => {
    const r = classificarPdf(
      `RAZÃO\nConta: 999 - 9.9.99.999.9 CONTA GENERICA\nSaldo-Exercício`,
      "razao.pdf",
    );
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.motivo).toMatch(/tributo n[ãa]o foi identificado/i);
  });

  it("notificação de multa não é declaração do PGDAS-D", () => {
    // Caso real: uma NOTIFICAÇÃO DE LANÇAMENTO de multa da EFD-Contribuições da
    // Casa São Paulo (Lucro Real, que nem PGDAS tem) foi arquivada como
    // declaração do Simples porque o classificador aceitava qualquer PDF com
    // "Período de Apuração". A competência ainda saiu errada: pegou 05/2024, que
    // era o prazo de entrega, não a apuração de 03/2024.
    const r = classificarPdf(
      `MINISTÉRIO DA ECONOMIA\nNOTIFICAÇÃO DE LANÇAMENTO\nMULTA POR ATRASO NA ENTREGA DA ESCRITURAÇÃO FISCAL DIGITAL DAS CONTRIBUIÇÕES\nCNPJ: 37.417.896/0001-19\nPeríodo de Apuração (PA) Prazo Final Entrega\n03/2024 15/05/2024`,
      "RECIBO DE ENTREGA 03.2024.pdf",
    );
    expect(r.ok).toBe(false);
  });

  it("recibo de entrega de SPED vira RECIBO_SPED, com a competência do período", () => {
    // Texto real do recibo da SR SPORTS (03/2026), com a ordem embaralhada que
    // o pdf-parse produz — o rótulo "Período de apuração:" sai DEPOIS do valor.
    const r = classificarPdf(
      `MINISTÉRIO DA FAZENDA\nRECIBO DE ENTREGA DE ESCRITURAÇÃO FISCAL DIGITAL - CONTRIBUIÇÕES\n` +
        `APURAÇÃO DAS CONTRIBUIÇÕES SOCIAS PIS/PASEP COFINS\n` +
        `SR SPORTS COMERCIO DE ARTIGOS ESPORTIVOS LTDA.\n11.170.630/0001-20\n` +
        `01/03/2026 a 31/03/2026\nOriginal\nPeríodo de apuração:\nContribuinte:\nCNPJ:`,
      "03.2026.pdf",
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.classificacao.tipo).toBe("RECIBO_SPED");
    expect(r.classificacao.reciboDe).toBe("CONTRIBUICOES");
    expect(r.classificacao.ano).toBe(2026);
    expect(r.classificacao.mes).toBe(3);
    expect(r.classificacao.cnpj).toBe("11170630000120");
  });

  it("recibo de ECD não vira Balanço do Domínio", () => {
    // O recibo transcreve o conteúdo da escrituração e fala em "balanço"; se a
    // regra do balanço viesse antes, o recibo seria arquivado como demonstração.
    const r = classificarPdf(
      `SISTEMA PÚBLICO DE ESCRITURAÇÃO DIGITAL\nRECIBO DE ENTREGA DE ESCRITURAÇÃO CONTÁBIL DIGITAL\n` +
        `BALANÇO PATRIMONIAL\n44.172.449/0001-02\n01/01/2025 a 31/12/2025`,
      "RECIBO BALANÇO E DRE SPED 2025.pdf",
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.classificacao.tipo).toBe("RECIBO_SPED");
    expect(r.classificacao.reciboDe).toBe("ECD");
    expect(r.classificacao.mes).toBeNull(); // ECD é anual
  });

  it("PDF desconhecido é recusado", () => {
    const r = classificarPdf("Contrato de prestação de serviços", "contrato.pdf");
    expect(r.ok).toBe(false);
  });
});

describe("destinoDoDocumento", () => {
  const base = {
    ano: 2025,
    mes: 12,
    cnpj: "34351482000146",
    nomeEmpresa: null,
    inscricaoEstadual: null,
    tributo: null,
    reciboDe: null,
    contaCodigo: null,
    documentos: 1,
    evidencia: "",
  };

  it("manda cada tipo para onde o leitor dele procura", () => {
    const casos: Array<[Parameters<typeof destinoDoDocumento>[0], string]> = [
      [{ ...base, tipo: "SPED_ECD" }, "SPED-ECD\\2025\\2025.txt"],
      [{ ...base, tipo: "SPED_FISCAL" }, "SPED-FISCAL\\2025\\12.txt"],
      [{ ...base, tipo: "DAS_GUIA" }, "FISCAL\\IMPOSTOS\\SIMPLES NACIONAL\\2025\\DAS-12.2025.pdf"],
      [
        { ...base, tipo: "PGDASD_DECLARACAO" },
        "FISCAL\\IMPOSTOS\\SIMPLES NACIONAL\\2025\\PGDASD-DECLARACAO-12.2025.pdf",
      ],
      [
        { ...base, tipo: "COMPROVANTE_ARRECADACAO" },
        "FISCAL\\IMPOSTOS\\SIMPLES NACIONAL\\2025\\COMPROVANTE-ARRECADACAO-2025.pdf",
      ],
      [{ ...base, tipo: "BALANCO_DOMINIO" }, "BALANCOS-DOMINIO\\2025\\balanco.pdf"],
    ];
    for (const [cls, esperado] of casos) {
      const ext = esperado.endsWith(".txt") ? ".txt" : ".pdf";
      const r = destinoDoDocumento(cls, ext);
      expect(r.ok, cls.tipo).toBe(true);
      if (!r.ok) continue;
      expect(r.destino.relativo, cls.tipo).toBe(esperado);
    }
  });

  it("razão vira 'Razao <TRIBUTO>' — o nome é o de-para da conciliação", () => {
    const r = destinoDoDocumento({ ...base, tipo: "RAZAO", tributo: "ICMS" }, ".pdf");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.destino.relativo).toBe("RAZAO\\Razao ICMS.pdf");
  });

  it("dois razões do mesmo tributo não brigam pelo mesmo arquivo", () => {
    // A LUPO tem ICMS normal (2.1.40.100.2) e ICMS DIFAL (2.1.40.102.5). Sem o
    // código da conta no nome, o segundo sobrescreveria o primeiro — foi o
    // conflito que a simulação apontou antes de qualquer arquivo ser tocado.
    const normal = destinoDoDocumento(
      { ...base, tipo: "RAZAO", tributo: "ICMS", contaCodigo: "2.1.40.100.2" },
      ".pdf",
    );
    const difal = destinoDoDocumento(
      { ...base, tipo: "RAZAO", tributo: "ICMS", contaCodigo: "2.1.40.102.5" },
      ".pdf",
    );
    expect(normal.ok && difal.ok).toBe(true);
    if (!normal.ok || !difal.ok) return;
    expect(normal.destino.relativo).toBe("RAZAO\\Razao ICMS 2.1.40.100.2.pdf");
    expect(difal.destino.relativo).toBe("RAZAO\\Razao ICMS 2.1.40.102.5.pdf");
    expect(normal.destino.relativo).not.toBe(difal.destino.relativo);
  });

  it("o nome gerado continua sendo reconhecido como do tributo certo", () => {
    // Se o robô renomeia para um nome que a conciliação não reconhece, ele
    // "organiza" e quebra a tela no mesmo movimento.
    expect(detectarTributoPeloNome("Razao ICMS 2.1.40.102.5.pdf")).toBe("ICMS");
    expect(detectarTributoPeloNome("Razao SIMPLES NACIONAL 2.1.40.101.5.pdf")).toBe(
      "SIMPLES_NACIONAL",
    );
    expect(detectarTributoPeloNome("Razao INSS 2.1.50.200.1.pdf")).toBe("INSS");
  });

  it("sem ano, não arquiva — ano chutado é pior que quarentena", () => {
    const r = destinoDoDocumento({ ...base, tipo: "SPED_ECD", ano: null }, ".txt");
    expect(r.ok).toBe(false);
  });
});
