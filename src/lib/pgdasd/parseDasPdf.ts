/**
 * Parser do DAS — Documento de Arrecadação do Simples Nacional.
 *
 * É a GUIA, não a declaração: sai do PGDAS depois de apurar e é o papel que vai
 * pro banco. Os PDFs vivem na pasta do cliente
 * (`FISCAL\IMPOSTOS\SIMPLES NACIONAL\<ANO>\PGDASD-DAS-MM.AAAA.pdf`).
 *
 * Layout validado em 29/08/2026 com arquivos reais da LUPO QUIOSQUE (05/2025 a
 * 03/2026). O PDF é texto puro; o `pdf-parse` devolve os blocos do formulário
 * fora da ordem visual, então nada aqui depende de posição — só de âncoras.
 *
 * Bloco "Composição do Documento de Arrecadação", uma linha por código:
 *   1001 IRPJ - SIMPLES NACIONAL 416,63 416,63
 *   12/2025
 * O primeiro valor é o PRINCIPAL e o último é o TOTAL da linha; quando há multa
 * e juros aparecem no meio. A competência vem logo abaixo (e no ICMS vem com a
 * UF: "TO - 12/2025").
 *
 * Mesma regra da casa do resto da plataforma: lê fiel, aponta incoerência, não
 * conserta. E não guarda o arquivo — só os valores.
 */

export interface LinhaDas {
  codigo: string; // "1001"
  denominacao: string; // "IRPJ - SIMPLES NACIONAL"
  principal: number;
  total: number;
}

export interface DasSimples {
  cnpj: string | null;
  /** Competência apurada (ano/mês) — "Dezembro/2025" ou "12/2025" na guia. */
  ano: number;
  mes: number;
  numeroDocumento: string | null;
  dataVencimento: Date | null;
  valorTotal: number;
  principal: number;
  multa: number;
  juros: number;
  composicao: LinhaDas[];
  alertas: string[];
}

export type ResultadoParseDas =
  | { ok: true; das: DasSimples }
  | { ok: false; motivo: string };

const MESES: Record<string, number> = {
  janeiro: 1,
  fevereiro: 2,
  marco: 3,
  abril: 4,
  maio: 5,
  junho: 6,
  julho: 7,
  agosto: 8,
  setembro: 9,
  outubro: 10,
  novembro: 11,
  dezembro: 12,
};

const RE_VALOR_G = /-?\d{1,3}(?:\.\d{3})*,\d{2}/g;

function valorBr(txt: string): number {
  return Number(txt.replace(/\./g, "").replace(",", "."));
}

function semAcento(t: string): string {
  return t.normalize("NFD").replace(/[̀-ͯ]/g, "");
}

function dataBr(dd: string, mm: string, aaaa: string): Date {
  return new Date(Date.UTC(Number(aaaa), Number(mm) - 1, Number(dd)));
}

export function parseDasSimples(textoOriginal: string): ResultadoParseDas {
  const texto = semAcento(textoOriginal.replace(/\r\n?/g, "\n").replace(/[ \t]+/g, " "));

  if (!/Documento de Arrecadacao\s*\n?\s*do Simples Nacional|Documento de Arrecadacao do Simples Nacional/i.test(texto)) {
    return { ok: false, motivo: "O PDF não é um DAS do Simples Nacional." };
  }

  const alertas: string[] = [];

  const cnpj = /(\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2})/.exec(texto)?.[1]?.replace(/\D/g, "") ?? null;

  // Número do documento: "07.20.26019.4202197-9" (também repetido em "Número:").
  const numeroDocumento =
    /Numero:\s*([\d.]+-\d)/i.exec(texto)?.[1] ?? /(\d{2}\.\d{2}\.\d{5}\.\d{7}-\d)/.exec(texto)?.[1] ?? null;

  // Competência: "Dezembro/2025" no corpo; fallback nas linhas "12/2025".
  let ano = 0;
  let mes = 0;
  const mExtenso = new RegExp(`(${Object.keys(MESES).join("|")})\\/(\\d{4})`, "i").exec(texto);
  if (mExtenso) {
    mes = MESES[mExtenso[1].toLowerCase()];
    ano = Number(mExtenso[2]);
  } else {
    const mCurto = /\b(\d{2})\/(\d{4})\b/.exec(texto);
    if (mCurto) {
      mes = Number(mCurto[1]);
      ano = Number(mCurto[2]);
    }
  }
  if (!ano || !mes) {
    return { ok: false, motivo: "Não foi possível ler o período de apuração no DAS." };
  }

  // Vencimento: "Pagar este documento até 20/01/2026" ou "Pagar até: 20/01/2026".
  let dataVencimento: Date | null = null;
  const mVenc =
    /Pagar (?:este documento )?at[eé]:?\s*(\d{2})\/(\d{2})\/(\d{4})/i.exec(texto) ??
    /Data de Vencimento[\s\S]{0,120}?(\d{2})\/(\d{2})\/(\d{4})/i.exec(texto);
  if (mVenc) dataVencimento = dataBr(mVenc[1], mVenc[2], mVenc[3]);
  else alertas.push("Data de vencimento não localizada na guia.");

  // Valor total do documento.
  let valorTotal = 0;
  const mTotal =
    /Valor Total do Documento\s*\n?\s*([\d.,]+)/i.exec(texto) ?? /Valor:\s*([\d.,]+)/i.exec(texto);
  if (mTotal) valorTotal = valorBr(mTotal[1]);
  else alertas.push("Valor total do documento não localizado.");

  // Composição — uma linha por código de receita.
  const composicao: LinhaDas[] = [];
  for (const linha of texto.split("\n")) {
    const m = /^\s*(\d{4})\s+([A-Za-z0-9/.\- ]+?)\s+((?:[\d.]+,\d{2}\s*)+)$/.exec(linha);
    if (!m) continue;
    const valores = (m[3].match(RE_VALOR_G) ?? []).map(valorBr);
    if (valores.length === 0) continue;
    composicao.push({
      codigo: m[1],
      denominacao: m[2].trim(),
      principal: valores[0],
      total: valores[valores.length - 1],
    });
  }
  if (composicao.length === 0) {
    alertas.push("Composição por código de receita não localizada — só o total do documento foi lido.");
  }

  const principal = composicao.reduce((s, l) => s + l.principal, 0);
  const totalLinhas = composicao.reduce((s, l) => s + l.total, 0);

  // Multa e juros: a guia traz colunas próprias, mas nem todo layout as imprime
  // quando são zero. O acréscimo é a diferença entre o total da linha e o
  // principal — deduzido, e por isso reportado junto e não separado em dois.
  const acrescimo = Math.max(0, totalLinhas - principal);
  const mMulta = /Multa\s*\n?\s*([\d.]+,\d{2})/i.exec(texto);
  const mJuros = /Juros\s*\n?\s*([\d.]+,\d{2})/i.exec(texto);
  const multa = mMulta ? valorBr(mMulta[1]) : acrescimo > 0 && !mJuros ? acrescimo : 0;
  const juros = mJuros ? valorBr(mJuros[1]) : 0;

  if (composicao.length > 0 && valorTotal > 0 && Math.abs(totalLinhas - valorTotal) > 0.01) {
    alertas.push(
      `Soma da composição (${totalLinhas.toFixed(2)}) diferente do valor total do documento (${valorTotal.toFixed(2)}).`,
    );
  }

  return {
    ok: true,
    das: {
      cnpj,
      ano,
      mes,
      numeroDocumento,
      dataVencimento,
      valorTotal: valorTotal || totalLinhas,
      principal,
      multa,
      juros,
      composicao,
      alertas,
    },
  };
}

/** Lê o DAS direto do PDF (Buffer). O arquivo não é copiado nem alterado. */
export async function lerDasPdf(pdf: Buffer): Promise<ResultadoParseDas> {
  const { PDFParse } = await import("pdf-parse");
  try {
    const { text } = await new PDFParse({ data: pdf }).getText();
    return parseDasSimples(text);
  } catch (e) {
    return {
      ok: false,
      motivo: `Falha ao extrair texto do PDF: ${e instanceof Error ? e.message : String(e)}`,
    };
  }
}
