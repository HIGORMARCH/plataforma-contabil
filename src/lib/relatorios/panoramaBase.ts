/**
 * Panorama da base de NCM da plataforma.
 *
 * O objetivo do módulo (Higor, 19/08/2026): "fazer uma base cada vez maior, pra
 * que quando qualquer cliente chegar no escritório a gente já tenha uma base
 * robusta e completa".
 *
 * A base é o ativo — não a tabela de cada cliente. Toda tabela que entra é
 * cruzada com ela, e todo NCM classificado na Econet volta pra ela. Este
 * módulo mede o tamanho e a composição desse ativo, e quanto falta pra ele
 * cobrir o que os clientes trazem.
 *
 * Funções puras: quem chama busca os dados.
 */

export interface LinhaBase {
  ncm: string;
  origem: string;
  tipo: string;
  atualizadoEm: Date;
}

export interface PanoramaBase {
  total: number;
  porRegime: Array<{ tipo: string; quantidade: number }>;
  porOrigem: Array<{ origem: string; quantidade: number }>;
  /** NCMs acrescentados nos últimos 30 dias — o crescimento recente. */
  acrescentadosRecentes: number;
  /** Data do registro mais recente, pra mostrar quando a base cresceu pela última vez. */
  ultimaInclusao: Date | null;
}

export interface CoberturaCliente {
  /** NCMs distintos que este cliente trouxe. */
  totalDoCliente: number;
  /** Quantos deles a base já cobria. */
  cobertosPelaBase: number;
  /** Quantos ainda faltam classificar — o que a base precisa aprender. */
  faltantes: string[];
  /** Percentual coberto, 0-100. */
  percentual: number;
}

export function montarPanoramaBase(linhas: LinhaBase[], agora: Date): PanoramaBase {
  const porRegime = new Map<string, number>();
  const porOrigem = new Map<string, number>();
  let ultimaInclusao: Date | null = null;
  let recentes = 0;

  const limite = new Date(agora.getTime() - 30 * 24 * 60 * 60 * 1000);

  for (const l of linhas) {
    porRegime.set(l.tipo, (porRegime.get(l.tipo) ?? 0) + 1);
    porOrigem.set(l.origem, (porOrigem.get(l.origem) ?? 0) + 1);
    if (!ultimaInclusao || l.atualizadoEm > ultimaInclusao) ultimaInclusao = l.atualizadoEm;
    if (l.atualizadoEm >= limite) recentes++;
  }

  const ordenar = (m: Map<string, number>) =>
    [...m.entries()].map(([k, quantidade]) => ({ k, quantidade })).sort((a, b) => b.quantidade - a.quantidade);

  return {
    total: linhas.length,
    porRegime: ordenar(porRegime).map((r) => ({ tipo: r.k, quantidade: r.quantidade })),
    porOrigem: ordenar(porOrigem).map((r) => ({ origem: r.k, quantidade: r.quantidade })),
    acrescentadosRecentes: recentes,
    ultimaInclusao,
  };
}

/**
 * Quanto da tabela de um cliente a base já cobre.
 *
 * É a medida que importa pro objetivo: quanto mais alta, menos consulta externa
 * o próximo cliente vai exigir.
 */
export function medirCobertura(ncmsDoCliente: string[], ncmsNaBase: Set<string>): CoberturaCliente {
  const distintos = [...new Set(ncmsDoCliente)];
  const faltantes = distintos.filter((n) => !ncmsNaBase.has(n));
  const cobertos = distintos.length - faltantes.length;
  return {
    totalDoCliente: distintos.length,
    cobertosPelaBase: cobertos,
    faltantes,
    percentual: distintos.length === 0 ? 100 : Math.round((cobertos / distintos.length) * 100),
  };
}
