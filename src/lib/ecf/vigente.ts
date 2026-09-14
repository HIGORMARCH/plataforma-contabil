/**
 * Qual ECF vale quando a mesma pasta tem mais de um arquivo DIFERENTE do mesmo
 * ano. Decisão do Higor (13/09/2026): antes de recusar, olhar se é retificadora
 * — a última entrega aceita é a que vale.
 *
 * Não é adivinhar: o próprio |0000| diz se o arquivo é retificadora (campo
 * RETIFICADORA = "S", com o recibo da entrega que ele substitui).
 *
 *   - uma retificadora            → ela vale; as demais foram substituídas
 *   - várias retificadoras        → vale a de transmissão mais recente, lida do
 *                                   nome do ReceitanetBX (SPEDECF-CNPJ-INI-FIM-AAAAMMDDHHMMSS)
 *   - sem retificadora, ou várias sem data de transmissão no nome → não escolhe
 */

export interface ArquivoEcf {
  nomeArquivo: string;
  conteudo: string;
}

export type EscolhaVigente<T extends ArquivoEcf> =
  | { ok: true; vigente: T; substituidos: T[]; motivo: string }
  | { ok: false; motivo: string };

/** Campo RETIFICADORA do |0000|LECF| — "N" original, "S" retificadora, "F" original com mudança de forma. */
export function retificadoraDoZero(conteudo: string): string | null {
  const m = conteudo
    .slice(0, 2000)
    .match(/^\|0000\|LECF\|[^|]*\|\d{14}\|[^|]*\|(?:[^|]*\|){4}\d{8}\|\d{8}\|([^|]*)\|/m);
  return m ? m[1] : null;
}

/** Data e hora da transmissão no nome gerado pelo ReceitanetBX, como AAAAMMDDHHMMSS. */
export function transmissaoDoNome(nomeArquivo: string): string | null {
  const m = /^SPEDECF-\d{14}-\d{8}-\d{8}-(\d{14})\.txt$/i.exec(nomeArquivo);
  return m ? m[1] : null;
}

export function escolherEcfVigente<T extends ArquivoEcf>(distintos: T[]): EscolhaVigente<T> {
  const nomes = distintos.map((c) => c.nomeArquivo).join(" · ");
  const retificadoras = distintos.filter((c) => retificadoraDoZero(c.conteudo) === "S");

  if (retificadoras.length === 0) {
    return {
      ok: false,
      motivo: `${distintos.length} arquivos diferentes do mesmo ano e nenhum é retificadora (${nomes}) — deixe só o que vale`,
    };
  }

  if (retificadoras.length === 1) {
    const vigente = retificadoras[0];
    return {
      ok: true,
      vigente,
      substituidos: distintos.filter((c) => c !== vigente),
      motivo: `retificadora ${vigente.nomeArquivo}`,
    };
  }

  const comData = retificadoras.map((c) => ({ c, data: transmissaoDoNome(c.nomeArquivo) }));
  if (comData.some((x) => !x.data)) {
    return {
      ok: false,
      motivo: `${retificadoras.length} retificadoras do mesmo ano sem data de transmissão no nome (${retificadoras
        .map((c) => c.nomeArquivo)
        .join(" · ")}) — deixe só a última`,
    };
  }
  comData.sort((a, b) => b.data!.localeCompare(a.data!));
  const vigente = comData[0].c;
  return {
    ok: true,
    vigente,
    substituidos: distintos.filter((c) => c !== vigente),
    motivo: `última retificadora transmitida (${vigente.nomeArquivo})`,
  };
}
