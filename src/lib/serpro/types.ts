/**
 * Types derivados do response real de PAGAMENTOS71 (fixture 05/2026 MARCH).
 * Ver: C:\Users\higor\AppData\Local\Temp\pagtoweb_pagamentos71_MARCH_202605.json
 */

export type ReceitaCodigo = {
  codigo: string;
  descricao: string | null;
  extensaoReceita: {
    codigo: string;
    descricao: string;
  } | null;
};

export type TipoDocumento = {
  codigo: string; // "4" DARF, "5" DAS, ...
  descricao: string;
  descricaoAbreviada: string;
};

/** Desmembramento = uma sub-receita dentro de um documento composto. */
export type PagtowebDesmembramento = {
  sequencial: string;
  receitaPrincipal: ReceitaCodigo;
  periodoApuracao: string; // ISO
  dataVencimento: string;
  valorTotal: number;
  valorPrincipal: number;
  valorMulta: number | null;
  valorJuros: number | null;
  valorSaldoTotal: number | null;
  valorSaldoPrincipal: number | null;
  valorSaldoMulta: number | null;
  valorSaldoJuros: number | null;
  cib: string | null;
};

/** Documento de arrecadação retornado por PAGAMENTOS71. */
export type PagtowebDocumento = {
  numeroDocumento: string;
  tipo: TipoDocumento;
  periodoApuracao: string;
  dataArrecadacao: string;
  dataVencimento: string;
  receitaPrincipal: ReceitaCodigo;
  referencia: string | null;
  valorTotal: number;
  valorPrincipal: number;
  valorMulta: number | null;
  valorJuros: number | null;
  valorSaldoTotal: number | null;
  valorSaldoPrincipal: number | null;
  valorSaldoMulta: number | null;
  valorSaldoJuros: number | null;
  desmembramentos: PagtowebDesmembramento[] | null;
};

/** Tokens obtidos do /authenticate. */
export type SerproTokens = {
  accessToken: string;
  jwtToken: string;
  expiresAt: number; // epoch ms
};

/** Token de procurador (válido até meia-noite do dia seguinte). */
export type ProcuradorToken = {
  token: string;
  expiresAt: number; // epoch ms
};

/** Parâmetros de metodoAcesso do Cliente. */
export type MetodoAcessoEcac = "PROCURACAO_MARCH" | "CERTIFICADO_PROPRIO";
