/**
 * Leitor do "LIVRO REGISTRO DE APURAÇÃO DO ICMS - RAICMS - MODELO P9" gerado
 * pelo Siagri (sistema da CONEXAO AGRICOLA). Trabalha sobre o texto que o
 * pdf-parse extrai do PDF — layout conferido no RAICMS 03/2026 da Filial 01
 * (Porto Nacional) e no 01/2026 da matriz (GO).
 *
 * O PDF tem três blocos:
 *   ENTRADAS / SAÍDAS — uma linha por CFOP:
 *     "<valor contábil> <base> <imposto> <isentas> <outras>\t<CFOP 9.999>"
 *     e uma linha "... T O T A I S ..." com o total do bloco.
 *   APURAÇÃO — itens numerados 001..016 do P9.
 *
 * Importa FIEL: os totais de entradas/saídas são a soma das linhas de CFOP, e
 * a linha TOTAIS impressa serve só de conferência (divergência vira alerta).
 * Itens da apuração cujo valor o pdf-parse desloca de linha (002, 003, 006,
 * 007, 012, 013) são tirados dos totais que o próprio livro imprime:
 *   outros débitos + estornos de crédito = 004 − 001
 *   outros créditos + estornos de débito = 008 − 005
 *   deduções = 011 − 016 (quando 011 > 0)
 */

export interface LinhaCfopRaicms {
  natureza: "E" | "S";
  cfop: string; // 4 dígitos, sem ponto
  valorContabil: number;
  baseCalculo: number;
  imposto: number;
  isentas: number;
  outras: number;
}

export interface TotaisBloco {
  valorContabil: number;
  baseCalculo: number;
  imposto: number;
  isentas: number;
  outras: number;
}

export interface RaicmsSiagri {
  inscricaoEstadual: string | null; // só dígitos
  cnpj: string | null; // só dígitos
  dataInicial: Date | null;
  dataFinal: Date | null;
  razaoSocial: string | null;
  linhas: LinhaCfopRaicms[];
  entradas: TotaisBloco;
  saidas: TotaisBloco;
  apuracao: {
    debitoSaidas: number; // 001
    outrosDebitos: number; // 002 + 003 (004 − 001)
    totalDebitos: number; // 004
    creditoEntradas: number; // 005
    outrosCreditos: number; // 006 + 007 (008 − 005)
    saldoCredorAnterior: number; // 009
    totalCreditos: number; // 010
    saldoDevedor: number; // 011
    deducoes: number; // 012 (011 − 016)
    saldoCredorTransportar: number; // 014
    icmsARecolher: number; // 016
  };
  alertas: string[];
}

export class RaicmsFormatError extends Error {}

export function valorBr(s: string): number {
  const n = Number(s.replace(/\./g, "").replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}

const NUM = String.raw`-?[\d.]+,\d{2}`;
const RE_LINHA_CFOP = new RegExp(String.raw`^(${NUM})\s+(${NUM})\s+(${NUM})\s+(${NUM})\s+(${NUM})\s+(\d\.\d{3})\s*$`);
const RE_TOTAIS = /T O T A I S/;
const RE_IE_CNPJ = /^(\d{6,14})\s+(\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2})\s*$/;
const RE_PERIODO = /^(\d{2})\/(\d{2})\/(\d{4})\s+a\s+(\d{2})\/(\d{2})\/(\d{4})\s*$/;

function data(d: string, m: string, a: string): Date {
  return new Date(Date.UTC(Number(a), Number(m) - 1, Number(d)));
}

/** Valor do item "NNN - descrição <valor>" (valor no fim da mesma linha). */
function item(linhas: string[], codigo: string): number | null {
  const re = new RegExp(String.raw`^${codigo}\s+-\s+.*?\s(${NUM})\s*$`);
  for (const l of linhas) {
    const m = re.exec(l);
    if (m) return valorBr(m[1]);
  }
  return null;
}

const r2 = (n: number) => Math.round(n * 100) / 100;

export function parseRaicmsSiagri(texto: string): RaicmsSiagri {
  if (!/RAICMS/.test(texto)) {
    throw new RaicmsFormatError("Não é o Livro de Apuração do ICMS (RAICMS) do Siagri.");
  }
  const linhas = texto.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const alertas: string[] = [];

  let ie: string | null = null;
  let cnpj: string | null = null;
  let dataInicial: Date | null = null;
  let dataFinal: Date | null = null;
  let razaoSocial: string | null = null;

  const res: LinhaCfopRaicms[] = [];
  const totaisImpressos: Partial<Record<"E" | "S", number[]>> = {};
  let bloco: "E" | "S" | null = null;

  for (let i = 0; i < linhas.length; i++) {
    const l = linhas[i];
    if (!ie) {
      const m = RE_IE_CNPJ.exec(l);
      if (m) {
        ie = m[1];
        cnpj = m[2].replace(/\D/g, "");
        continue;
      }
    }
    if (!dataInicial) {
      const m = RE_PERIODO.exec(l);
      if (m) {
        dataInicial = data(m[1], m[2], m[3]);
        dataFinal = data(m[4], m[5], m[6]);
        continue;
      }
    }
    if (!razaoSocial && l === "Livro:" && linhas[i + 1] && !/^\d/.test(linhas[i + 1])) {
      razaoSocial = linhas[i + 1];
    }
    if (l === "ENTRADAS") bloco = "E";
    else if (l === "SAÍDAS" || l === "SAIDAS") bloco = "S";
    else if (/^DÉBITO DO IMPOSTO|^DEBITO DO IMPOSTO/.test(l)) bloco = null;

    if (!bloco) continue;
    const m = RE_LINHA_CFOP.exec(l);
    if (m) {
      res.push({
        natureza: bloco,
        cfop: m[6].replace(".", ""),
        valorContabil: valorBr(m[1]),
        baseCalculo: valorBr(m[2]),
        imposto: valorBr(m[3]),
        isentas: valorBr(m[4]),
        outras: valorBr(m[5]),
      });
      continue;
    }
    if (RE_TOTAIS.test(l)) {
      totaisImpressos[bloco] = [...l.matchAll(new RegExp(NUM, "g"))].map((x) => valorBr(x[0]));
    }
  }

  if (res.length === 0) throw new RaicmsFormatError("Nenhuma linha de CFOP encontrada no RAICMS.");

  const somar = (nat: "E" | "S"): TotaisBloco => {
    const t = { valorContabil: 0, baseCalculo: 0, imposto: 0, isentas: 0, outras: 0 };
    for (const x of res.filter((y) => y.natureza === nat)) {
      t.valorContabil += x.valorContabil;
      t.baseCalculo += x.baseCalculo;
      t.imposto += x.imposto;
      t.isentas += x.isentas;
      t.outras += x.outras;
    }
    return {
      valorContabil: r2(t.valorContabil),
      baseCalculo: r2(t.baseCalculo),
      imposto: r2(t.imposto),
      isentas: r2(t.isentas),
      outras: r2(t.outras),
    };
  };
  const entradas = somar("E");
  const saidas = somar("S");

  // Conferência com a linha TOTAIS impressa (a ordem das colunas nela varia;
  // confere pelo conjunto de valores).
  for (const [nat, soma] of [["E", entradas], ["S", saidas]] as const) {
    const impressos = totaisImpressos[nat];
    if (!impressos) {
      alertas.push(`Linha de TOTAIS das ${nat === "E" ? "entradas" : "saídas"} não encontrada.`);
      continue;
    }
    for (const [rotulo, v] of Object.entries(soma)) {
      if (!impressos.some((x) => Math.abs(x - v) <= 0.01)) {
        alertas.push(`${nat === "E" ? "Entradas" : "Saídas"}: soma dos CFOP (${rotulo} ${v.toFixed(2)}) não aparece na linha TOTAIS impressa.`);
      }
    }
  }

  // Apuração (itens do P9).
  const i001 = item(linhas, "001");
  const i004 = item(linhas, "004");
  const i005 = item(linhas, "005");
  const i008 = item(linhas, "008");
  const i009 = item(linhas, "009");
  const i010 = item(linhas, "010");
  const i011 = item(linhas, "011");
  const i016 = item(linhas, "016");
  // 014 vem com o valor ANTES do rótulo: "1.263.726,72\t014 - Saldo credor ..."
  const m014 = new RegExp(String.raw`^(${NUM})\s+014\s+-`).exec(linhas.find((l) => /\b014\s+-/.test(l)) ?? "");
  const i014 = m014 ? valorBr(m014[1]) : item(linhas, "014");

  for (const [cod, v] of [["001", i001], ["004", i004], ["005", i005], ["008", i008], ["009", i009], ["010", i010], ["011", i011], ["014", i014], ["016", i016]] as const) {
    if (v === null) alertas.push(`Item ${cod} da apuração não encontrado.`);
  }

  const n = (v: number | null) => v ?? 0;
  const apuracao = {
    debitoSaidas: n(i001),
    outrosDebitos: r2(n(i004) - n(i001)),
    totalDebitos: n(i004),
    creditoEntradas: n(i005),
    outrosCreditos: r2(n(i008) - n(i005)),
    saldoCredorAnterior: n(i009),
    totalCreditos: n(i010),
    saldoDevedor: n(i011),
    deducoes: n(i011) > 0 ? r2(n(i011) - n(i016)) : 0,
    saldoCredorTransportar: n(i014),
    icmsARecolher: n(i016),
  };

  // Coerência interna do livro.
  if (Math.abs(apuracao.debitoSaidas - saidas.imposto) > 0.01) {
    alertas.push(`Item 001 (${apuracao.debitoSaidas.toFixed(2)}) difere do imposto debitado nas saídas (${saidas.imposto.toFixed(2)}).`);
  }
  if (Math.abs(apuracao.creditoEntradas - entradas.imposto) > 0.01) {
    alertas.push(`Item 005 (${apuracao.creditoEntradas.toFixed(2)}) difere do imposto creditado nas entradas (${entradas.imposto.toFixed(2)}).`);
  }

  return {
    inscricaoEstadual: ie,
    cnpj,
    dataInicial,
    dataFinal,
    razaoSocial,
    linhas: res,
    entradas,
    saidas,
    apuracao,
    alertas,
  };
}
