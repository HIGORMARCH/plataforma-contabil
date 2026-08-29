/**
 * Parser do COMPROVANTE DE ARRECADAÇÃO da Receita Federal.
 *
 * É o documento que prova o PAGAMENTO (não a guia, não a declaração): "Comprovamos
 * que consta nos sistemas da Receita Federal registro de arrecadação de DAS/DARF
 * com os dados a seguir". Traz o que a guia não tem — data de arrecadação, banco
 * e agência.
 *
 * Um PDF costuma reunir o ANO INTEIRO: uma página por documento pago (o de 2025
 * da LUPO tem 26). Por isso o parser devolve uma LISTA, não um registro.
 *
 * Layout validado em 29/08/2026 com os arquivos reais da LUPO QUIOSQUE
 * (`FISCAL\IMPOSTOS\SIMPLES NACIONAL\<ANO>\PAGAMENTO <ANO>.pdf`).
 *
 * ATENÇÃO À ORDEM DAS COLUNAS — ela NÃO é a mesma da guia DAS:
 *   Código Descrição   Total | Juros | Multa | Principal
 * e valores zerados são impressos como "-", não como "0,00":
 *   1001 IRPJ - SIMPLES NACIONAL 324,34 - - 324,34
 *
 * Documento de competência mensal (DAS) traz "Competência 11/2025"; DARF de folha
 * traz "Período Apuração 30/11/2025". Os dois viram o primeiro dia do mês.
 *
 * Como em todo o resto: lê fiel, aponta incoerência, não conserta, e não guarda
 * o arquivo — só os valores.
 */

export interface LinhaArrecadacao {
  codigo: string; // "1001", "1082", "0561"
  denominacao: string;
  total: number;
  juros: number;
  multa: number;
  principal: number;
}

export interface Arrecadacao {
  /** "DAS" | "DARF" — o próprio comprovante diz qual. */
  tipo: string;
  cnpj: string | null;
  ano: number;
  mes: number;
  numeroDocumento: string;
  dataVencimento: Date | null;
  dataArrecadacao: Date | null;
  banco: string | null;
  agencia: string | null;
  valorTotal: number;
  principal: number;
  multa: number;
  juros: number;
  composicao: LinhaArrecadacao[];
  alertas: string[];
}

export interface ResultadoComprovantes {
  arrecadacoes: Arrecadacao[];
  /** Páginas que não deu pra ler — com o motivo. Nunca somem em silêncio. */
  paginasIgnoradas: Array<{ pagina: number; motivo: string }>;
}

function semAcento(t: string): string {
  return t.normalize("NFD").replace(/[̀-ͯ]/g, "");
}

function valorBr(txt: string): number {
  return Number(txt.replace(/\./g, "").replace(",", "."));
}

/** "-" (zero impresso como travessão) ou "1.234,56". */
function valorOuTraco(txt: string): number {
  const t = txt.trim();
  if (t === "-" || t === "--" || t === "") return 0;
  return valorBr(t);
}

function dataUtc(dd: string, mm: string, aaaa: string): Date {
  return new Date(Date.UTC(Number(aaaa), Number(mm) - 1, Number(dd)));
}

/**
 * O `pdf-parse` separa as páginas com "-- N of M --". Cada página do comprovante
 * é um documento pago independente.
 */
export function separarPaginas(texto: string): string[] {
  const partes = texto.split(/^--\s*\d+\s+of\s+\d+\s*--$/m);
  return partes.map((p) => p.trim()).filter((p) => p.length > 0);
}

/** Lê UMA página do comprovante. */
export function parsePaginaArrecadacao(paginaOriginal: string): Arrecadacao | { erro: string } {
  const pagina = semAcento(paginaOriginal.replace(/\r\n?/g, "\n").replace(/[ \t]+/g, " "));

  const mTipo = /registro de arrecadacao de ([A-Z]+)/i.exec(pagina);
  if (!mTipo) return { erro: "página sem a frase 'registro de arrecadação de ...' — não é comprovante" };
  const tipo = mTipo[1].toUpperCase();

  const alertas: string[] = [];
  const cnpj = /(\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2})/.exec(pagina)?.[1]?.replace(/\D/g, "") ?? null;

  // A linha-chave junta competência, vencimento e número do documento:
  //   "11/2025 22/12/2025 07202534312242658"          (DAS, competência mensal)
  //   "30/11/2025 19/12/2025 07162533820630232"       (DARF, período de apuração)
  const mLinha =
    /(\d{2}\/\d{4}|\d{2}\/\d{2}\/\d{4})\s+(\d{2})\/(\d{2})\/(\d{4})\s+(\d{10,25})/.exec(pagina);
  if (!mLinha) {
    return { erro: "não foi possível ler competência / vencimento / número do documento" };
  }

  let ano = 0;
  let mes = 0;
  const comp = mLinha[1];
  if (/^\d{2}\/\d{4}$/.test(comp)) {
    mes = Number(comp.slice(0, 2));
    ano = Number(comp.slice(3));
  } else {
    // Período de apuração com dia (DARF): a competência é o mês da data.
    const [, mm, aaaa] = /^\d{2}\/(\d{2})\/(\d{4})$/.exec(comp)!;
    mes = Number(mm);
    ano = Number(aaaa);
  }

  const dataVencimento = dataUtc(mLinha[2], mLinha[3], mLinha[4]);
  const numeroDocumento = mLinha[5];

  // Data de arrecadação — aparece isolada no rodapé, seguida do banco.
  let dataArrecadacao: Date | null = null;
  let banco: string | null = null;
  let agencia: string | null = null;
  const mPagamento = /(\d{2})\/(\d{2})\/(\d{4})\s*\t?\s*(\d{3}\s*-\s*[^\n]+)/.exec(pagina);
  if (mPagamento) {
    dataArrecadacao = dataUtc(mPagamento[1], mPagamento[2], mPagamento[3]);
    banco = mPagamento[4].trim();
    const mAgencia = new RegExp(`${mPagamento[4].trim().replace(/[.*+?^${}()|[\\]\\\\]/g, "\\\\$&")}\\s*\\n\\s*(\\d{2,6})`).exec(pagina);
    if (mAgencia) agencia = mAgencia[1];
  } else {
    alertas.push("Data de arrecadação / banco não localizados no comprovante.");
  }

  // Composição — "codigo descricao TOTAL JUROS MULTA PRINCIPAL", com "-" no zero.
  const composicao: LinhaArrecadacao[] = [];
  for (const linha of pagina.split("\n")) {
    const m = /^\s*(\d{4})\s+(.+?)\s+((?:(?:[\d.]+,\d{2}|-)\s+){3}(?:[\d.]+,\d{2}|-))\s*$/.exec(linha);
    if (!m) continue;
    const campos = m[3].trim().split(/\s+/);
    if (campos.length !== 4) continue;
    composicao.push({
      codigo: m[1],
      denominacao: m[2].trim(),
      total: valorOuTraco(campos[0]),
      juros: valorOuTraco(campos[1]),
      multa: valorOuTraco(campos[2]),
      principal: valorOuTraco(campos[3]),
    });
  }

  // Linha "Totais 5.897,16 0,00 0,00 5.897,16" — mesma ordem das colunas.
  let valorTotal = 0;
  let juros = 0;
  let multa = 0;
  let principal = 0;
  const mTotais = /^\s*Totais\s+((?:(?:[\d.]+,\d{2}|-)\s+){3}(?:[\d.]+,\d{2}|-))\s*$/m.exec(pagina);
  if (mTotais) {
    const campos = mTotais[1].trim().split(/\s+/);
    valorTotal = valorOuTraco(campos[0]);
    juros = valorOuTraco(campos[1]);
    multa = valorOuTraco(campos[2]);
    principal = valorOuTraco(campos[3]);
  } else {
    valorTotal = composicao.reduce((s, l) => s + l.total, 0);
    juros = composicao.reduce((s, l) => s + l.juros, 0);
    multa = composicao.reduce((s, l) => s + l.multa, 0);
    principal = composicao.reduce((s, l) => s + l.principal, 0);
    alertas.push("Linha 'Totais' não localizada — totais somados a partir da composição.");
  }

  if (composicao.length === 0) {
    alertas.push("Composição por código de receita não localizada.");
  } else if (mTotais) {
    const somaTotal = composicao.reduce((s, l) => s + l.total, 0);
    if (Math.abs(somaTotal - valorTotal) > 0.01) {
      alertas.push(
        `Soma da composição (${somaTotal.toFixed(2)}) diferente da linha Totais (${valorTotal.toFixed(2)}).`,
      );
    }
  }

  return {
    tipo,
    cnpj,
    ano,
    mes,
    numeroDocumento,
    dataVencimento,
    dataArrecadacao,
    banco,
    agencia,
    valorTotal,
    principal,
    multa,
    juros,
    composicao,
    alertas,
  };
}

/** Lê o comprovante inteiro (todas as páginas) a partir do texto extraído. */
export function parseComprovanteArrecadacao(texto: string): ResultadoComprovantes {
  const arrecadacoes: Arrecadacao[] = [];
  const paginasIgnoradas: Array<{ pagina: number; motivo: string }> = [];

  separarPaginas(texto).forEach((pagina, i) => {
    const r = parsePaginaArrecadacao(pagina);
    if ("erro" in r) paginasIgnoradas.push({ pagina: i + 1, motivo: r.erro });
    else arrecadacoes.push(r);
  });

  return { arrecadacoes, paginasIgnoradas };
}

/** Lê o comprovante direto do PDF. O arquivo não é copiado nem alterado. */
export async function lerComprovantePdf(pdf: Buffer): Promise<ResultadoComprovantes> {
  const { PDFParse } = await import("pdf-parse");
  const { text } = await new PDFParse({ data: pdf }).getText();
  return parseComprovanteArrecadacao(text);
}
