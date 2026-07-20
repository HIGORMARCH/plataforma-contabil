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

/**
 * Categoria contábil do tributo — separação usada na Auditoria Tributária pra dividir
 * a análise em "impostos sobre vendas/lucro" e "impostos de folha de pagamento".
 * Convenção aqui: DAS entra em VENDAS_LUCRO (regime Simples é sobre faturamento).
 */
export type CategoriaTributo = "VENDAS_LUCRO" | "FOLHA";

// Overrides por código específico. IRRF tem códigos de folha (0561) e de serviços PJ (1708),
// então precisamos classificar pelo código, não pela sigla.
const CATEGORIA_POR_CODIGO: Record<string, CategoriaTributo> = {
  // IRRF sobre folha assalariada
  "0561": "FOLHA", "561": "FOLHA",
  // IRRF RPA (autônomo sem vínculo — processado pelo RH junto com a folha)
  "0588": "FOLHA",
  // IRRF sobre serviços PJ (vira DARF isolado — não folha)
  "1708": "VENDAS_LUCRO",
  // Aluguéis PF — não é folha nem vendas, cai no bloco vendas/lucro como "outros"
  "3208": "VENDAS_LUCRO",
};

export function categoriaDeCodigo(codigo: string): CategoriaTributo {
  const c = codigo.replace(/^0+/, "") || codigo;
  const override = CATEGORIA_POR_CODIGO[codigo] ?? CATEGORIA_POR_CODIGO[c];
  if (override) return override;
  const sigla = tributoDeCodigo(codigo);
  if (sigla === "INSS" || sigla === "IRRF" || sigla === "FGTS") return "FOLHA";
  return "VENDAS_LUCRO";
}

export const ROTULO_CATEGORIA: Record<CategoriaTributo, string> = {
  VENDAS_LUCRO: "Impostos sobre Vendas e Lucro",
  FOLHA: "Impostos de Folha de Pagamento",
};
