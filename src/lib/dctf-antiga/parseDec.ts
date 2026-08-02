/**
 * Parser DCTF Mensal antiga (.dec do PGD DCTF Mensal v36).
 *
 * Formato: ASCII posicional, registros identificados pelas primeiras 3 chars:
 *   DCTFM — header do arquivo (versão, CNPJ, razão social, período)
 *   R01   — cabeçalho do declarante
 *   R02   — endereço do declarante
 *   R03   — responsáveis
 *   R10   — DÉBITO por código de receita (um R10 por débito)
 *   R11   — Detalhamento do débito R10 correspondente (mesmo código)
 *   T9    — trailer/encerramento
 *
 * O R10 é onde ficam os débitos. Estrutura observada:
 *   pos 1-3    "R10"
 *   pos 4-17   CNPJ (14)
 *   pos 18-23  período declaração AAAAMM
 *   pos 24-34  número sequencial (11 dígitos)
 *   pos 35-38  CÓDIGO DE RECEITA (4 dígitos)   ← identifica PIS/COFINS
 *   pos 39     ? (0 ou 1)
 *   pos 40     variante (1 ou 2)
 *   pos 41     periodicidade ("T" trimestral / "M" mensal)
 *   pos 42-47  período apuração AAAAMM
 *   ... valores (posições fixas)
 *   final     checksum
 *
 * CÓDIGOS DE RECEITA relevantes pra auditoria PIS/COFINS:
 *   8109 — PIS/PASEP Não-Cumulativo (Faturamento)
 *   6912 — PIS/PASEP Cumulativo (Faturamento)
 *   2172 — COFINS Não-Cumulativa (Faturamento)
 *   5856 — COFINS Cumulativa (Faturamento)
 *   (outros códigos existem — Sistema S, IRRF etc. — pulamos)
 *
 * ⚠️ ATENÇÃO: sem o layout oficial da Receita em mãos, o parse dos VALORES
 * é heurístico. Depois de importar o primeiro arquivo, é ESSENCIAL comparar
 * na tela vs o PDF do e-CAC pra validar. Se der divergência, ajustar as
 * posições aqui.
 */

const CODIGOS_PIS = new Set(["8109", "6912"]);
const CODIGOS_COFINS = new Set(["2172", "5856"]);

export interface DebitoDctf {
  codigoReceita: string; // 4 dígitos
  periodicidade: "M" | "T"; // mensal ou trimestral
  periodoApuracao: Date; // primeiro dia do mês
  valor: number; // BRL
  linha: string; // linha original pra debug
}

export interface DctfAntigaDecParsed {
  cnpj?: string;
  razaoSocial?: string;
  periodoDeclaracao?: Date; // primeiro dia do mês da DECLARAÇÃO
  situacao?: string; // "ORIGI" | "RETIF" (do nome do arquivo)
  debitos: DebitoDctf[];
  // Consolidado (soma por código-família)
  pisTotal: number;
  cofinsTotal: number;
}

function parseAAAAMM(s: string): Date | undefined {
  if (!s || s.length !== 6) return undefined;
  const ano = Number(s.slice(0, 4));
  const mes = Number(s.slice(4, 6)) - 1;
  if (isNaN(ano) || isNaN(mes)) return undefined;
  return new Date(ano, mes, 1);
}

/**
 * Extrai o valor do débito da linha R10.
 *
 * Layout confirmado em 02/08/2026 comparando com PDF do e-CAC (PALMAS HALL Jun/22):
 *   Linha R10 tem 98 chars total.
 *   Pos -14 até fim: 14 chars de checksum + zeros à direita
 *   Pos -24 até -15: 10 chars com VALOR PRINCIPAL DEVIDO em centavos (padding-left)
 *
 * Ex.: PIS 8109 Jun/22 = "0000045110" → 45110 centavos → R$ 451,10 ✓
 *      COFINS 2172 Jun/22 = "0000208234" → 208234 centavos → R$ 2.082,34 ✓
 *
 * (A tentativa anterior de pegar slice(-25, -10) dava valores 10.000× maiores —
 * pegava o "45110000" como se fosse 45.110.000 centavos = R$ 451.100,00.)
 */
function extrairValorR10(linha: string): number {
  if (linha.length < 24) return 0;
  const valorStr = linha.slice(-24, -14);
  const valor = Number(valorStr) / 100;
  return Number.isFinite(valor) ? valor : 0;
}

export function parseDecDctfAntiga(conteudo: string, nomeArquivo?: string): DctfAntigaDecParsed {
  const res: DctfAntigaDecParsed = {
    debitos: [],
    pisTotal: 0,
    cofinsTotal: 0,
  };

  // Do nome do arquivo tentamos extrair situação (ORIGI/RETIF) e período
  // Ex: "44463938000113-DCTFM36-202206-ORIGI.dec"
  if (nomeArquivo) {
    const m = nomeArquivo.match(/DCTFM\d*-(\d{6})-(ORIGI|RETIF)/i);
    if (m) {
      res.periodoDeclaracao = parseAAAAMM(m[1]);
      res.situacao = m[2].toUpperCase();
    }
  }

  const linhas = conteudo.split(/\r?\n/);
  for (const linhaRaw of linhas) {
    const linha = linhaRaw.replace(/\r$/, "");
    if (!linha) continue;
    const reg = linha.slice(0, 3);

    if (reg === "DCT") {
      // "DCTFM       202219300444639380001132360PALMAS HALL..."
      //  0    5      12    18  21              35
      // pos 0-4  : "DCTFM"
      // pos 5-11 : 7 espaços
      // pos 12-15: ano (AAAA)
      // pos 16-17: versão PGD (ex.: "19")
      // pos 18-20: código (ex.: "300")
      // pos 21-34: CNPJ (14 dígitos)
      // pos 35-...: sequencial + razão social
      // Melhor: fazer regex extrair 14 dígitos consecutivos apos "DCTFM".
      // 9 dígitos: 4 (ano) + 2 (versão PGD) + 3 (código) + 14 (CNPJ). Regex
      // com \d{4,10} era greedy e comia 1 dígito do CNPJ — fix: 9 exatos.
      const m = linha.match(/DCTFM\s+\d{9}(\d{14})/);
      if (m) res.cnpj = m[1];
      // Razão social vem logo após o CNPJ + 3 dígitos de identificador
      const razaoMatch = linha.match(/DCTFM\s+\d{4,10}\d{14}\d{3}([A-Z][A-Z\s\d.-]+?)\s{2,}/);
      if (razaoMatch) res.razaoSocial = razaoMatch[1].trim();
      // Período NÃO vem do header confiavelmente aqui — usamos o do nome do arquivo.
    } else if (reg === "R10") {
      // Extrai código de receita (pos 35-38) e valor
      const codigo = linha.slice(34, 38);
      if (!/^\d{4}$/.test(codigo)) continue;
      const periodicidade = linha.slice(40, 41) as "M" | "T";
      const periodoApuStr = linha.slice(41, 47);
      const periodo = parseAAAAMM(periodoApuStr);
      if (!periodo) continue;
      const valor = extrairValorR10(linha);
      res.debitos.push({
        codigoReceita: codigo,
        periodicidade,
        periodoApuracao: periodo,
        valor,
        linha,
      });
      if (CODIGOS_PIS.has(codigo)) res.pisTotal += valor;
      if (CODIGOS_COFINS.has(codigo)) res.cofinsTotal += valor;
    }
  }

  return res;
}
