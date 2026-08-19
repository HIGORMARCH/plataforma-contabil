/**
 * Gera o TXT no formato exato que o Domínio aceita
 * (leiaute "Autmais - Importação NCM Com Tributação").
 *
 * Formato:
 *  - 9 colunas separadas por `;`
 *  - Latin-1 / Windows-1252
 *  - Line ending CRLF (\r\n) — cuidado com \r\r\n duplo!
 *  - Sem acento nas descrições
 *  - NCM com espaço no final ("01051110 ")
 *  - Ordenado por (código_config, NCM)
 *  - Uma linha por NCM único (deduplicado)
 *
 * Colunas: cod;descricao;ncm ;N;cst_entrada;vinculo_credito;base_credito;cst_saida;natureza
 *
 * Os dois campos entre o CST de entrada e o de saída — que hoje saem VAZIOS —
 * são "Vínculo do crédito" e "Base do crédito" da aba PIS/COFINS > Entradas do
 * Domínio (tela "Configuração de Impostos para Produtos"). Confirmado com o
 * Higor em 19/08/2026, conferindo a linha
 *
 *     1;ALIQUOTA ZERO - 109;01051110 ;N;73;;;6;109
 *
 * contra a tela: CST 73 preenchido, os dois combos logo abaixo em branco.
 *
 * Deixá-los vazios é o comportamento atual e o Domínio aceita a importação.
 * Preenchê-los é decisão fiscal — depende do regime da empresa e do vínculo da
 * aquisição —, então não é algo que o gerador deva inventar sozinho.
 */

export interface LinhaNcmTxt {
  codigo: number;
  descricao: string;
  ncm: string; // 8 dígitos
  cstEntrada: string;
  cstSaida: string;
  natureza: string;
}

function semAcento(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "");
}

/**
 * Serializa as linhas no formato Domínio. Retorna um Buffer Latin-1 (Windows-1252).
 */
export function gerarTxtDominio(linhas: LinhaNcmTxt[]): Uint8Array {
  const ordenado = [...linhas].sort((a, b) => a.codigo - b.codigo || a.ncm.localeCompare(b.ncm));
  const dedup = new Map<string, LinhaNcmTxt>();
  for (const l of ordenado) {
    dedup.set(l.ncm, l); // último ganha (se houver duplicata)
  }
  const partes: string[] = [];
  for (const l of dedup.values()) {
    const desc = semAcento(l.descricao);
    const ncm = l.ncm.padStart(8, "0").slice(0, 8);
    // Formato: cod;desc;ncm ;N;cst_e;;;cst_s;nat
    partes.push(`${l.codigo};${desc};${ncm} ;N;${l.cstEntrada};;;${l.cstSaida};${l.natureza}`);
  }
  const texto = partes.join("\r\n") + "\r\n";
  return encodeLatin1(texto);
}

/** Converte string UTF-16 (JS) pra bytes Latin-1 (Windows-1252). Caracteres fora do range viram '?'. */
function encodeLatin1(s: string): Uint8Array {
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) {
    const code = s.charCodeAt(i);
    out[i] = code < 256 ? code : 63; // '?' quando não cabe
  }
  return out;
}
