/**
 * Parser SPED-ECF (Escrituração Contábil Fiscal) — anual.
 *
 * Formato: ASCII pipe-delimited (`|BLOCO|REG|...|`). Registros relevantes pra
 * confronto IRPJ/CSLL apurado × DCTF/DCTFWeb (v1 — Lucro Presumido):
 *
 *   |0000|LECF|VERSAO|CNPJ|NOME|...|DT_INI|DT_FIN|...|
 *   |0010||...|PPPP||... (campo IND_APUR_LP = 4 chars, um por trimestre;
 *                        "P"=Presumido, "R"=Real trimestral, "A"=Real anual)
 *
 *   Bloco P (Presumido):
 *     |P030|dtIni|dtFim|T0N|   → abre trimestre N (1..4)
 *     |P300|15|IMPOSTO DE RENDA A PAGAR|valor|   → IRPJ apurado do trimestre
 *     |P500|13|CSLL A PAGAR|valor|               → CSLL apurada do trimestre
 *
 *   Bloco N (Lucro Real), período aberto pelo |N030|dtIni|dtFim|PER|:
 *     T01..T04 (trimestral) → N630 item 26 (IRPJ a pagar) / N670 item 21 (CSLL a pagar)
 *     A00 (ajuste anual)    → N630 item 26 / N670 item 21
 *     A01..A12 (estimativa) → N620 item 26 (IMPOSTO DEVIDO NO MÊS) /
 *                             N660 item 18 (CSLL DEVIDA NO MÊS)
 *   Conferido nas ECF da CONEXAO AGRICOLA (Lucro Real anual, 2019–2024).
 *
 * O regime de cada período sai do próprio período (T = trimestral, A = anual)
 * e não do 0010: a posição do IND_APUR_LP no 0010 muda entre versões do layout.
 *
 * Valores no ECF vêm com vírgula como decimal ("11545,07"). Convertemos.
 */

export interface ApuracaoTrimestral {
  /** Como vem no N030/P030: T01..T04, A00, A01..A12. */
  periodo: string;
  /** 1..4 no trimestral; 0 nos períodos do Lucro Real anual. */
  trimestre: 0 | 1 | 2 | 3 | 4;
  dataInicial: Date;
  dataFinal: Date;
  regime: "PRESUMIDO" | "REAL_TRIMESTRAL" | "REAL_ANUAL";
  irpjApurado: number; // R$
  csllApurado: number; // R$
}

export interface EcfParsed {
  cnpj?: string;
  razaoSocial?: string;
  dataInicial?: Date;
  dataFinal?: Date;
  ano?: number;
  regimeAno?: string; // ex.: "PPPP" (4 trimestres presumido)
  apuracoes: ApuracaoTrimestral[];
}

function parseDataDDMMYYYY(s: string): Date | undefined {
  // ECF usa "01012022" formato DDMMYYYY (sem separador)
  if (!s || s.length !== 8) return undefined;
  const dia = Number(s.slice(0, 2));
  const mes = Number(s.slice(2, 4)) - 1;
  const ano = Number(s.slice(4, 8));
  if (isNaN(dia) || isNaN(mes) || isNaN(ano)) return undefined;
  return new Date(ano, mes, dia);
}

function parseValor(s: string): number {
  if (!s) return 0;
  const norm = s.replace(/\./g, "").replace(",", ".");
  const n = Number(norm);
  return Number.isFinite(n) ? n : 0;
}

function regimeDoCodigo(c: string): ApuracaoTrimestral["regime"] {
  if (c === "R") return "REAL_TRIMESTRAL";
  if (c === "A") return "REAL_ANUAL";
  return "PRESUMIDO";
}

export function parseSpedEcf(conteudo: string): EcfParsed {
  const res: EcfParsed = { apuracoes: [] };
  const linhas = conteudo.split(/\r?\n/);

  // Estado durante a varredura
  let trimestreAtual: ApuracaoTrimestral | undefined;
  const trimestres: Map<string, ApuracaoTrimestral> = new Map();

  for (const linhaRaw of linhas) {
    const linha = linhaRaw.trim();
    if (!linha.startsWith("|")) continue;
    const campos = linha.split("|"); // primeiro e último elementos ficam vazios

    const reg = campos[1];

    if (reg === "0000") {
      // |0000|LECF|VERSAO|CNPJ|NOME|...|DT_INI|DT_FIN|...|
      res.cnpj = campos[4];
      res.razaoSocial = campos[5];
      res.dataInicial = parseDataDDMMYYYY(campos[10] ?? "");
      res.dataFinal = parseDataDDMMYYYY(campos[11] ?? "");
      if (res.dataInicial) res.ano = res.dataInicial.getFullYear();
    } else if (reg === "0010") {
      // IND_APUR_LP: 4 letras, uma por trimestre. A posição muda com o layout
      // (o OPT_PAES saiu a partir de 2020), então procura pelo formato.
      res.regimeAno = campos.slice(2).find((c) => /^[PRAEI]{4}$/.test(c)) ?? campos[7]; // ex.: "PPPP"
    } else if (reg === "P030") {
      // |P030|dtIni|dtFim|T0N|
      const dtIni = parseDataDDMMYYYY(campos[2] ?? "");
      const dtFim = parseDataDDMMYYYY(campos[3] ?? "");
      const tnn = campos[4] ?? ""; // "T01" etc.
      const nTri = Number(tnn.replace(/^T/, "")) as 1 | 2 | 3 | 4;
      if (dtIni && dtFim && nTri >= 1 && nTri <= 4) {
        const regime = regimeDoCodigo((res.regimeAno ?? "PPPP")[nTri - 1] ?? "P");
        trimestreAtual = {
          periodo: `T0${nTri}`,
          trimestre: nTri,
          dataInicial: dtIni,
          dataFinal: dtFim,
          regime,
          irpjApurado: 0,
          csllApurado: 0,
        };
        trimestres.set(trimestreAtual.periodo, trimestreAtual);
      }
    } else if (reg === "P300" && trimestreAtual) {
      // |P300|COD|DESC|VALOR|  — item 15 é "IMPOSTO DE RENDA A PAGAR"
      if (campos[2] === "15") {
        trimestreAtual.irpjApurado = parseValor(campos[4] ?? "0");
      }
    } else if (reg === "P500" && trimestreAtual) {
      // |P500|COD|DESC|VALOR|  — item 13 é "CSLL A PAGAR"
      if (campos[2] === "13") {
        trimestreAtual.csllApurado = parseValor(campos[4] ?? "0");
      }
    } else if (reg === "N030") {
      // Lucro Real — |N030|dtIni|dtFim|PER|. Trimestral: T01..T04 (Casa São
      // Paulo). Anual: A00 = ajuste do ano, A01..A12 = estimativas mensais
      // (CONEXAO AGRICOLA).
      const dtIni = parseDataDDMMYYYY(campos[2] ?? "");
      const dtFim = parseDataDDMMYYYY(campos[3] ?? "");
      const per = campos[4] ?? "";
      const tri = /^T0([1-4])$/.exec(per);
      const anual = /^A(0\d|1[0-2])$/.exec(per);
      if (dtIni && dtFim && (tri || anual)) {
        trimestreAtual = {
          periodo: per,
          trimestre: tri ? (Number(tri[1]) as 1 | 2 | 3 | 4) : 0,
          dataInicial: dtIni,
          dataFinal: dtFim,
          regime: tri ? "REAL_TRIMESTRAL" : "REAL_ANUAL",
          irpjApurado: 0,
          csllApurado: 0,
        };
        trimestres.set(per, trimestreAtual);
      } else {
        trimestreAtual = undefined;
      }
    } else if (reg === "N630" && trimestreAtual && !ehEstimativa(trimestreAtual)) {
      // |N630|COD|DESC|VALOR| — item 26 é "IMPOSTO DE RENDA A PAGAR" (Lucro Real)
      if (campos[2] === "26") {
        trimestreAtual.irpjApurado = parseValor(campos[4] ?? "0");
      }
    } else if (reg === "N670" && trimestreAtual && !ehEstimativa(trimestreAtual)) {
      // |N670|COD|DESC|VALOR| — item 21 é "CSLL A PAGAR" (Lucro Real)
      if (campos[2] === "21") {
        trimestreAtual.csllApurado = parseValor(campos[4] ?? "0");
      }
    } else if (reg === "N620" && trimestreAtual && ehEstimativa(trimestreAtual)) {
      // |N620|COD|DESC|VALOR| — item 26 é "IMPOSTO DEVIDO NO MÊS" (estimativa)
      if (campos[2] === "26") {
        trimestreAtual.irpjApurado = parseValor(campos[4] ?? "0");
      }
    } else if (reg === "N660" && trimestreAtual && ehEstimativa(trimestreAtual)) {
      // |N660|COD|DESC|VALOR| — item 18 é "CSLL DEVIDA NO MÊS" (estimativa)
      if (campos[2] === "18") {
        trimestreAtual.csllApurado = parseValor(campos[4] ?? "0");
      }
    }
  }

  res.apuracoes = [...trimestres.values()].sort((a, b) => a.periodo.localeCompare(b.periodo));
  return res;
}

/** A01..A12 — estimativa mensal do Lucro Real anual (A00 é o ajuste do ano). */
export function ehEstimativa(a: { periodo: string }): boolean {
  return /^A(0[1-9]|1[0-2])$/.test(a.periodo);
}
