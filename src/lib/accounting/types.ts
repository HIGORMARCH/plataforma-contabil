/**
 * Estrutura padronizada dos demonstrativos contábeis.
 *
 * Todos os valores monetários são números em Reais (R$). `null` significa
 * "informação não disponível" — o motor trata ausência de dado de forma
 * explícita, classificando indicadores dependentes como "inconclusivo".
 *
 * Convenção de sinais: todos os valores são informados em módulo (positivos),
 * exceto `prejuizosAcumulados`, que reduz o Patrimônio Líquido. O motor cuida
 * dos sinais ao montar os totais e os resultados.
 */

export type Maybe = number | null;

/** Grupo do Ativo Circulante. */
export interface AtivoCirculante {
  caixaEquivalentes: Maybe;
  contasReceber: Maybe; // duplicatas/clientes a receber
  estoques: Maybe;
  tributosRecuperar: Maybe;
  outros: Maybe;
}

/** Grupo do Ativo Não Circulante. */
export interface AtivoNaoCirculante {
  realizavelLongoPrazo: Maybe;
  investimentos: Maybe;
  imobilizado: Maybe;
  intangivel: Maybe;
  outros: Maybe;
}

/** Grupo do Passivo Circulante. */
export interface PassivoCirculante {
  fornecedores: Maybe;
  emprestimosFinanciamentos: Maybe;
  obrigacoesTrabalhistas: Maybe;
  obrigacoesTributarias: Maybe;
  outros: Maybe;
}

/** Grupo do Passivo Não Circulante. */
export interface PassivoNaoCirculante {
  emprestimosFinanciamentos: Maybe;
  outros: Maybe;
}

/** Patrimônio Líquido. */
export interface PatrimonioLiquido {
  capitalSocial: Maybe;
  reservas: Maybe;
  lucrosAcumulados: Maybe;
  /** Informe positivo; é subtraído do PL. */
  prejuizosAcumulados: Maybe;
  outros: Maybe;
}

/** Balanço Patrimonial de um exercício. */
export interface BalancoPatrimonial {
  ativoCirculante: AtivoCirculante;
  ativoNaoCirculante: AtivoNaoCirculante;
  passivoCirculante: PassivoCirculante;
  passivoNaoCirculante: PassivoNaoCirculante;
  patrimonioLiquido: PatrimonioLiquido;
  /**
   * Total do ativo informado no documento original (para conferência).
   * Se ausente, o motor usa o total calculado.
   */
  ativoTotalInformado?: Maybe;
}

/** Demonstração do Resultado do Exercício. */
export interface DRE {
  receitaBrutaVendas: Maybe;
  /** Devoluções, abatimentos e impostos sobre vendas. Informe positivo. */
  deducoes: Maybe;
  /** Custo dos produtos/mercadorias/serviços vendidos. Informe positivo. */
  custos: Maybe;
  despesasOperacionais: Maybe; // administrativas + comerciais + gerais
  despesasFinanceiras: Maybe;
  receitasFinanceiras: Maybe;
  outrasReceitasDespesas: Maybe; // saldo (positivo = receita líquida)
  /** IRPJ/CSLL. Informe positivo. */
  tributosSobreLucro: Maybe;
  /** Depreciação e amortização contidas nas despesas/custos (para EBITDA). */
  depreciacaoAmortizacao: Maybe;
  /** Resultado líquido informado no documento original (para conferência). */
  resultadoLiquidoInformado?: Maybe;
}

/** Demonstrativos de um único exercício (ano-base). */
export interface DemonstrativosExercicio {
  ano: number;
  balanco: BalancoPatrimonial;
  dre: DRE;
  /** Documentos efetivamente fornecidos para este exercício. */
  documentosFornecidos?: string[];
}

export type Classificacao = "saudavel" | "atencao" | "critico" | "inconclusivo";

export type Severidade = "info" | "atencao" | "critico";

/** Inconsistência detectada na validação contábil. */
export interface Inconsistencia {
  codigo: string;
  severidade: Severidade;
  titulo: string;
  descricao: string;
  /** true quando deve bloquear a emissão automática de conclusão. */
  bloqueia: boolean;
}

/** Resultado de um indicador calculado. */
export interface Indicador {
  chave: string;
  nome: string;
  categoria: "liquidez" | "endividamento" | "rentabilidade" | "atividade" | "estrutura";
  formula: string;
  valor: Maybe;
  /** Texto formatado pronto para exibição (ex.: "1,32" ou "18,4%"). */
  valorFormatado: string;
  unidade: "indice" | "percentual" | "dias" | "moeda";
  classificacao: Classificacao;
  interpretacao: string;
  recomendacao: string;
}
