import { describe, it, expect } from "vitest";
import { historicoDaLinha, resumirPorCompetencia, type RazaoLido } from "./parseRazaoPdf";
import { tributoDoCodigoReceita } from "./tributos";

/**
 * Itens de uma linha real do razão do Domínio (RazaoINSS.pdf da LUPO, y=706).
 * O relatório imprime o MESMO histórico em cinco posições X diferentes — é o
 * que faz o texto sair quintuplicado se ninguém deduplicar.
 */
const LINHA_REPETIDA = [
  { x: 0, str: "30/09/2019" },
  { x: 1, str: "REFERENTE" },
  { x: 40, str: "DESCONTO INSS EMPREGADO" },
  { x: 54, str: "444399" },
  { x: 79, str: "REFERENTE" },
  { x: 118, str: "DESCONTO INSS EMPREGADO" },
  { x: 143, str: "REFERENTE" },
  { x: 182, str: "DESCONTO INSS EMPREGADO" },
  { x: 282, str: "REFERENTE" },
  { x: 321, str: "DESCONTO INSS EMPREGADO" },
  { x: 408, str: "REFERENTE" },
  { x: 446, str: "291,33" },
  { x: 447, str: "DESCONTO INSS EMPREGADO" },
  { x: 530, str: "291,33C" },
];

describe("historicoDaLinha", () => {
  it("não repete o histórico impresso em várias posições", () => {
    expect(historicoDaLinha(LINHA_REPETIDA)).toBe("REFERENTE DESCONTO INSS EMPREGADO");
  });

  it("ignora valores que caem na faixa X do histórico", () => {
    const linha = [
      { x: 79, str: "PAGAMENTO INSS Mensal" },
      { x: 159, str: "08/2019" },
      { x: 300, str: "143,02" },
    ];
    expect(historicoDaLinha(linha)).toBe("PAGAMENTO INSS Mensal 08/2019");
  });

  it("devolve vazio quando o Domínio não imprime histórico", () => {
    // Acontece de verdade: a partir de 06/2023 as baixas do INSS saem sem
    // histórico, só com data, número, contrapartida e valor.
    const linha = [
      { x: 0, str: "20/06/2023" },
      { x: 54, str: "445220" },
      { x: 341, str: "1719" },
      { x: 386, str: "943,36" },
      { x: 524, str: "3.131,88D" },
    ];
    expect(historicoDaLinha(linha)).toBe("");
  });
});

describe("resumirPorCompetencia", () => {
  it("usa a competência do histórico, não a data do lançamento", () => {
    // O pagamento de agosto sai em setembro; quem manda é a competência, senão
    // o confronto com a guia nunca bate.
    const razao: RazaoLido = {
      empresa: null,
      cnpj: null,
      conta: null,
      contaCodigo: null,
      periodoInicio: null,
      periodoFim: null,
      saldoAnterior: 0,
      alertas: [],
      lancamentos: [
        {
          data: new Date(Date.UTC(2019, 7, 30)),
          numero: "444393",
          historico: "REFERENTE DESCONTO INSS EMPREGADO 08/2019",
          contraPartida: null,
          debito: 0,
          credito: 172.54,
          saldo: 172.54,
          naturezaSaldo: "C",
          competencia: new Date(Date.UTC(2019, 7, 1)),
        },
        {
          data: new Date(Date.UTC(2019, 8, 20)),
          numero: "444013",
          historico: "PAGAMENTO INSS Mensal 08/2019",
          contraPartida: "556",
          debito: 143.02,
          credito: 0,
          saldo: 0,
          naturezaSaldo: "C",
          competencia: new Date(Date.UTC(2019, 7, 1)),
        },
      ],
    };

    const resumo = resumirPorCompetencia(razao);
    expect(resumo).toHaveLength(1);
    expect(resumo[0].competencia.toISOString().slice(0, 7)).toBe("2019-08");
    expect(resumo[0].credito).toBe(172.54);
    expect(resumo[0].debito).toBe(143.02);
  });
});

describe("tributoDoCodigoReceita", () => {
  it("ignora zero à esquerda — '561' do e-CAC é o '0561' do comprovante", () => {
    expect(tributoDoCodigoReceita("561")).toBe("IRRF");
    expect(tributoDoCodigoReceita("0561")).toBe("IRRF");
  });

  it("classifica os códigos do DAS e do DARF de folha", () => {
    expect(tributoDoCodigoReceita("3333")).toBe("SIMPLES_NACIONAL");
    expect(tributoDoCodigoReceita("1007")).toBe("SIMPLES_NACIONAL");
    expect(tributoDoCodigoReceita("1082")).toBe("INSS");
  });

  it("devolve null para código fora dos nove tributos", () => {
    // Dívida ativa do Simples e MAED da DCTFWeb: existem, são pagos, mas não
    // são tributo corrente de nenhum razão — a tela mostra à parte.
    expect(tributoDoCodigoReceita("1475")).toBeNull();
    expect(tributoDoCodigoReceita("5440")).toBeNull();
  });
});
