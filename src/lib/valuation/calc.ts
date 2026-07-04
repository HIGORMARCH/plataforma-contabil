/**
 * Motor de valuation por MÚLTIPLOS DE MERCADO — determinístico.
 * A IA nunca gera número: este motor calcula tudo, a IA só redige em cima.
 *
 * Fluxo: receita (fiscal + comissão) -> lucro estimado -> faixas por múltiplo
 *        -> prêmio de intangíveis -> valor de referência + cenários.
 */

export interface ValuationInput {
  // identificação (para o parecer)
  razaoSocial: string;
  cnpj: string;
  setor: string;
  dataBase: string;
  // receita
  faturamentoFiscal: number; // faturamento do Simples (declarado)
  comissao: number; // intermediação / "outras receitas" contábeis (declarado)
  margemPct: number; // lucratividade líquida (%)
  // ativos e dívida
  imobilizado: number; // total do inventário (piso de valor)
  dividaLiquida: number; // dívida - caixa (0 se não informado)
  // múltiplos (faixa)
  multLucroMin: number;
  multLucroMax: number;
  multReceitaMin: number;
  multReceitaMax: number;
  // prêmio por intangíveis (%) — licenças, longevidade, carteira
  premioPct: number;
  // fatores qualitativos (texto para o parecer)
  anosMercado?: number;
  funcionarios?: number;
  observacoes?: string;
}

export interface Faixa {
  min: number;
  max: number;
}

export interface ValuationResult {
  receitaTotal: number;
  lucroEstimado: number;
  metodoLucro: Faixa;
  metodoReceita: Faixa;
  centralTecnico: number;
  piso: number;
  valor: { min: number; medio: number; max: number };
  cenarios: {
    pressao: Faixa;
    justo: Faixa;
    segurar: Faixa;
  };
}

const mid = (f: Faixa) => (f.min + f.max) / 2;

export function calcularValuation(i: ValuationInput): ValuationResult {
  const receitaTotal = (i.faturamentoFiscal || 0) + (i.comissao || 0);
  const lucroEstimado = receitaTotal * ((i.margemPct || 0) / 100);
  const divida = i.dividaLiquida || 0;

  const metodoLucro: Faixa = {
    min: lucroEstimado * i.multLucroMin,
    max: lucroEstimado * i.multLucroMax,
  };
  const metodoReceita: Faixa = {
    min: receitaTotal * i.multReceitaMin - divida,
    max: receitaTotal * i.multReceitaMax - divida,
  };

  // ponto central técnico = média dos pontos médios dos dois métodos
  let centralTecnico = (mid(metodoLucro) + mid(metodoReceita)) / 2;

  // piso: o valor não fica abaixo do imobilizado líquido
  const piso = i.imobilizado || 0;
  if (centralTecnico < piso) centralTecnico = piso;

  // prêmio de intangíveis
  const fator = 1 + (i.premioPct || 0) / 100;
  const medio = centralTecnico * fator;
  const valor = { min: medio * 0.9, medio, max: medio * 1.1 };

  // cenário decisório
  const cenarios = {
    pressao: { min: medio * 0.66, max: medio * 0.76 }, // venda sob pressão (múltiplo comprimido)
    justo: { min: valor.min, max: valor.max },
    segurar: { min: medio * 1.18, max: medio * 1.4 }, // retomada rumo à capacidade
  };

  return {
    receitaTotal,
    lucroEstimado,
    metodoLucro,
    metodoReceita,
    centralTecnico,
    piso,
    valor,
    cenarios,
  };
}

export const brl = (n: number) =>
  "R$ " + (n || 0).toLocaleString("pt-BR", { maximumFractionDigits: 0 });

export const INPUT_PADRAO: ValuationInput = {
  razaoSocial: "",
  cnpj: "",
  setor: "",
  dataBase: "Exercício " + "2025",
  faturamentoFiscal: 0,
  comissao: 0,
  margemPct: 19,
  imobilizado: 0,
  dividaLiquida: 0,
  multLucroMin: 3,
  multLucroMax: 5,
  multReceitaMin: 0.4,
  multReceitaMax: 0.8,
  premioPct: 30,
  anosMercado: undefined,
  funcionarios: undefined,
  observacoes: "",
};
