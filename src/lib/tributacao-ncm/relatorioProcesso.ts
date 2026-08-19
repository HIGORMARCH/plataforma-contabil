/**
 * Relatório do processo de classificação de NCM de um cliente.
 *
 * Responde, numa tela só: de onde veio cada NCM, o que a base da plataforma
 * resolveu, o que sobrou, e — o mais importante pro contador — onde o cadastro
 * do cliente está em desacordo com a nossa base.
 *
 * O QUE DÁ PRA AFIRMAR SOBRE O CADASTRO DO CLIENTE
 *
 * O arquivo que vem do Domínio dele traz código, descrição e NCM. NÃO traz CST
 * nem natureza. Então este relatório NUNCA diz "ele usa CST 50 e o certo é 70"
 * — isso seria adivinhação.
 *
 * O que ele diz é o que se demonstra a partir do próprio documento:
 *
 *  1. INCOERÊNCIA INTERNA — no Domínio, cada código de configuração carrega UM
 *     conjunto de parâmetros fiscais. Se o cliente pôs no MESMO código dele
 *     dois NCMs que, na nossa base, têm regimes diferentes (um monofásico e um
 *     tributado, digamos), então necessariamente um dos dois está errado, seja
 *     qual for o CST que ele escolheu. Isso é conclusão, não suspeita.
 *
 *  2. REGIME ESPECIAL A CONFERIR — NCMs que a nossa base aponta como
 *     monofásico, alíquota zero, isenta ou ST. Não afirmamos que ele errou;
 *     apontamos onde conferir, porque é onde tratar como tributado gera
 *     recolhimento a maior.
 *
 *  3. LACUNA — NCM que nem a nossa base nem o cadastro dele classificam. Falta
 *     consultar na Econet.
 */

export interface LinhaParaRelatorio {
  ncm: string;
  /** cliente_legado | base_plataforma | econet_auto | manual */
  origem: string;
  codigoCliente: number | null;
  descricaoCliente: string | null;
  /** Tipo da NOSSA configuração; null quando a linha não tem classificação. */
  tipo: string | null;
  codigoConfig: number | null;
  descricaoConfig: string | null;
}

export interface ItemRegime {
  ncm: string;
  codigoCliente: number | null;
  descricaoCliente: string | null;
  tipo: string;
  descricaoConfig: string;
  origem: string;
}

export interface CodigoIncoerente {
  codigoCliente: number;
  descricaoCliente: string | null;
  regimes: string[];
  itens: ItemRegime[];
}

export interface RelatorioProcesso {
  total: number;
  /** Quantos vieram de cada lugar. */
  porOrigem: Array<{ origem: string; quantidade: number }>;
  /** Distribuição por regime segundo a nossa base. */
  porRegime: Array<{ tipo: string; quantidade: number }>;
  classificados: number;
  semClassificacao: string[];
  /** Códigos do cliente que agrupam NCMs de regimes distintos — erro demonstrável. */
  codigosIncoerentes: CodigoIncoerente[];
  /**
   * TODO NCM da vigência que não é tributação normal — venha da tabela do
   * cliente ou tenha entrado agora. Nos que já eram dele, é conferência do que
   * está no Domínio; nos novos, é o que precisa ser cadastrado com o regime
   * certo. Nos dois casos, tratar como tributado gera recolhimento a maior.
   */
  regimesEspeciais: ItemRegime[];
  /** Quantos códigos distintos a tabela do cliente usa. */
  codigosDoCliente: number;
}

const ROTULO_ORIGEM: Record<string, string> = {
  cliente_legado: "Tabela do cliente (Domínio)",
  base_plataforma: "Base da plataforma",
  econet_auto: "Consulta à Econet",
  manual: "Cadastro manual",
};

export function rotuloOrigem(origem: string): string {
  return ROTULO_ORIGEM[origem] ?? origem;
}

const ROTULO_REGIME: Record<string, string> = {
  normal: "Tributação normal",
  monofasico: "Monofásico",
  aliquota_zero: "Alíquota zero",
  isenta: "Isenta",
  substituicao: "Substituição tributária",
};

export function rotuloRegime(tipo: string): string {
  return ROTULO_REGIME[tipo] ?? tipo;
}

function contar<T>(itens: T[], chave: (t: T) => string): Array<{ k: string; quantidade: number }> {
  const m = new Map<string, number>();
  for (const i of itens) {
    const k = chave(i);
    m.set(k, (m.get(k) ?? 0) + 1);
  }
  return [...m.entries()]
    .map(([k, quantidade]) => ({ k, quantidade }))
    .sort((a, b) => b.quantidade - a.quantidade);
}

export function montarRelatorioProcesso(linhas: LinhaParaRelatorio[]): RelatorioProcesso {
  const classificadas = linhas.filter((l) => l.tipo);

  // Agrupamento pelos códigos DO CLIENTE — só linhas que vieram da tabela dele
  // têm código com significado fiscal no Domínio dele.
  const doCliente = linhas.filter((l) => l.origem === "cliente_legado" && l.codigoCliente != null);
  const porCodigo = new Map<number, LinhaParaRelatorio[]>();
  for (const l of doCliente) {
    const arr = porCodigo.get(l.codigoCliente!) ?? [];
    arr.push(l);
    porCodigo.set(l.codigoCliente!, arr);
  }

  const codigosIncoerentes: CodigoIncoerente[] = [];
  for (const [codigo, itens] of porCodigo) {
    const regimes = [...new Set(itens.filter((i) => i.tipo).map((i) => i.tipo!))];
    if (regimes.length > 1) {
      codigosIncoerentes.push({
        codigoCliente: codigo,
        descricaoCliente: itens[0].descricaoCliente,
        regimes,
        itens: itens
          .filter((i) => i.tipo)
          .map((i) => ({
            ncm: i.ncm,
            codigoCliente: i.codigoCliente,
            descricaoCliente: i.descricaoCliente,
            tipo: i.tipo!,
            descricaoConfig: i.descricaoConfig ?? "",
            origem: i.origem,
          })),
      });
    }
  }
  codigosIncoerentes.sort((a, b) => a.codigoCliente - b.codigoCliente);

  const regimesEspeciais: ItemRegime[] = linhas
    .filter((l) => l.tipo && l.tipo !== "normal")
    .map((l) => ({
      ncm: l.ncm,
      codigoCliente: l.codigoCliente,
      descricaoCliente: l.descricaoCliente,
      tipo: l.tipo!,
      descricaoConfig: l.descricaoConfig ?? "",
      origem: l.origem,
    }))
    .sort((a, b) => (a.codigoCliente ?? 0) - (b.codigoCliente ?? 0));

  return {
    total: linhas.length,
    porOrigem: contar(linhas, (l) => l.origem).map((c) => ({ origem: c.k, quantidade: c.quantidade })),
    porRegime: contar(classificadas, (l) => l.tipo!).map((c) => ({
      tipo: c.k,
      quantidade: c.quantidade,
    })),
    classificados: classificadas.length,
    semClassificacao: linhas.filter((l) => !l.tipo).map((l) => l.ncm),
    codigosIncoerentes,
    regimesEspeciais,
    codigosDoCliente: porCodigo.size,
  };
}
