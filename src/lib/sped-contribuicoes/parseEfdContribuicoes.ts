/**
 * Parser SPED-Contribuições (EFD-Contribuições) — Bloco M.
 *
 * Foco no essencial pra auditoria PIS/COFINS por competência:
 *   0000 — cabeçalho (CNPJ, período, IND_ATIV)
 *   0110 — regime de apuração (COD_INC_TRIB: 1=cumulativa, 2=não-cum, 3=misto)
 *   M200 — Consolidação PIS/PASEP do período
 *   M600 — Consolidação COFINS do período
 *
 * Layout: linhas delimitadas por `|`, cada linha começa e termina com `|`.
 * Valores decimais usam vírgula (BR): "1234,56". Datas: ddmmaaaa.
 *
 * Layout do M200 (posições, 1-indexed excluindo o "REG"):
 *   1  REG                       = "M200"
 *   2  VL_TOT_CONT_NC_PER       (Contrib não-cumulativa do período)
 *   3  VL_TOT_CRED_DESC          (Créditos descontados)
 *   4  VL_TOT_CRED_DESC_ANT      (Créditos anteriores descontados)
 *   5  VL_TOT_CONT_NC_DEV        (Contrib não-cum devida)
 *   6  VL_RET_NC                 (Retenções não-cum)
 *   7  VL_OUT_DED_NC             (Outras deduções não-cum)
 *   8  VL_CONT_NC_REC            (Contrib não-cum a recolher)
 *   9  VL_TOT_CONT_CUM_PER       (Contrib cumulativa do período)
 *   10 VL_RET_CUM                (Retenções cum)
 *   11 VL_OUT_DED_CUM            (Outras deduções cum)
 *   12 VL_CONT_CUM_REC           (Contrib cum a recolher)
 *   13 VL_TOT_CONT_REC           (TOTAL a recolher = NC + CUM)
 *
 * M600 tem layout IDÊNTICO ao M200, mas para COFINS.
 */

export interface CabecalhoSpedContrib {
  cnpj?: string;
  nome?: string;
  dataInicial?: Date;
  dataFinal?: Date;
  indAtividade?: string; // 0-4
}

export interface RegimeApuracao {
  codIncTrib?: string; // "1" | "2" | "3"
}

export interface ConsolidacaoContribuicao {
  naoCumulativaPeriodo: number; // VL_TOT_CONT_NC_PER
  creditosDescontados: number; // VL_TOT_CRED_DESC
  creditoAnterior: number; // VL_TOT_CRED_DESC_ANT
  naoCumulativaDevida: number; // VL_TOT_CONT_NC_DEV
  cumulativaPeriodo: number; // VL_TOT_CONT_CUM_PER
  contribuicaoDevida: number; // VL_TOT_CONT_REC — o total a recolher
}

export interface ApuracaoSpedContrib {
  cabecalho: CabecalhoSpedContrib;
  regime: RegimeApuracao;
  pis?: ConsolidacaoContribuicao;
  cofins?: ConsolidacaoContribuicao;
  totalLinhas: number;
}

function parseDecimalBR(s: string | undefined): number {
  if (!s) return 0;
  const norm = s.replace(/\./g, "").replace(",", ".");
  const n = Number(norm);
  return Number.isFinite(n) ? n : 0;
}

function parseDataDDMMAAAA(s: string | undefined): Date | undefined {
  if (!s || s.length !== 8) return undefined;
  const dia = Number(s.slice(0, 2));
  const mes = Number(s.slice(2, 4)) - 1;
  const ano = Number(s.slice(4, 8));
  const d = new Date(ano, mes, dia);
  return isNaN(d.getTime()) ? undefined : d;
}

function parseCampos(linha: string): string[] {
  // linha "|A|B|C|" -> ["A","B","C"]
  const trimmed = linha.trim();
  if (!trimmed.startsWith("|") || !trimmed.endsWith("|")) return [];
  return trimmed.slice(1, -1).split("|");
}

function parseConsolidacao(c: string[]): ConsolidacaoContribuicao {
  // c[0] = REG. Ignoramos ele; os campos começam em c[1].
  return {
    naoCumulativaPeriodo: parseDecimalBR(c[1]),
    creditosDescontados: parseDecimalBR(c[2]),
    creditoAnterior: parseDecimalBR(c[3]),
    naoCumulativaDevida: parseDecimalBR(c[4]),
    cumulativaPeriodo: parseDecimalBR(c[8]),
    contribuicaoDevida: parseDecimalBR(c[12]),
  };
}

export function parseEfdContribuicoes(conteudo: string): ApuracaoSpedContrib {
  const linhas = conteudo.split(/\r?\n/);
  const res: ApuracaoSpedContrib = {
    cabecalho: {},
    regime: {},
    totalLinhas: linhas.length,
  };

  for (const linha of linhas) {
    if (!linha || !linha.startsWith("|")) continue;
    const c = parseCampos(linha);
    if (c.length === 0) continue;
    const reg = c[0];

    if (reg === "0000") {
      // |0000|COD_VER|TIPO_ESCRIT|IND_SIT_ESP|NUM_REC_ANT|DT_INI|DT_FIN|NOME|CNPJ|UF|COD_MUN|SUFRAMA|IND_NAT_PJ|IND_ATIV|
      res.cabecalho = {
        dataInicial: parseDataDDMMAAAA(c[5]),
        dataFinal: parseDataDDMMAAAA(c[6]),
        nome: c[7]?.trim() || undefined,
        cnpj: c[8]?.trim() || undefined,
        indAtividade: c[13]?.trim() || undefined,
      };
    } else if (reg === "0110") {
      // |0110|COD_INC_TRIB|IND_APRO_CRED|COD_TIPO_CONT|IND_REG_CUM|
      res.regime = { codIncTrib: c[1]?.trim() || undefined };
    } else if (reg === "M200") {
      res.pis = parseConsolidacao(c);
    } else if (reg === "M600") {
      res.cofins = parseConsolidacao(c);
    }
  }

  return res;
}
