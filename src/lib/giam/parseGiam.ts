/**
 * Parser do arquivo GIAM 10.0 (SEFAZ-TO).
 *
 * ⚠️ QUAL GIAM É ESTA — não confundir (correção do Higor, 20/07/2026):
 *
 * Este parser lê o **arquivo gerado pelo Domínio** para transmissão. Ele NÃO é
 * a GIAM oficial recepcionada pela SEFAZ. São coisas diferentes:
 *
 *   - Arquivo do Domínio  → o que o escritório gerou e (em tese) transmitiu
 *   - GIAM do portal SEFAZ → o que o Estado efetivamente recebeu
 *
 * Os dois DIVERGEM se alguém alterar o Domínio depois da transmissão — e é
 * justamente essa divergência que interessa auditar.
 *
 * Consequência prática: confrontar este arquivo com o SPED (que também sai do
 * Domínio) verifica apenas a COERÊNCIA INTERNA do Domínio. Não prova o que foi
 * declarado ao Estado. Para isso é preciso ler o PDF do portal
 * https://giam.sefaz.to.gov.br (pendente).
 *
 * Layout oficial: LeiauteGIAM10.0.pdf (Anexo III à Portaria SEFAZ nº 1.392/2019).
 *
 * Formato do arquivo:
 *   - Texto ASCII, posições fixas (NÃO delimitado por pipe como o SPED).
 *   - Um registro por linha, primeiro caractere = segmento (A/B/C/D/E/G/H/I/J/K/L/M/N/O/P/Q/R/S/Z).
 *   - Valores numéricos em CENTAVOS (dividir por 100 pra obter reais).
 *   - Datas: DDMMAAAA (segmentos individuais) ou MMAAAA (período de referência).
 *
 * Extrai o necessário pra auditoria de ICMS:
 *   - Segmento A (cabeçalho + apuração consolidada)
 *   - Segmento B (entradas e saídas POR CFOP com todas as colunas do Quadro 4:
 *     Base de Cálculo, Isentas, Outras, ST, Valor Contábil, Crédito ou Débito)
 *   - Segmento E (ICMS a recolher por tipo)
 *   - Segmento Z (total de registros pra sanity check)
 *
 * Segmentos C, D, G, H, I, J, K, L, M, N, O, P, Q, R, S seguem ignorados
 * (detalhamento por UF/produto/município que não usamos no confronto atual).
 */

export type TipoIcmsGiam = "N" | "D" | "S" | "C" | "F" | "P" | string;

export interface GiamIcmsARecolher {
  tipo: TipoIcmsGiam; // N=Normal, D=Dif.Ent, S=ST, C=Compl, F=Dif.Saí, P=FundoPobreza
  dataVencimento: Date | null;
  valor: number;
}

/**
 * Uma linha do Segmento B — uma operação (CFOP) numa natureza (entrada ou
 * saída). Espelha o Quadro 4 do "Espelho da GIAM" que a SEFAZ imprime:
 * uma linha por CFOP × 6 colunas de valor.
 */
export interface GiamLinhaSegmentoB {
  natureza: "0" | "1"; // 0 = entrada, 1 = saída
  cfop: string; // 4 dígitos (B6)
  baseCalculo: number; // B7 — não preenchido no Simples Nacional
  isentasNaoTributadas: number; // B8 — não preenchido no Simples Nacional
  outras: number; // B9
  substituicaoTributaria: number; // B10
  valorContabil: number; // B11
  creditoDebitoImposto: number; // B12 — crédito se entrada, débito se saída
  domicilioFiscal: string; // B13 — A=Atual, B=Anterior
}

/**
 * Totais consolidados de um lado do Segmento B (entradas ou saídas).
 * Somam-se as colunas de todas as linhas do lado. É o que aparece nas linhas
 * "TOTAL" do Quadro 4 do PDF da SEFAZ e é a base direta pra confrontar com o
 * SPED (que traz apenas totais no E110 e no somatório dos C100).
 */
export interface GiamTotaisSegmentoB {
  valorContabil: number;
  baseCalculo: number;
  isentasNaoTributadas: number;
  outras: number;
  substituicaoTributaria: number;
  creditoDebitoImposto: number;
  linhas: number;
}

export interface GiamApuracaoParsed {
  inscricaoEstadual: string;
  periodoApuracao: Date; // primeiro dia do mês
  periodoMMAAAA: string; // "042022"
  retificacao: string; // "00" = original
  atividadeEconomica: string;
  tipoEstabelecimento: string; // U/M/F
  portadorTare: string; // S/N
  tipoEscrituracao: string; // F/C
  cpfDeclarante: string;
  nomeDeclarante: string;
  crcContabilista: string;
  ufCrcContabilista: string;
  nomeContabilista: string;
  telefoneContabilista: string;

  // Débito
  debitoSaidas: number; // A18
  outrosDebitos: number; // A19
  estornoCreditos: number; // A20

  // Crédito
  creditoEntradas: number; // A21
  outrosCreditos: number; // A22
  estornosDebito: number; // A23
  saldoCredorAnterior: number; // A24

  // Apuração
  deducoes: number; // A25
  difAliquotaARecolher: number; // A26

  versaoArquivo: string; // A33

  // Segmento B — linha a linha (CFOP × 6 colunas) mais totais consolidados.
  //
  // linhasSegmentoB: uma entrada por registro B do arquivo.
  // totalEntradas / totalSaidas: soma por coluna, permitem confronto direto
  //   com o SPED (que só traz totais no E110 e na soma dos C100). Também são
  //   o que aparece nas linhas "TOTAL" do Quadro 4 do PDF da SEFAZ.
  linhasSegmentoB: GiamLinhaSegmentoB[];
  totalEntradas: GiamTotaisSegmentoB;
  totalSaidas: GiamTotaisSegmentoB;

  // Compat: totais de valor contábil que já existiam antes (Total Compras =
  // total entradas valor contábil; Total Vendas = total saídas valor contábil).
  // Manter os campos evita quebrar quem já lê parsed.totalCompras / .totalVendas.
  totalCompras: number;
  totalVendas: number;

  // ICMS a recolher (do Segmento E)
  icmsARecolher: GiamIcmsARecolher[];
  icmsARecolherTotal: number; // soma dos E7

  // Sanity
  totalRegistros: number; // Z5
  totalLinhasArquivo: number;
}

export class GiamFormatError extends Error {
  constructor(msg: string, public linha?: number) {
    super(linha ? `Linha ${linha}: ${msg}` : msg);
    this.name = "GiamFormatError";
  }
}

/** Lê N caracteres a partir da posição (1-indexed, inclusive). Retorna string trimmed. */
function campoAlfa(linha: string, inicio: number, tamanho: number): string {
  return linha.substring(inicio - 1, inicio - 1 + tamanho).trim();
}

/** Lê campo numérico em centavos e converte pra reais. */
function campoValor(linha: string, inicio: number, tamanho: number): number {
  const raw = linha.substring(inicio - 1, inicio - 1 + tamanho).trim();
  if (!raw) return 0;
  const n = Number(raw);
  if (isNaN(n)) throw new GiamFormatError(`valor não numérico em pos ${inicio}: "${raw}"`);
  return n / 100;
}

/** Data DDMMAAAA → Date UTC ou null se vazio/inválido. */
function campoDataDDMMAAAA(linha: string, inicio: number): Date | null {
  const s = linha.substring(inicio - 1, inicio - 1 + 8);
  if (!s || /^0+$/.test(s)) return null;
  const dd = Number(s.slice(0, 2));
  const mm = Number(s.slice(2, 4));
  const aaaa = Number(s.slice(4, 8));
  if (!dd || !mm || !aaaa) return null;
  const d = new Date(Date.UTC(aaaa, mm - 1, dd));
  return isNaN(d.getTime()) ? null : d;
}

function totaisZerados(): GiamTotaisSegmentoB {
  return {
    valorContabil: 0,
    baseCalculo: 0,
    isentasNaoTributadas: 0,
    outras: 0,
    substituicaoTributaria: 0,
    creditoDebitoImposto: 0,
    linhas: 0,
  };
}

/** MMAAAA → Date UTC (dia 1) ou null. */
function periodoMMAAAA(s: string): Date | null {
  if (!s || s.length !== 6) return null;
  const mm = Number(s.slice(0, 2));
  const aaaa = Number(s.slice(2, 6));
  if (!mm || !aaaa) return null;
  return new Date(Date.UTC(aaaa, mm - 1, 1));
}

/**
 * Reconhece um arquivo GIAM 10.0 pela primeira linha:
 * começa com "A" + 9 dígitos (IE) + 2 espaços + 6 dígitos (MMAAAA).
 */
export function pareceGiam(conteudo: string): boolean {
  const primeira = conteudo.split(/\r?\n/, 1)[0] ?? "";
  return /^A\d{9}\s{2}\d{6}/.test(primeira);
}

export function parseGiam(texto: string): GiamApuracaoParsed {
  const linhas = texto.replace(/\r\n?/g, "\n").split("\n");

  // Estado global (Segmento A + E acumulado + Z)
  let segA: string | null = null;
  const segB: string[] = [];
  const segE: string[] = [];
  let segZ: string | null = null;

  for (const linha of linhas) {
    if (!linha) continue;
    const tipo = linha.charAt(0);
    if (tipo === "A" && !segA) segA = linha;
    else if (tipo === "B") segB.push(linha);
    else if (tipo === "E") segE.push(linha);
    else if (tipo === "Z") segZ = linha;
    // demais segmentos ignorados
  }

  if (!segA) throw new GiamFormatError("arquivo sem Segmento A — não é um GIAM válido");

  // --- Segmento A ---
  const inscricaoEstadual = campoAlfa(segA, 2, 9);
  const periodoMM = campoAlfa(segA, 13, 6);
  const periodoApur = periodoMMAAAA(periodoMM);
  if (!periodoApur) throw new GiamFormatError(`período de referência inválido no Segmento A: "${periodoMM}"`);

  const parsed: GiamApuracaoParsed = {
    inscricaoEstadual,
    periodoApuracao: periodoApur,
    periodoMMAAAA: periodoMM,
    retificacao: campoAlfa(segA, 19, 2),
    atividadeEconomica: campoAlfa(segA, 21, 7),
    tipoEstabelecimento: campoAlfa(segA, 28, 1),
    portadorTare: campoAlfa(segA, 29, 1),
    tipoEscrituracao: campoAlfa(segA, 30, 1),
    cpfDeclarante: campoAlfa(segA, 60, 11),
    nomeDeclarante: campoAlfa(segA, 71, 50),
    crcContabilista: campoAlfa(segA, 121, 10),
    ufCrcContabilista: campoAlfa(segA, 131, 2),
    nomeContabilista: campoAlfa(segA, 133, 50),
    telefoneContabilista: campoAlfa(segA, 183, 20),
    debitoSaidas: campoValor(segA, 203, 14),
    outrosDebitos: campoValor(segA, 217, 14),
    estornoCreditos: campoValor(segA, 231, 14),
    creditoEntradas: campoValor(segA, 245, 14),
    outrosCreditos: campoValor(segA, 259, 14),
    estornosDebito: campoValor(segA, 273, 14),
    saldoCredorAnterior: campoValor(segA, 287, 14),
    deducoes: campoValor(segA, 301, 14),
    difAliquotaARecolher: campoValor(segA, 315, 14),
    versaoArquivo: campoAlfa(segA, 419, 5),
    linhasSegmentoB: [],
    totalEntradas: totaisZerados(),
    totalSaidas: totaisZerados(),
    totalCompras: 0,
    totalVendas: 0,
    icmsARecolher: [],
    icmsARecolherTotal: 0,
    totalRegistros: 0,
    totalLinhasArquivo: linhas.length,
  };

  // --- Segmento B (uma linha por CFOP × natureza) ---
  //
  // Layout (Anexo III Portaria SEFAZ 1.392/2019):
  //   B5  pos 21  (1)  0 = entrada, 1 = saída
  //   B6  pos 22  (4)  CFOP
  //   B7  pos 26 (14)  Base de Cálculo  — não preenchido no Simples Nacional
  //   B8  pos 40 (14)  Isentas / Não Tributadas — idem
  //   B9  pos 54 (14)  Outras
  //   B10 pos 68 (14)  Substituição Tributária
  //   B11 pos 82 (14)  Valor Contábil
  //   B12 pos 96 (14)  Crédito (entrada) ou Débito (saída) do Imposto — idem
  //   B13 pos 110 (1)  Domicílio Fiscal (A=Atual, B=Anterior)
  for (const linhaB of segB) {
    const natureza = campoAlfa(linhaB, 21, 1);
    if (natureza !== "0" && natureza !== "1") continue; // natureza desconhecida
    const linha: GiamLinhaSegmentoB = {
      natureza,
      cfop: campoAlfa(linhaB, 22, 4),
      baseCalculo: campoValor(linhaB, 26, 14),
      isentasNaoTributadas: campoValor(linhaB, 40, 14),
      outras: campoValor(linhaB, 54, 14),
      substituicaoTributaria: campoValor(linhaB, 68, 14),
      valorContabil: campoValor(linhaB, 82, 14),
      creditoDebitoImposto: campoValor(linhaB, 96, 14),
      domicilioFiscal: campoAlfa(linhaB, 110, 1),
    };
    parsed.linhasSegmentoB.push(linha);

    const totais = natureza === "0" ? parsed.totalEntradas : parsed.totalSaidas;
    totais.valorContabil += linha.valorContabil;
    totais.baseCalculo += linha.baseCalculo;
    totais.isentasNaoTributadas += linha.isentasNaoTributadas;
    totais.outras += linha.outras;
    totais.substituicaoTributaria += linha.substituicaoTributaria;
    totais.creditoDebitoImposto += linha.creditoDebitoImposto;
    totais.linhas++;
  }

  // Compat: Total Compras / Vendas = Valor Contábil de cada lado.
  parsed.totalCompras = parsed.totalEntradas.valorContabil;
  parsed.totalVendas = parsed.totalSaidas.valorContabil;

  // --- Segmento E (uma ou mais linhas) ---
  for (const linhaE of segE) {
    parsed.icmsARecolher.push({
      tipo: campoAlfa(linhaE, 21, 1),
      dataVencimento: campoDataDDMMAAAA(linhaE, 22),
      valor: campoValor(linhaE, 30, 14),
    });
  }
  parsed.icmsARecolherTotal = parsed.icmsARecolher.reduce((s, e) => s + e.valor, 0);

  // --- Segmento Z ---
  if (segZ) {
    const raw = campoAlfa(segZ, 21, 3);
    parsed.totalRegistros = Number(raw) || 0;
  }

  return parsed;
}
