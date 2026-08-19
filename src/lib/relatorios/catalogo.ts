/**
 * Catálogo dos relatórios da plataforma — um por módulo.
 *
 * A ideia (Higor, 19/08/2026): cada módulo produz o seu relatório, e a
 * Auditoria monta um dossiê perguntando quais deles entram no documento que vai
 * pro cliente.
 *
 * Este catálogo é a fonte única dessa lista. Quando um módulo ganha relatório,
 * muda `disponivel` aqui e ele passa a aparecer como opção no dossiê — não há
 * segunda lista pra manter em sincronia.
 *
 * `disponivel: false` aparece na tela como pendente, em vez de sumir: o contador
 * precisa saber o que ainda não pode entregar ao cliente.
 */

export type GrupoModulo = "Fiscal" | "Contábil" | "Auditoria";

export interface ModuloRelatorio {
  id: string;
  rotulo: string;
  grupo: GrupoModulo;
  /** O que este relatório mostra — texto que também vai pro sumário do dossiê. */
  descricao: string;
  /** Já existe relatório imprimível na tela do próprio módulo? */
  disponivel: boolean;
  /**
   * Já pode entrar no dossiê consolidado?
   *
   * É diferente de `disponivel`: um módulo pode imprimir bem na tela dele e
   * ainda não ter os dados extraídos numa função reaproveitável — que é o que o
   * dossiê precisa pra montar a seção. Manter os dois campos evita oferecer no
   * dossiê algo que sairia em branco.
   */
  integradoAoDossie: boolean;
  /** Página do módulo, pra tela de seleção linkar. */
  href?: string;
}

export const CATALOGO_RELATORIOS: ModuloRelatorio[] = [
  // ---------------- Fiscal ----------------
  {
    id: "tributacao-ncm",
    rotulo: "Classificação de NCM — PIS/COFINS",
    grupo: "Fiscal",
    descricao:
      "Regime de PIS/COFINS de cada NCM do cliente, itens em regime especial que exigem conferência e o que ainda falta classificar.",
    disponivel: true,
    integradoAoDossie: true,
    href: "/painel/tributacao-ncm",
  },
  {
    id: "auditoria-obrigacoes-acessorias",
    rotulo: "Auditoria de Obrigações Acessórias",
    grupo: "Fiscal",
    descricao: "Entregas devidas x entregues por competência, com as lacunas apontadas.",
    disponivel: false,
    integradoAoDossie: false,
    href: "/painel/auditoria-obrigacoes-acessorias",
  },
  {
    id: "sped-fiscal",
    rotulo: "SPED-Fiscal",
    grupo: "Fiscal",
    descricao: "Apuração escriturada no SPED-Fiscal por competência.",
    disponivel: false,
    integradoAoDossie: false,
    href: "/painel/sped-fiscal",
  },
  {
    id: "pis-cofins",
    rotulo: "PIS/COFINS",
    grupo: "Fiscal",
    descricao: "Apuração de PIS e COFINS por competência.",
    disponivel: false,
    integradoAoDossie: false,
    href: "/painel/pis-cofins",
  },
  {
    id: "irpj-csll",
    rotulo: "IRPJ/CSLL",
    grupo: "Fiscal",
    descricao: "Apuração de IRPJ e CSLL por período.",
    disponivel: false,
    integradoAoDossie: false,
    href: "/painel/irpj-csll",
  },

  // ---------------- Contábil ----------------
  {
    id: "impostos-declarados",
    rotulo: "Impostos a Pagar (declarações)",
    grupo: "Contábil",
    descricao:
      "Obrigações apuradas nas declarações entregues (GIAM, SPED-Fiscal, DCTFWeb e ECF), para conferência contra o extrato bancário.",
    disponivel: true,
    integradoAoDossie: false,
    href: "/painel/impostos-declarados",
  },
  {
    id: "balancete-comparado",
    rotulo: "Balancete Comparado",
    grupo: "Contábil",
    descricao: "Confronto conta a conta entre o SPED-ECD do sistema e o transmitido à Receita.",
    disponivel: true,
    integradoAoDossie: false,
    href: "/painel/balancete",
  },
  {
    id: "balanco-comparado",
    rotulo: "Balanço Comparado",
    grupo: "Contábil",
    descricao: "Balanço patrimonial do sistema confrontado com o da ECD transmitida.",
    disponivel: false,
    integradoAoDossie: false,
    href: "/painel/balanco",
  },
  {
    id: "conciliacao-ecd",
    rotulo: "Conciliação ECD (nível 3)",
    grupo: "Contábil",
    descricao: "Conciliação Domínio × ECD por grupo, subgrupo e nível 3.",
    disponivel: false,
    integradoAoDossie: false,
    href: "/painel/conciliacao-ecd",
  },
  {
    id: "auditoria-tributaria",
    rotulo: "Conciliação — Impostos Federais e Encargos",
    grupo: "Contábil",
    descricao: "Pagamentos de tributos federais e encargos trabalhistas confrontados com o declarado.",
    disponivel: false,
    integradoAoDossie: false,
    href: "/painel/auditoria-tributaria",
  },
  {
    id: "conciliacao-estadual",
    rotulo: "Conciliação — Impostos Estaduais",
    grupo: "Contábil",
    descricao: "GIAM × Razão: crédito, débito e saldo a recolher por competência.",
    disponivel: false,
    integradoAoDossie: false,
    href: "/painel/conciliacao-estadual",
  },
  {
    id: "razao-contrapartida",
    rotulo: "Razão / Contrapartida",
    grupo: "Contábil",
    descricao: "Razão da ECD transmitida, com a contrapartida de cada lançamento.",
    disponivel: false,
    integradoAoDossie: false,
    href: "/painel/razao-contrapartida",
  },

  // ---------------- Auditoria ----------------
  {
    id: "analise-demonstracoes",
    rotulo: "Análise das Demonstrações Contábeis",
    grupo: "Auditoria",
    descricao: "Indicadores contábeis e leitura técnica das demonstrações do exercício.",
    disponivel: false,
    integradoAoDossie: false,
    href: "/painel/relatorios",
  },
  {
    id: "valuation",
    rotulo: "Valuation",
    grupo: "Auditoria",
    descricao: "Avaliação econômico-financeira da empresa.",
    disponivel: false,
    integradoAoDossie: false,
    href: "/painel/valuation",
  },
];

export const GRUPOS_MODULO: GrupoModulo[] = ["Fiscal", "Contábil", "Auditoria"];

export function modulosPorGrupo(grupo: GrupoModulo): ModuloRelatorio[] {
  return CATALOGO_RELATORIOS.filter((m) => m.grupo === grupo);
}

export function moduloPorId(id: string): ModuloRelatorio | undefined {
  return CATALOGO_RELATORIOS.find((m) => m.id === id);
}

export function modulosDisponiveis(): ModuloRelatorio[] {
  return CATALOGO_RELATORIOS.filter((m) => m.disponivel);
}
