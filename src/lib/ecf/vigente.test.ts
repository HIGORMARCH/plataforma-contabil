import { describe, expect, it } from "vitest";
import { escolherEcfVigente, retificadoraDoZero, transmissaoDoNome } from "./vigente";

const zero = (retif: "N" | "S", recibo = "") =>
  `|0000|LECF|0008|37417896000119|CASA SAO PAULO CALCADOS LTDA|0|0|||01012021|31122021|${retif}|${recibo}|0||\n|0010|X|`;

const ORIGINAL = { nomeArquivo: "SPEDECF-37417896000119-20210101-20211231-20220830164404.txt", conteudo: zero("N") };
const RETIFICADORA = {
  nomeArquivo: "SPEDECF-37417896000119-20210101-20211231-20230727164001.txt",
  conteudo: zero("S", "D0CB65F9D4801E6E27F60A460D12ECCD674A50D56"),
};

describe("ECF vigente quando o ano tem mais de um arquivo", () => {
  it("lê o campo RETIFICADORA e a data de transmissão do nome", () => {
    expect(retificadoraDoZero(ORIGINAL.conteudo)).toBe("N");
    expect(retificadoraDoZero(RETIFICADORA.conteudo)).toBe("S");
    expect(transmissaoDoNome(RETIFICADORA.nomeArquivo)).toBe("20230727164001");
    expect(transmissaoDoNome("2021.txt")).toBeNull();
  });

  it("original + retificadora → vale a retificadora (caso real da Casa São Paulo 2021)", () => {
    const r = escolherEcfVigente([ORIGINAL, RETIFICADORA]);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.vigente).toBe(RETIFICADORA);
    expect(r.substituidos).toEqual([ORIGINAL]);
  });

  it("duas retificadoras → vale a de transmissão mais recente", () => {
    const antiga = { nomeArquivo: "SPEDECF-37417896000119-20210101-20211231-20230101090000.txt", conteudo: zero("S", "A") };
    const r = escolherEcfVigente([antiga, RETIFICADORA, ORIGINAL]);
    expect(r.ok && r.vigente).toBe(RETIFICADORA);
  });

  it("só originais diferentes → não escolhe", () => {
    const outra = { nomeArquivo: "CASA_ECF_2021_GERADA.txt", conteudo: zero("N") + "\n|9999|1|" };
    expect(escolherEcfVigente([ORIGINAL, outra]).ok).toBe(false);
  });

  it("várias retificadoras sem data no nome → não escolhe", () => {
    const a = { nomeArquivo: "retif1.txt", conteudo: zero("S", "A") };
    const b = { nomeArquivo: "retif2.txt", conteudo: zero("S", "B") };
    expect(escolherEcfVigente([a, b]).ok).toBe(false);
  });
});
