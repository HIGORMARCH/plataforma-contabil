/**
 * Parser do RAZÃO do Domínio (PDF), por coordenadas.
 *
 * O `pdf-parse` embaralha este relatório: o histórico é impresso várias vezes em
 * X diferentes e os valores acabam no meio do texto. Mesma situação do Espelho
 * da GIAM — a saída é ler com `pdfjs-dist` e mapear cada item pela POSIÇÃO X.
 *
 * Layout validado em 29/08/2026 com `RazaoINSS.pdf` da LUPO QUIOSQUE
 * (conta 2.1.50.200.1 INSS A RECOLHER, 08/2019 a 07/2026, 6 páginas).
 *
 * Colunas (X do início do texto; os valores são alinhados à direita):
 *   Data            x <  45
 *   Número          x ∈ [45, 70)
 *   Histórico       x ∈ [70, 340)
 *   Cta.C.Part.     x ∈ [340, 370)
 *   Débito          x ∈ [370, 428)
 *   Crédito         x ∈ [428, 495)
 *   Saldo-Exercício x ≥ 495        (traz sufixo C ou D)
 *
 * Duas armadilhas do relatório, ambas tratadas aqui:
 *
 *   1. O MESMO histórico aparece repetido em vários X na mesma linha — é preciso
 *      deduplicar, senão o texto sai quintuplicado.
 *   2. Trechos de histórico caem dentro da faixa X das colunas de valor
 *      (ex.: "DESCONTO INSS EMPREGADO" em x=447, na faixa do crédito). Por isso
 *      só entra na coluna o que TEM CARA DE VALOR, nunca o item pela posição.
 *
 * Como sempre: lê fiel e aponta. Nada de deduzir lançamento que o PDF não traz.
 */

import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";

export interface LancamentoRazao {
  data: Date;
  /** Número do lançamento no Domínio. */
  numero: string | null;
  historico: string;
  /** Conta de contrapartida, quando o relatório imprime. */
  contraPartida: string | null;
  debito: number;
  credito: number;
  /** Saldo do exercício após o lançamento; negativo quando devedor (D). */
  saldo: number | null;
  /** "C" (credor) ou "D" (devedor), como o PDF imprime. */
  naturezaSaldo: "C" | "D" | null;
  /**
   * Competência citada no histórico ("PAGAMENTO INSS Mensal 08/2019" →
   * 2019-08-01). É o que liga o lançamento ao comprovante de pagamento.
   */
  competencia: Date | null;
}

export interface RazaoLido {
  empresa: string | null;
  cnpj: string | null;
  conta: string | null;
  contaCodigo: string | null;
  periodoInicio: Date | null;
  periodoFim: Date | null;
  saldoAnterior: number;
  lancamentos: LancamentoRazao[];
  alertas: string[];
}

export type ResultadoRazao = { ok: true; razao: RazaoLido } | { ok: false; motivo: string };

const FAIXAS = {
  data: [-1, 45],
  numero: [45, 70],
  historico: [70, 340],
  contraPartida: [340, 370],
  debito: [370, 428],
  credito: [428, 495],
  saldo: [495, 999],
} as const;

const RX_VALOR = /^\d{1,3}(?:\.\d{3})*,\d{2}([CD])?$/;
const RX_DATA = /^(\d{2})\/(\d{2})\/(\d{4})$/;
const RX_COMPETENCIA = /\b(\d{2})\/(\d{4})\b/;

interface ItemPdf {
  x: number;
  str: string;
}
interface LinhaPdf {
  y: number;
  itens: ItemPdf[];
}

function valorBr(s: string): number {
  return Number(s.replace(/[CD]$/, "").replace(/\./g, "").replace(",", "."));
}

function naFaixa(x: number, faixa: readonly [number, number]): boolean {
  return x >= faixa[0] && x < faixa[1];
}

/** Primeiro item que pareça valor monetário dentro da faixa X. */
function valorDaFaixa(itens: ItemPdf[], faixa: readonly [number, number]): string | null {
  for (const it of itens) {
    const s = it.str.trim();
    if (naFaixa(it.x, faixa) && RX_VALOR.test(s)) return s;
  }
  return null;
}

async function extrairLinhas(pdf: Buffer): Promise<LinhaPdf[][]> {
  const doc = await getDocument({
    data: new Uint8Array(pdf.buffer, pdf.byteOffset, pdf.byteLength),
    useSystemFonts: true,
  }).promise;

  const paginas: LinhaPdf[][] = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const content = await page.getTextContent();
    const items = content.items as Array<{ str: string; transform: number[] }>;

    const grupos = new Map<number, ItemPdf[]>();
    for (const it of items) {
      if (!it.str.trim()) continue;
      const y = Math.round(it.transform[5]);
      let chave = y;
      for (const k of grupos.keys()) {
        if (Math.abs(k - y) <= 2) {
          chave = k;
          break;
        }
      }
      if (!grupos.has(chave)) grupos.set(chave, []);
      grupos.get(chave)!.push({ x: it.transform[4], str: it.str });
    }

    const linhas = [...grupos.entries()]
      .map(([y, itens]) => ({ y, itens: itens.sort((a, b) => a.x - b.x) }))
      .sort((a, b) => b.y - a.y);
    paginas.push(linhas);
  }
  await doc.cleanup();
  return paginas;
}

/**
 * Junta os pedaços de histórico de uma linha, sem repetir. O relatório imprime
 * o mesmo texto em vários X — deduplicar é o que separa "REFERENTE DESCONTO
 * INSS EMPREGADO" de cinco cópias dele.
 */
export function historicoDaLinha(itens: ItemPdf[]): string {
  const partes: string[] = [];
  for (const it of itens) {
    const s = it.str.trim();
    if (!s) continue;
    if (!naFaixa(it.x, FAIXAS.historico)) continue;
    if (RX_VALOR.test(s)) continue; // valor que caiu na faixa do histórico
    if (partes.some((p) => p === s)) continue;
    partes.push(s);
  }
  // Um pedaço contido em outro já dito não acrescenta nada.
  const limpo = partes.filter(
    (p, i) => !partes.some((q, j) => j !== i && q.includes(p) && q.length > p.length),
  );
  return limpo.join(" ").replace(/\s+/g, " ").trim();
}

export async function lerRazaoPdf(pdf: Buffer): Promise<ResultadoRazao> {
  let paginas: LinhaPdf[][];
  try {
    paginas = await extrairLinhas(pdf);
  } catch (e) {
    return { ok: false, motivo: `Falha ao abrir o PDF: ${e instanceof Error ? e.message : String(e)}` };
  }

  const razao: RazaoLido = {
    empresa: null,
    cnpj: null,
    conta: null,
    contaCodigo: null,
    periodoInicio: null,
    periodoFim: null,
    saldoAnterior: 0,
    lancamentos: [],
    alertas: [],
  };

  let ehRazao = false;

  for (const linhas of paginas) {
    for (let i = 0; i < linhas.length; i++) {
      const linha = linhas[i];
      const texto = linha.itens.map((it) => it.str).join(" ").replace(/\s+/g, " ").trim();

      if (/^RAZ[ÃA]O$/i.test(texto.trim())) ehRazao = true;

      // --- Cabeçalho ---
      if (!razao.empresa && /^Empresa:/i.test(texto)) {
        razao.empresa = texto.replace(/^Empresa:\s*/i, "").replace(/\s*Folha:.*$/i, "").trim();
        continue;
      }
      if (!razao.cnpj && /C\.N\.P\.J\.:/i.test(texto)) {
        razao.cnpj = /(\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2})/.exec(texto)?.[1]?.replace(/\D/g, "") ?? null;
        continue;
      }
      if (!razao.periodoInicio && /^Per[ií]odo:/i.test(texto)) {
        const datas = texto.match(/\d{2}\/\d{2}\/\d{4}/g) ?? [];
        if (datas[0]) {
          const [, d, m, a] = RX_DATA.exec(datas[0])!;
          razao.periodoInicio = new Date(Date.UTC(+a, +m - 1, +d));
        }
        if (datas[1]) {
          const [, d, m, a] = RX_DATA.exec(datas[1])!;
          razao.periodoFim = new Date(Date.UTC(+a, +m - 1, +d));
        }
        continue;
      }
      if (!razao.conta && /^Conta:/i.test(texto)) {
        // "Conta: 191 - 2.1.50.200.1 INSS A RECOLHER"
        razao.contaCodigo = /(\d+(?:\.\d+)+)/.exec(texto)?.[1] ?? null;
        razao.conta = texto
          .replace(/^Conta:\s*/i, "")
          .replace(/^\d+\s*-\s*/, "")
          .replace(/\d+(?:\.\d+)+/, "")
          .trim();
        continue;
      }
      if (/SALDO ANTERIOR/i.test(texto)) {
        const s = valorDaFaixa(linha.itens, FAIXAS.saldo);
        if (s) razao.saldoAnterior = valorBr(s) * (s.endsWith("D") ? -1 : 1);
        continue;
      }

      // --- Linha de lançamento: começa com data na primeira coluna ---
      const itemData = linha.itens.find(
        (it) => naFaixa(it.x, FAIXAS.data) && RX_DATA.test(it.str.trim()),
      );
      if (!itemData) continue;

      const [, dd, mm, aaaa] = RX_DATA.exec(itemData.str.trim())!;
      const numeroItem = linha.itens.find(
        (it) => naFaixa(it.x, FAIXAS.numero) && /^\d{3,}$/.test(it.str.trim()),
      );
      const contraItem = linha.itens.find(
        (it) => naFaixa(it.x, FAIXAS.contraPartida) && /^\d+$/.test(it.str.trim()),
      );

      // Histórico pode continuar nas linhas seguintes, que não têm data.
      let historico = historicoDaLinha(linha.itens);
      for (let j = i + 1; j < linhas.length; j++) {
        const prox = linhas[j];
        const temData = prox.itens.some(
          (it) => naFaixa(it.x, FAIXAS.data) && RX_DATA.test(it.str.trim()),
        );
        if (temData) break;
        const continuacao = historicoDaLinha(prox.itens);
        if (!continuacao) break;
        historico = `${historico} ${continuacao}`.trim();
        i = j; // consome a linha de continuação
      }

      const debitoStr = valorDaFaixa(linha.itens, FAIXAS.debito);
      const creditoStr = valorDaFaixa(linha.itens, FAIXAS.credito);
      const saldoStr = valorDaFaixa(linha.itens, FAIXAS.saldo);

      const competenciaMatch = RX_COMPETENCIA.exec(historico);
      const competencia = competenciaMatch
        ? new Date(Date.UTC(Number(competenciaMatch[2]), Number(competenciaMatch[1]) - 1, 1))
        : null;

      razao.lancamentos.push({
        data: new Date(Date.UTC(Number(aaaa), Number(mm) - 1, Number(dd))),
        numero: numeroItem?.str.trim() ?? null,
        historico,
        contraPartida: contraItem?.str.trim() ?? null,
        debito: debitoStr ? valorBr(debitoStr) : 0,
        credito: creditoStr ? valorBr(creditoStr) : 0,
        saldo: saldoStr ? valorBr(saldoStr) : null,
        naturezaSaldo: saldoStr ? (saldoStr.endsWith("D") ? "D" : "C") : null,
        competencia,
      });
    }
  }

  if (!ehRazao && razao.lancamentos.length === 0) {
    return { ok: false, motivo: "O PDF não parece ser um razão do Domínio (nem cabeçalho, nem lançamentos)." };
  }
  if (razao.lancamentos.length === 0) {
    razao.alertas.push("Nenhum lançamento reconhecido — confira se o PDF tem movimento no período.");
  }
  if (!razao.contaCodigo) {
    razao.alertas.push("Código da conta contábil não localizado no cabeçalho.");
  }

  return { ok: true, razao };
}

/**
 * Resumo mensal do razão — é o formato que a conciliação usa: por competência,
 * quanto foi provisionado (crédito) e quanto foi baixado (débito).
 *
 * A competência de um PAGAMENTO é a citada no histórico ("PAGAMENTO INSS Mensal
 * 08/2019"), não a data do lançamento: o pagamento de agosto sai em setembro, e
 * é com a competência que ele bate no comprovante.
 */
export function resumirPorCompetencia(razao: RazaoLido): Array<{
  competencia: Date;
  debito: number;
  credito: number;
  lancamentos: number;
}> {
  const mapa = new Map<number, { competencia: Date; debito: number; credito: number; lancamentos: number }>();
  for (const l of razao.lancamentos) {
    const ref =
      l.competencia ?? new Date(Date.UTC(l.data.getUTCFullYear(), l.data.getUTCMonth(), 1));
    const k = ref.getTime();
    const atual = mapa.get(k) ?? { competencia: ref, debito: 0, credito: 0, lancamentos: 0 };
    atual.debito += l.debito;
    atual.credito += l.credito;
    atual.lancamentos++;
    mapa.set(k, atual);
  }
  return [...mapa.values()].sort((a, b) => a.competencia.getTime() - b.competencia.getTime());
}
