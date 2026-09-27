/**
 * Parser do PDF do Espelho da GIAM SEFAZ-TO usando pdfjs-dist com coordenadas
 * X/Y explícitas. Extrai as linhas do Quadro 4 (Entradas 4.1 e Saídas 4.2)
 * mapeando cada valor pra sua coluna pela POSIÇÃO X no PDF — resolve o
 * embaralhamento que o pdf-parse causava quando a descrição do CFOP era longa.
 *
 * Layout do PDF validado com PALMAS HALL dez/2022 (scripts/inspecionar-pdf-espelho.ts).
 *
 * Colunas do Quadro 4 (mesmas faixas X pras Entradas 4.1 e Saídas 4.2):
 *   A - Valor Contábil        X ∈ [200, 285]
 *   B - Base de Cálculo       X ∈ [290, 344]
 *   C - Crédito/Débito ICMS   X ∈ [345, 394]
 *   D - Isentas/Não Tributadas X ∈ [395, 454]
 *   E - Outras                X ∈ [455, 524]
 *   F - Substituição Trib.    X ∈ [525, 600]
 *
 * Linha de dado: primeiro item é CFOP no formato "N.NNN" (X~40).
 * Marcador de fim do quadro 4: linha "5 - DÉBITO DO IMPOSTO".
 * Marcador do 4.2: linha "4.2 SAÍDAS E/OU PRESTAÇÕES".
 */

import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { getDocument, GlobalWorkerOptions } from "pdfjs-dist/legacy/build/pdf.mjs";

/**
 * Fixa o worker do pdfjs na MESMA versão da API que importamos aqui.
 *
 * O `pdf-parse` embute a própria cópia do pdfjs (5.4.296) e, ao ser usado antes
 * deste parser no mesmo processo, pendura o worker dele em
 * `globalThis.pdfjsWorker`. O pdfjs prefere esse worker global a carregar o
 * arquivo do `workerSrc`, então o nosso pdfjs 6.x rodava com o worker 5.x e
 * morria com "API version does not match Worker version" — e o scraper engolia
 * o erro, gravando a apuração SEM as linhas por CFOP.
 */
function fixarWorkerDoPdfjs() {
  // Solta o worker do pdf-parse: ele o registra de novo na próxima leitura.
  delete (globalThis as { pdfjsWorker?: unknown }).pdfjsWorker;
  // `workerPort` tem precedência sobre `workerSrc`: se já houver um aberto,
  // trocar só o `workerSrc` não adianta.
  (GlobalWorkerOptions as { workerPort: unknown }).workerPort = null;
  try {
    const require = createRequire(import.meta.url);
    GlobalWorkerOptions.workerSrc = pathToFileURL(
      require.resolve("pdfjs-dist/legacy/build/pdf.worker.mjs"),
    ).href;
  } catch {
    // Sem resolver o worker, o pdfjs cai no worker falso (mais lento, correto).
    GlobalWorkerOptions.workerSrc = "";
  }
}

interface ItemPdf {
  x: number;
  str: string;
}

interface LinhaPdf {
  y: number;
  itens: ItemPdf[];
  texto: string; // concat dos itens ordenados por X, pra facilitar match de marcadores
}

export interface LinhaSegmentoBExtraida {
  natureza: "0" | "1"; // 0=entrada, 1=saída
  cfop: string; // 4 dígitos (sem ponto)
  valorContabil: number;
  baseCalculo: number;
  creditoDebitoImposto: number;
  isentasNaoTributadas: number;
  outras: number;
  substituicaoTributaria: number;
}

// Faixas X de cada coluna de valor (right-aligned no PDF)
const FAIXAS = {
  valorContabil:         [200, 285] as const,
  baseCalculo:           [290, 344] as const,
  creditoDebitoImposto:  [345, 394] as const,
  isentasNaoTributadas:  [395, 454] as const,
  outras:                [455, 524] as const,
  substituicaoTributaria: [525, 620] as const,
};

const RX_CFOP = /^(\d)\.(\d{3})$/;

function toNumeroBR(s: string): number {
  if (!s) return 0;
  const norm = s.replace(/\./g, "").replace(",", ".");
  const n = Number(norm);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Extrai as páginas do PDF como listas de linhas (agrupando itens por Y).
 */
async function extrairLinhas(buffer: Buffer | ArrayBuffer): Promise<LinhaPdf[][]> {
  // CÓPIA, sempre: o pdfjs transfere o buffer para o worker e o deixa detached.
  // Sem copiar, a segunda leitura do mesmo PDF (apuração e depois CFOP a CFOP)
  // recebe um buffer vazio e falha com "detached ArrayBuffer".
  const bytes = buffer instanceof ArrayBuffer
    ? new Uint8Array(buffer)
    : new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  const src = new Uint8Array(bytes);
  fixarWorkerDoPdfjs();
  const loadingTask = getDocument({ data: src, useSystemFonts: true });
  const pdf = await loadingTask.promise;

  const paginas: LinhaPdf[][] = [];
  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p);
    const content = await page.getTextContent();
    const items = content.items as Array<{ str: string; transform: number[] }>;

    // Agrupa por Y (tolerância ±2)
    const grupos = new Map<number, ItemPdf[]>();
    for (const it of items) {
      if (!it.str.trim()) continue;
      const y = Math.round(it.transform[5]);
      const x = it.transform[4];
      let key = y;
      for (const k of grupos.keys()) if (Math.abs(k - y) <= 2) { key = k; break; }
      if (!grupos.has(key)) grupos.set(key, []);
      grupos.get(key)!.push({ x, str: it.str });
    }

    const linhas: LinhaPdf[] = [];
    for (const [y, itens] of grupos.entries()) {
      itens.sort((a, b) => a.x - b.x);
      linhas.push({
        y,
        itens,
        texto: itens.map((i) => i.str).join(" ").replace(/\s+/g, " ").trim(),
      });
    }
    linhas.sort((a, b) => b.y - a.y); // top-down (Y decrescente)
    paginas.push(linhas);
  }
  await pdf.cleanup();
  return paginas;
}

/**
 * Dado a lista de itens de uma linha (com X), extrai o valor de cada coluna
 * pela faixa X. Se mais de um item cair na mesma faixa, concatena (números
 * podem vir quebrados em várias fragmentos por causa do pdfjs).
 */
function extrairValoresDaLinha(itens: ItemPdf[]): {
  valorContabil: number;
  baseCalculo: number;
  creditoDebitoImposto: number;
  isentasNaoTributadas: number;
  outras: number;
  substituicaoTributaria: number;
} {
  const out = {
    valorContabil: 0,
    baseCalculo: 0,
    creditoDebitoImposto: 0,
    isentasNaoTributadas: 0,
    outras: 0,
    substituicaoTributaria: 0,
  };
  for (const it of itens) {
    for (const [col, [xMin, xMax]] of Object.entries(FAIXAS)) {
      if (it.x >= xMin && it.x <= xMax) {
        const v = toNumeroBR(it.str);
        if (v !== 0) (out as Record<string, number>)[col] += v;
        break;
      }
    }
  }
  return out;
}

/**
 * Percorre as linhas entre dois marcadores (Y máximo e Y mínimo) e extrai as
 * linhas de CFOP. Ignora subtítulos ("4.1.1 - INTERNA" etc) e a linha TOTAL.
 */
function extrairCFOPsEntre(
  linhas: LinhaPdf[],
  yMax: number,
  yMin: number,
  natureza: "0" | "1",
): LinhaSegmentoBExtraida[] {
  const out: LinhaSegmentoBExtraida[] = [];
  for (const l of linhas) {
    if (l.y > yMax || l.y < yMin) continue;
    if (l.itens.length === 0) continue;
    // Primeiro item precisa ser um CFOP N.NNN
    const primeiro = l.itens[0];
    const m = primeiro.str.trim().match(RX_CFOP);
    if (!m) continue;
    const cfop = m[1] + m[2]; // sem ponto: "1.202" → "1202"

    // Filtra os itens que estão em faixa de coluna de valor (X >= 200)
    // — evita colar descrição do CFOP nos valores.
    const itensValor = l.itens.filter((it) => it.x >= FAIXAS.valorContabil[0]);
    const valores = extrairValoresDaLinha(itensValor);

    out.push({ natureza, cfop, ...valores });
  }
  return out;
}

/**
 * Parser público. Recebe o buffer do PDF do Espelho da GIAM e retorna as
 * linhas do Quadro 4 (Entradas + Saídas). Só o Quadro 4 é extraído — os
 * totais consolidados (Item 5-8) continuam vindo do parser texto atual.
 */
export async function extrairLinhasEspelhoPdfjs(
  buffer: Buffer,
): Promise<LinhaSegmentoBExtraida[]> {
  const paginas = await extrairLinhas(buffer);
  const linhasP1 = paginas[0] ?? [];

  // Marcadores estruturais (Y) no PDF
  const yQuadro41 = linhasP1.find((l) => /4\.1\s+ENTRADAS/i.test(l.texto))?.y ?? -Infinity;
  const yQuadro42 = linhasP1.find((l) => /4\.2\s+SA[ÍI]DAS/i.test(l.texto))?.y ?? -Infinity;
  const yFimQuadro4 = linhasP1.find((l) => /^5\s*-\s*D[ÉE]BITO DO IMPOSTO/i.test(l.texto))?.y ?? -Infinity;

  if (yQuadro41 === -Infinity || yQuadro42 === -Infinity || yFimQuadro4 === -Infinity) {
    // PDF fora do layout esperado — retorna vazio pra não gravar lixo.
    return [];
  }

  const entradas = extrairCFOPsEntre(linhasP1, yQuadro41 - 1, yQuadro42 + 1, "0");
  const saidas = extrairCFOPsEntre(linhasP1, yQuadro42 - 1, yFimQuadro4 + 1, "1");

  return [...entradas, ...saidas];
}

/**
 * Apuração do ICMS lida do próprio espelho (itens 5 a 9), pelas coordenadas.
 *
 * Antes destes campos serem lidos, o scraper gravava zero no saldo credor e nas
 * deduções e CALCULAVA o imposto a recolher como débito − crédito. Com saldo
 * credor do período anterior, o valor calculado ficava maior que o declarado —
 * divergência inventada pela plataforma. Agora vem tudo do documento.
 *
 * Layout validado com CASA SAO PAULO ago/2021 (`scripts/inspecionar-pdf-espelho.ts`):
 *
 *   5.1 - POR SAÍDAS/PRESTAÇÕES COM DÉBITO DO IMPOSTO          100.760,99
 *   6.1 - POR ENTRADAS/AQUISIÇÕES COM CRÉDITO DO IMPOSTO        90.935,49
 *   6.4 - SALDO CREDOR DO PERÍODO ANTERIOR                       5.209,71
 *   7.2 - DEDUÇÕES                                                   0,00
 *   7.3 - IMPOSTO A RECOLHER                                     4.615,79
 *
 * Armadilha do 7.3: o valor é desenhado uma linha ACIMA do rótulo (mesma
 * coluna). Por isso `valorDoItem` procura na linha do rótulo e, se não achar,
 * na linha imediatamente acima — sempre na faixa X das colunas de valor.
 */
export interface ApuracaoEspelhoExtraida {
  debitoSaidas: number;
  creditoEntradas: number;
  saldoCredorAnterior: number;
  deducoes: number;
  icmsARecolherNormal: number;
}

/** X mínimo das colunas de valor da apuração (rótulos ficam em X ≈ 40). */
const X_VALOR_APURACAO = 450;
const RX_NUMERO_BR = /^-?[\d.]+,\d{2}$/;

function valorDoItem(paginas: LinhaPdf[][], rx: RegExp): number | null {
  for (const linhas of paginas) {
    for (let i = 0; i < linhas.length; i++) {
      if (!rx.test(linhas[i].texto)) continue;
      // Na própria linha; senão na de cima (o 7.3 desenha o valor acima).
      for (const candidata of [linhas[i], linhas[i - 1]]) {
        if (!candidata) continue;
        const valores = candidata.itens.filter(
          (it) => it.x >= X_VALOR_APURACAO && RX_NUMERO_BR.test(it.str.trim()),
        );
        if (valores.length === 0) continue;
        // A linha de cima só vale se for SÓ o valor solto — se tiver rótulo,
        // é outro item do espelho e o número pertence a ele.
        if (candidata !== linhas[i] && candidata.itens.length !== valores.length) continue;
        return toNumeroBR(valores[valores.length - 1].str.trim());
      }
      return null;
    }
  }
  return null;
}

export async function extrairApuracaoEspelhoPdfjs(
  buffer: Buffer,
): Promise<ApuracaoEspelhoExtraida | null> {
  const paginas = await extrairLinhas(buffer);

  const debitoSaidas = valorDoItem(paginas, /^5\.1\s*[-–]/);
  const creditoEntradas = valorDoItem(paginas, /^6\.1\s*[-–]/);
  const saldoCredorAnterior = valorDoItem(paginas, /^6\.4\s*[-–]/);
  const deducoes = valorDoItem(paginas, /^7\.2\s*[-–]\s*DEDU/i);
  // 7.3 é o imposto a recolher; 9.1 (demonstrativo) repete o mesmo total e
  // serve de rede quando o 7.3 não é localizado.
  const icms =
    valorDoItem(paginas, /^7\.3\s*[-–]/) ?? valorDoItem(paginas, /^9\.1\s*[-–]\s*ICMS NORMAL/i);

  // Sem os três campos estruturais, o PDF não está no layout esperado: devolve
  // null para o chamador tratar como erro, em vez de gravar número chutado.
  if (debitoSaidas === null || creditoEntradas === null || saldoCredorAnterior === null) return null;

  return {
    debitoSaidas,
    creditoEntradas,
    saldoCredorAnterior,
    deducoes: deducoes ?? 0,
    icmsARecolherNormal: icms ?? 0,
  };
}
