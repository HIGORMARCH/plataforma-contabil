import { describe, it, expect } from "vitest";
import {
  parseComprovanteArrecadacao,
  parsePaginaArrecadacao,
  separarPaginas,
} from "./parseComprovanteArrecadacao";

/**
 * Duas páginas do `PAGAMENTO 2025.pdf` real da LUPO QUIOSQUE — uma de DARF
 * (folha: INSS dos segurados + IRRF) e uma de DAS. Reproduz o embaralhamento do
 * `pdf-parse` e o "-" no lugar do zero, que é o detalhe que quebra parser
 * ingênuo.
 */
const COMPROVANTE = `
Data de Vencimento
34.351.482/0001-46 PALMAS QUIOSQUE COMERCIO DE ACESSORIOS E
30/11/2025 19/12/2025 07162533820630232
CNPJ
Período Apuração
Comprovamos que consta nos sistemas da Receita Federal registro de arrecadação de DARF com os dados a seguir:
Razão Social
Número do Documento
Comprovante de Arrecadação
Código Descrição Total	Juros	Multa	Principal
Composição do Documento de Arrecadação
1082 Contrib Previd Descontada de Segurados 1.427,27 - - 1.427,27
01 - CP SEGURADOS - EMPREGADOS/AVULSO
0561 IRRF - Rendimentos do trabalho assalariado 236,11 - - 236,11
07 - IRRF - RD TRB ASSAL PAÍS/AUS NO EXT A SERV PAÍS
Totais 1.663,38 0,00 0,00 1.663,38
Comprovante emitido às 16:07:20 de 29/08/2026 (horário de Brasília), sob o código de controle
Banco Data de Arrecadação
Agência Estabelecimento Valor Reservado/Restituído Referência
16/12/2025	237 - BANCO BRADESCO S.A.
2397 2671 0,00

-- 1 of 26 --

Data de Vencimento
34.351.482/0001-46 PALMAS QUIOSQUE COMERCIO DE ACESSORIOS E
11/2025 22/12/2025 07202534312242658
CNPJ
Competência
Comprovamos que consta nos sistemas da Receita Federal registro de arrecadação de DAS com os dados a seguir:
Razão Social
Número do Documento
Comprovante de Arrecadação
Código Descrição Total	Juros	Multa	Principal
Composição do Documento de Arrecadação
1001 IRPJ - SIMPLES NACIONAL 324,34 - - 324,34
1002 CSLL - SIMPLES NACIONAL 206,40 - - 206,40
1004 COFINS - SIMPLES NACIONAL 751,30 - - 751,30
1005 PIS - SIMPLES NACIONAL 162,76 - - 162,76
1006 INSS - SIMPLES NACIONAL 2.476,81 - - 2.476,81
1007 ICMS - SIMPLES NACIONAL 1.975,55 - - 1.975,55
Totais 5.897,16 0,00 0,00 5.897,16
Banco Data de Arrecadação
Agência Estabelecimento Valor Reservado/Restituído Referência
16/12/2025	237 - BANCO BRADESCO S.A.
2397 2671 0,00

-- 2 of 26 --
`;

describe("separarPaginas", () => {
  it("quebra o comprovante pelos marcadores de página", () => {
    expect(separarPaginas(COMPROVANTE)).toHaveLength(2);
  });
});

describe("parseComprovanteArrecadacao", () => {
  it("lê os dois documentos pagos, cada um com seu tipo", () => {
    const r = parseComprovanteArrecadacao(COMPROVANTE);
    expect(r.arrecadacoes).toHaveLength(2);
    expect(r.paginasIgnoradas).toEqual([]);
    expect(r.arrecadacoes.map((a) => a.tipo)).toEqual(["DARF", "DAS"]);
  });

  it("extrai pagamento, banco e data de arrecadação do DAS", () => {
    const das = parseComprovanteArrecadacao(COMPROVANTE).arrecadacoes[1];
    expect(das.cnpj).toBe("34351482000146");
    expect(das.ano).toBe(2025);
    expect(das.mes).toBe(11);
    expect(das.numeroDocumento).toBe("07202534312242658");
    expect(das.dataVencimento?.toISOString().slice(0, 10)).toBe("2025-12-22");
    expect(das.dataArrecadacao?.toISOString().slice(0, 10)).toBe("2025-12-16");
    expect(das.banco).toContain("BRADESCO");
    expect(das.valorTotal).toBe(5897.16);
    expect(das.juros).toBe(0);
    expect(das.multa).toBe(0);
    expect(das.composicao).toHaveLength(6);
    expect(das.alertas).toEqual([]);
  });

  it("no DARF de folha, separa INSS de IRRF pela composição", () => {
    const darf = parseComprovanteArrecadacao(COMPROVANTE).arrecadacoes[0];
    // Período de apuração com dia (30/11/2025) vira a competência 11/2025.
    expect(darf.ano).toBe(2025);
    expect(darf.mes).toBe(11);
    const porCodigo = Object.fromEntries(darf.composicao.map((l) => [l.codigo, l.total]));
    expect(porCodigo).toEqual({ "1082": 1427.27, "0561": 236.11 });
    expect(darf.valorTotal).toBe(1663.38);
  });

  it("lê '-' como zero, sem virar NaN", () => {
    const darf = parseComprovanteArrecadacao(COMPROVANTE).arrecadacoes[0];
    for (const linha of darf.composicao) {
      expect(Number.isFinite(linha.juros)).toBe(true);
      expect(Number.isFinite(linha.multa)).toBe(true);
      expect(linha.juros).toBe(0);
      expect(linha.multa).toBe(0);
    }
  });

  it("recusa página que não é comprovante, dizendo o motivo", () => {
    const r = parsePaginaArrecadacao("Documento de Arrecadação do Simples Nacional\nTotais 100,00");
    expect("erro" in r).toBe(true);
  });
});
