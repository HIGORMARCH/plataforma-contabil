/**
 * Parser do SPED-Fiscal EFD ICMS/IPI — foca no registro E110 (apuração do ICMS
 * operações próprias) e no cabeçalho 0000 pra metadados.
 *
 * Layout oficial: Guia Prático da EFD ICMS/IPI (RFB).
 *
 * Formato do arquivo:
 *   - Texto (.txt), uma linha por registro.
 *   - Campos separados por pipe `|`, linha começa e termina com `|`.
 *   - Datas: DDMMAAAA (8 dígitos).
 *   - Números: vírgula como decimal, sem separador de milhar (ex.: "1234,56").
 *
 * V1: só lê 0000 e E100/E110. Ajustes/estornos/CFOP/notas ficam pra v2.
 */

/** Apuração extraída do bloco E100 + E110 (uma por período). */
export interface E110Apuracao {
  dataInicial: Date;
  dataFinal: Date;

  totalDebitos: number;
  ajustesDebitos: number;
  totalAjustesDebitos: number;
  estornosCreditos: number;
  totalCreditos: number;
  ajustesCreditos: number;
  totalAjustesCreditos: number;
  estornosDebitos: number;
  saldoCredorAnterior: number;
  saldoDevedorApurado: number;
  deducoes: number;
  icmsARecolher: number;
  saldoCredorTransportar: number;
  debitoEspecial: number;

  // Totais de operações — somados dos registros C100 do bloco C (documentos fiscais).
  // Preenchidos com 0 se o arquivo não tiver bloco C (raro em SPED completo).
  totalCompras: number; // soma VL_DOC dos C100 com IND_OPER=0 (entrada)
  totalVendas: number; // soma VL_DOC dos C100 com IND_OPER=1 (saída)
  qtdNotasCompras: number; // quantas notas de entrada
  qtdNotasVendas: number; // quantas notas de saída
}

/** Metadados do cabeçalho 0000. */
export interface EfdIcmsMetadata {
  cnpj: string | null;
  cpf: string | null;
  ie: string | null;
  uf: string | null;
  nome: string | null;
  dataInicial: Date | null;
  dataFinal: Date | null;
}

export interface EfdIcmsParseResult {
  metadata: EfdIcmsMetadata;
  apuracoes: E110Apuracao[];
  totalLinhas: number;
  linhasIgnoradasFormato: number;
}

export class SpedFormatError extends Error {
  constructor(msg: string, public linha?: number) {
    super(linha ? `Linha ${linha}: ${msg}` : msg);
    this.name = "SpedFormatError";
  }
}

function parseDataDDMMAAAA(s: string): Date | null {
  if (!s || s.length !== 8) return null;
  const dd = Number(s.slice(0, 2));
  const mm = Number(s.slice(2, 4));
  const aaaa = Number(s.slice(4, 8));
  if (!dd || !mm || !aaaa) return null;
  // UTC pra evitar surpresa de timezone.
  const d = new Date(Date.UTC(aaaa, mm - 1, dd));
  if (isNaN(d.getTime())) return null;
  return d;
}

function parseNumeroSped(s: string): number {
  if (!s || !s.trim()) return 0;
  // SPED usa vírgula como decimal e nunca separador de milhar.
  const n = Number(s.replace(",", "."));
  if (isNaN(n)) throw new SpedFormatError(`número inválido: "${s}"`);
  return n;
}

/**
 * Divide a linha do SPED nos seus campos.
 * Uma linha válida começa e termina com "|". Ex.: "|E110|1000,00|...|"
 * Retorna array SEM o vazio inicial/final (só os campos reais, com REG na posição 0).
 */
function splitLinha(linha: string): string[] | null {
  if (!linha.startsWith("|") || !linha.endsWith("|")) return null;
  const partes = linha.slice(1, -1).split("|");
  return partes.length ? partes : null;
}

export function parseEfdIcms(texto: string): EfdIcmsParseResult {
  // Normaliza quebras de linha (CRLF do Windows, LF de Unix, CR do Mac velho).
  const linhas = texto.replace(/\r\n?/g, "\n").split("\n");

  const metadata: EfdIcmsMetadata = {
    cnpj: null,
    cpf: null,
    ie: null,
    uf: null,
    nome: null,
    dataInicial: null,
    dataFinal: null,
  };

  const apuracoes: E110Apuracao[] = [];
  // E110 vem depois de um E100 na mesma sequência do bloco E — guarda o último E100 lido.
  let ultimoPeriodoE100: { dataInicial: Date; dataFinal: Date } | null = null;

  // Totais de operações — somamos os C100 do bloco C, agrupando por entrada/saída.
  // Um SPED-Fiscal mensal tem só um período de apuração (um E110), então esses
  // totais são atribuídos ao E110 quando ele for encontrado.
  let totalCompras = 0;
  let totalVendas = 0;
  let qtdNotasCompras = 0;
  let qtdNotasVendas = 0;

  let linhasIgnoradasFormato = 0;

  for (let i = 0; i < linhas.length; i++) {
    const linha = linhas[i].trim();
    if (!linha) continue;

    const campos = splitLinha(linha);
    if (!campos || !campos[0]) {
      linhasIgnoradasFormato++;
      continue;
    }
    const reg = campos[0];

    // 0000 — abertura: |0000|COD_VER|COD_FIN|DT_INI|DT_FIN|NOME|CNPJ|CPF|UF|IE|...
    if (reg === "0000") {
      metadata.dataInicial = parseDataDDMMAAAA(campos[3] ?? "");
      metadata.dataFinal = parseDataDDMMAAAA(campos[4] ?? "");
      metadata.nome = (campos[5] || "").trim() || null;
      metadata.cnpj = (campos[6] || "").trim() || null;
      metadata.cpf = (campos[7] || "").trim() || null;
      metadata.uf = (campos[8] || "").trim() || null;
      metadata.ie = (campos[9] || "").trim() || null;
      continue;
    }

    // C100 — cabeçalho de nota fiscal:
    // |C100|IND_OPER|IND_EMIT|COD_PART|COD_MOD|COD_SIT|SER|NUM_DOC|CHV_NFE|DT_DOC|DT_E_S|VL_DOC|...|
    // IND_OPER (campos[1]): 0 = Entrada, 1 = Saída
    // VL_DOC (campos[11]): valor total do documento
    // COD_SIT (campos[5]): 00 = Regular; 02 = Cancelado; 03 = Cancelado extemp; 04-08 = outros — ignoramos != 00
    if (reg === "C100") {
      const codSit = (campos[5] ?? "").trim();
      // Só considera documentos regulares (não cancelados/extemporâneos/etc.).
      if (codSit !== "00") continue;
      const indOper = (campos[1] ?? "").trim();
      let valor = 0;
      try {
        valor = parseNumeroSped(campos[11] ?? "0");
      } catch {
        continue; // linha malformada, ignora sem quebrar tudo
      }
      if (indOper === "0") {
        totalCompras += valor;
        qtdNotasCompras++;
      } else if (indOper === "1") {
        totalVendas += valor;
        qtdNotasVendas++;
      }
      continue;
    }

    // E100 — período de apuração ICMS: |E100|DT_INI|DT_FIN|
    if (reg === "E100") {
      const di = parseDataDDMMAAAA(campos[1] ?? "");
      const df = parseDataDDMMAAAA(campos[2] ?? "");
      if (!di || !df) throw new SpedFormatError("E100 com datas inválidas", i + 1);
      ultimoPeriodoE100 = { dataInicial: di, dataFinal: df };
      continue;
    }

    // E110 — apuração ICMS operações próprias:
    // |E110|VL_TOT_DEBITOS|VL_AJ_DEBITOS|VL_TOT_AJ_DEBITOS|VL_ESTORNOS_CRED|
    //      VL_TOT_CREDITOS|VL_AJ_CREDITOS|VL_TOT_AJ_CREDITOS|VL_ESTORNOS_DEB|
    //      VL_SLD_CREDOR_ANT|VL_SLD_APURADO|VL_TOT_DED|VL_ICMS_RECOLHER|
    //      VL_SLD_CREDOR_TRANSPORTAR|DEB_ESP|
    if (reg === "E110") {
      if (!ultimoPeriodoE100) {
        throw new SpedFormatError("E110 sem E100 anterior — arquivo malformado", i + 1);
      }
      try {
        apuracoes.push({
          dataInicial: ultimoPeriodoE100.dataInicial,
          dataFinal: ultimoPeriodoE100.dataFinal,
          totalDebitos: parseNumeroSped(campos[1] ?? "0"),
          ajustesDebitos: parseNumeroSped(campos[2] ?? "0"),
          totalAjustesDebitos: parseNumeroSped(campos[3] ?? "0"),
          estornosCreditos: parseNumeroSped(campos[4] ?? "0"),
          totalCreditos: parseNumeroSped(campos[5] ?? "0"),
          ajustesCreditos: parseNumeroSped(campos[6] ?? "0"),
          totalAjustesCreditos: parseNumeroSped(campos[7] ?? "0"),
          estornosDebitos: parseNumeroSped(campos[8] ?? "0"),
          saldoCredorAnterior: parseNumeroSped(campos[9] ?? "0"),
          saldoDevedorApurado: parseNumeroSped(campos[10] ?? "0"),
          deducoes: parseNumeroSped(campos[11] ?? "0"),
          icmsARecolher: parseNumeroSped(campos[12] ?? "0"),
          saldoCredorTransportar: parseNumeroSped(campos[13] ?? "0"),
          debitoEspecial: parseNumeroSped(campos[14] ?? "0"),
          totalCompras,
          totalVendas,
          qtdNotasCompras,
          qtdNotasVendas,
        });
      } catch (e) {
        if (e instanceof SpedFormatError) throw new SpedFormatError(e.message, i + 1);
        throw e;
      }
      continue;
    }

    // Outros registros são ignorados na v1.
  }

  return {
    metadata,
    apuracoes,
    totalLinhas: linhas.length,
    linhasIgnoradasFormato,
  };
}

/**
 * Deriva a competência (primeiro dia do mês) da data inicial da apuração.
 * Ex.: dataInicial 01/06/2026 → competência 01/06/2026.
 */
export function competenciaDeApuracao(apur: E110Apuracao): Date {
  const d = apur.dataInicial;
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
}
