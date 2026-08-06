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
 * Bloco M/N (Lucro Real) — não coberto na v1 mas o parser deixa hooks.
 *
 * Valores no ECF vêm com vírgula como decimal ("11545,07"). Convertemos.
 */

export interface ApuracaoTrimestral {
  trimestre: 1 | 2 | 3 | 4;
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
  const trimestres: Map<number, ApuracaoTrimestral> = new Map();

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
      // Campo IND_APUR_LP fica na posição 7 (após |0010||N|5|T|01|)
      res.regimeAno = campos[7]; // ex.: "PPPP"
    } else if (reg === "P030") {
      // |P030|dtIni|dtFim|T0N|
      const dtIni = parseDataDDMMYYYY(campos[2] ?? "");
      const dtFim = parseDataDDMMYYYY(campos[3] ?? "");
      const tnn = campos[4] ?? ""; // "T01" etc.
      const nTri = Number(tnn.replace(/^T/, "")) as 1 | 2 | 3 | 4;
      if (dtIni && dtFim && nTri >= 1 && nTri <= 4) {
        const regime = regimeDoCodigo((res.regimeAno ?? "PPPP")[nTri - 1] ?? "P");
        trimestreAtual = {
          trimestre: nTri,
          dataInicial: dtIni,
          dataFinal: dtFim,
          regime,
          irpjApurado: 0,
          csllApurado: 0,
        };
        trimestres.set(nTri, trimestreAtual);
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
    }
    // TODO fase 2: blocos M/N pra Lucro Real
  }

  res.apuracoes = [...trimestres.values()].sort((a, b) => a.trimestre - b.trimestre);
  return res;
}
