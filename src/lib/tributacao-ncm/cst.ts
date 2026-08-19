/**
 * Leitura dos CSTs de PIS/COFINS — o que cada código significa e o que ele diz
 * sobre direito a crédito.
 *
 * A base guarda o CST de entrada e o de saída de cada configuração. O CST de
 * ENTRADA é o que responde a pergunta prática do dia a dia: "comprando este
 * produto, eu me credito?".
 *
 * Os textos vêm da tabela oficial de CST (tabela 4.3.3 do SPED-Contribuições).
 * A derivação é mecânica — do código para o significado. O que este módulo NÃO
 * faz é opinar sobre o caso concreto: aproveitamento de crédito depende do
 * regime da empresa (o não cumulativo credita, o cumulativo não) e da
 * destinação do item. Por isso a tela mostra o vínculo do CST e deixa a decisão
 * com o contador.
 */

export interface LeituraCst {
  codigo: string;
  descricao: string;
  /** true = o CST de entrada é de operação COM direito a crédito. */
  geraCredito: boolean;
  /** Frase curta pra tela. */
  vinculo: string;
}

const CST_ENTRADA: Record<string, LeituraCst> = {
  "50": {
    codigo: "50",
    descricao: "Operação com direito a crédito — vinculada exclusivamente a receita tributada no mercado interno",
    geraCredito: true,
    vinculo: "Gera crédito (receita tributada no mercado interno)",
  },
  "51": {
    codigo: "51",
    descricao: "Operação com direito a crédito — vinculada exclusivamente a receita não tributada no mercado interno",
    geraCredito: true,
    vinculo: "Gera crédito (receita não tributada no mercado interno)",
  },
  "52": {
    codigo: "52",
    descricao: "Operação com direito a crédito — vinculada exclusivamente a receita de exportação",
    geraCredito: true,
    vinculo: "Gera crédito (receita de exportação)",
  },
  "70": {
    codigo: "70",
    descricao: "Operação de aquisição sem direito a crédito",
    geraCredito: false,
    vinculo: "Não gera crédito",
  },
  "71": {
    codigo: "71",
    descricao: "Operação de aquisição com isenção",
    geraCredito: false,
    vinculo: "Não gera crédito — aquisição isenta",
  },
  "72": {
    codigo: "72",
    descricao: "Operação de aquisição com suspensão",
    geraCredito: false,
    vinculo: "Não gera crédito — aquisição com suspensão",
  },
  "73": {
    codigo: "73",
    descricao: "Operação de aquisição a alíquota zero",
    geraCredito: false,
    vinculo: "Não gera crédito — aquisição a alíquota zero",
  },
  "74": {
    codigo: "74",
    descricao: "Operação de aquisição sem incidência da contribuição",
    geraCredito: false,
    vinculo: "Não gera crédito — sem incidência",
  },
  "75": {
    codigo: "75",
    descricao: "Operação de aquisição por substituição tributária",
    geraCredito: false,
    vinculo: "Não gera crédito — substituição tributária",
  },
};

const CST_SAIDA: Record<string, string> = {
  "1": "Operação tributável com alíquota básica",
  "2": "Operação tributável com alíquota diferenciada",
  "3": "Operação tributável por unidade de medida de produto",
  "4": "Operação tributável monofásica — revenda a alíquota zero",
  "5": "Operação tributável por substituição tributária",
  "6": "Operação tributável a alíquota zero",
  "7": "Operação isenta da contribuição",
  "8": "Operação sem incidência da contribuição",
  "9": "Operação com suspensão da contribuição",
};

export function lerCstEntrada(cst: string): LeituraCst | null {
  return CST_ENTRADA[cst.replace(/^0+/, "") || cst] ?? CST_ENTRADA[cst] ?? null;
}

export function lerCstSaida(cst: string): string | null {
  return CST_SAIDA[cst.replace(/^0+/, "") || cst] ?? CST_SAIDA[cst] ?? null;
}
