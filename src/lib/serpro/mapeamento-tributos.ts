/**
 * Mapeamento de código de receita federal → sigla de tributo usada na Auditoria.
 * Fonte: catálogo Receita Federal + validação empírica com PAGAMENTOS71.
 *
 * Se o código não estiver mapeado, retorna o próprio código como sigla —
 * assim garante que nada some da tela; só fica "cru" até adicionarmos.
 */

const MAPA: Record<string, string> = {
  // IRPJ
  "2089": "IRPJ", "2362": "IRPJ", "5993": "IRPJ", "0220": "IRPJ",
  // CSLL
  "2372": "CSLL", "6773": "CSLL",
  // PIS / COFINS
  "8109": "PIS", "6912": "PIS", "1921": "PIS",
  "2172": "COFINS", "5856": "COFINS", "1646": "COFINS",
  // IRRF (folha e serviços)
  "0561": "IRRF", "561": "IRRF", "0588": "IRRF", "3208": "IRRF", "1708": "IRRF",
  // INSS
  "1099": "INSS", "1082": "INSS", "1138": "INSS", "2100": "INSS", "1410": "INSS",
  // Simples Nacional
  "8863": "DAS", "1000": "DAS",
  // FGTS (recolhimento via GRF, não DARF, mas cataloguei)
  "GRF": "FGTS",
  // Parcelamentos / juros / multas isoladas
  "16": "IRRF", // TJLP IRRF Parcelamento (aparece em desmembramentos)
  "1079": "INSS", // Contribuição Previdenciária Patronal - Rural
};

export function tributoDeCodigo(codigo: string): string {
  const c = codigo.replace(/^0+/, "") || codigo; // remove leading zeros
  return MAPA[codigo] ?? MAPA[c] ?? codigo;
}

export const TRIBUTOS_CONHECIDOS = ["IRPJ", "CSLL", "PIS", "COFINS", "INSS", "IRRF", "FGTS", "DAS"] as const;
