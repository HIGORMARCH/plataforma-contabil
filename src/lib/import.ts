/**
 * Mapeamento das contas para a estrutura padronizada e importação de
 * planilhas (CSV/Excel) no formato "chave;valor".
 *
 * As chaves canônicas espelham os campos de DemonstrativosExercicio e também
 * servem aos formulários manuais (atributo name dos inputs).
 */

import * as XLSX from "xlsx";
import type { DemonstrativosExercicio, Maybe } from "./accounting/types";

export interface DefCampo {
  chave: string; // ex.: "ac.caixaEquivalentes"
  rotulo: string;
  grupo: string;
}

export const CAMPOS_BALANCO: DefCampo[] = [
  // Ativo circulante
  { chave: "ac.caixaEquivalentes", rotulo: "Caixa e equivalentes", grupo: "Ativo Circulante" },
  { chave: "ac.contasReceber", rotulo: "Contas a receber (clientes)", grupo: "Ativo Circulante" },
  { chave: "ac.estoques", rotulo: "Estoques", grupo: "Ativo Circulante" },
  { chave: "ac.tributosRecuperar", rotulo: "Tributos a recuperar", grupo: "Ativo Circulante" },
  { chave: "ac.outros", rotulo: "Outros (circulante)", grupo: "Ativo Circulante" },
  // Ativo não circulante
  { chave: "anc.realizavelLongoPrazo", rotulo: "Realizável a longo prazo", grupo: "Ativo Não Circulante" },
  { chave: "anc.investimentos", rotulo: "Investimentos", grupo: "Ativo Não Circulante" },
  { chave: "anc.imobilizado", rotulo: "Imobilizado", grupo: "Ativo Não Circulante" },
  { chave: "anc.intangivel", rotulo: "Intangível", grupo: "Ativo Não Circulante" },
  { chave: "anc.outros", rotulo: "Outros (não circulante)", grupo: "Ativo Não Circulante" },
  // Passivo circulante
  { chave: "pc.fornecedores", rotulo: "Fornecedores", grupo: "Passivo Circulante" },
  { chave: "pc.emprestimosFinanciamentos", rotulo: "Empréstimos e financiamentos (CP)", grupo: "Passivo Circulante" },
  { chave: "pc.obrigacoesTrabalhistas", rotulo: "Obrigações trabalhistas", grupo: "Passivo Circulante" },
  { chave: "pc.obrigacoesTributarias", rotulo: "Obrigações tributárias", grupo: "Passivo Circulante" },
  { chave: "pc.outros", rotulo: "Outros (circulante)", grupo: "Passivo Circulante" },
  // Passivo não circulante
  { chave: "pnc.emprestimosFinanciamentos", rotulo: "Empréstimos e financiamentos (LP)", grupo: "Passivo Não Circulante" },
  { chave: "pnc.outros", rotulo: "Outros (não circulante)", grupo: "Passivo Não Circulante" },
  // PL
  { chave: "pl.capitalSocial", rotulo: "Capital social", grupo: "Patrimônio Líquido" },
  { chave: "pl.reservas", rotulo: "Reservas", grupo: "Patrimônio Líquido" },
  { chave: "pl.lucrosAcumulados", rotulo: "Lucros acumulados", grupo: "Patrimônio Líquido" },
  { chave: "pl.prejuizosAcumulados", rotulo: "Prejuízos acumulados (informe positivo)", grupo: "Patrimônio Líquido" },
  { chave: "pl.outros", rotulo: "Outros (PL)", grupo: "Patrimônio Líquido" },
];

export const CAMPOS_DRE: DefCampo[] = [
  { chave: "dre.receitaBrutaVendas", rotulo: "Receita bruta de vendas", grupo: "DRE" },
  { chave: "dre.deducoes", rotulo: "Deduções (impostos/devoluções)", grupo: "DRE" },
  { chave: "dre.custos", rotulo: "Custos (CMV/CSV)", grupo: "DRE" },
  { chave: "dre.despesasOperacionais", rotulo: "Despesas operacionais", grupo: "DRE" },
  { chave: "dre.despesasFinanceiras", rotulo: "Despesas financeiras", grupo: "DRE" },
  { chave: "dre.receitasFinanceiras", rotulo: "Receitas financeiras", grupo: "DRE" },
  { chave: "dre.outrasReceitasDespesas", rotulo: "Outras receitas/despesas (saldo)", grupo: "DRE" },
  { chave: "dre.tributosSobreLucro", rotulo: "Tributos sobre o lucro (IRPJ/CSLL)", grupo: "DRE" },
  { chave: "dre.depreciacaoAmortizacao", rotulo: "Depreciação e amortização", grupo: "DRE" },
];

export const TODOS_CAMPOS = [...CAMPOS_BALANCO, ...CAMPOS_DRE];

/** Converte texto numérico em pt-BR ("1.234,56") ou en ("1234.56") para número. */
export function parseNumero(v: unknown): Maybe {
  if (v == null || v === "") return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  let s = String(v).trim().replace(/[R$\s]/g, "");
  if (s === "") return null;
  // Se tem vírgula e ponto, assume ponto como milhar e vírgula como decimal.
  if (s.includes(",") && s.includes(".")) s = s.replace(/\./g, "").replace(",", ".");
  else if (s.includes(",")) s = s.replace(",", ".");
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/** Monta DemonstrativosExercicio a partir de um mapa chave→valor. */
export function montarExercicio(ano: number, mapa: Record<string, Maybe>, documentos: string[] = []): DemonstrativosExercicio {
  const g = (k: string): Maybe => (k in mapa ? mapa[k] : null);
  return {
    ano,
    documentosFornecidos: documentos,
    balanco: {
      ativoCirculante: {
        caixaEquivalentes: g("ac.caixaEquivalentes"),
        contasReceber: g("ac.contasReceber"),
        estoques: g("ac.estoques"),
        tributosRecuperar: g("ac.tributosRecuperar"),
        outros: g("ac.outros"),
      },
      ativoNaoCirculante: {
        realizavelLongoPrazo: g("anc.realizavelLongoPrazo"),
        investimentos: g("anc.investimentos"),
        imobilizado: g("anc.imobilizado"),
        intangivel: g("anc.intangivel"),
        outros: g("anc.outros"),
      },
      passivoCirculante: {
        fornecedores: g("pc.fornecedores"),
        emprestimosFinanciamentos: g("pc.emprestimosFinanciamentos"),
        obrigacoesTrabalhistas: g("pc.obrigacoesTrabalhistas"),
        obrigacoesTributarias: g("pc.obrigacoesTributarias"),
        outros: g("pc.outros"),
      },
      passivoNaoCirculante: {
        emprestimosFinanciamentos: g("pnc.emprestimosFinanciamentos"),
        outros: g("pnc.outros"),
      },
      patrimonioLiquido: {
        capitalSocial: g("pl.capitalSocial"),
        reservas: g("pl.reservas"),
        lucrosAcumulados: g("pl.lucrosAcumulados"),
        prejuizosAcumulados: g("pl.prejuizosAcumulados"),
        outros: g("pl.outros"),
      },
    },
    dre: {
      receitaBrutaVendas: g("dre.receitaBrutaVendas"),
      deducoes: g("dre.deducoes"),
      custos: g("dre.custos"),
      despesasOperacionais: g("dre.despesasOperacionais"),
      despesasFinanceiras: g("dre.despesasFinanceiras"),
      receitasFinanceiras: g("dre.receitasFinanceiras"),
      outrasReceitasDespesas: g("dre.outrasReceitasDespesas"),
      tributosSobreLucro: g("dre.tributosSobreLucro"),
      depreciacaoAmortizacao: g("dre.depreciacaoAmortizacao"),
      resultadoLiquidoInformado: g("dre.resultadoLiquidoInformado"),
    },
  };
}

/**
 * Lê um arquivo (CSV/XLS/XLSX) com colunas [chave, valor] e retorna o mapa.
 * Aceita também a primeira linha como cabeçalho.
 */
export function lerPlanilha(buffer: ArrayBuffer): Record<string, Maybe> {
  const wb = XLSX.read(buffer, { type: "array" });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const linhas = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1 });
  const chavesValidas = new Set(TODOS_CAMPOS.map((c) => c.chave));
  const mapa: Record<string, Maybe> = {};
  for (const linha of linhas) {
    if (!Array.isArray(linha) || linha.length < 2) continue;
    const chave = String(linha[0] ?? "").trim();
    if (!chavesValidas.has(chave)) continue;
    mapa[chave] = parseNumero(linha[1]);
  }
  return mapa;
}

/** Achata um exercício para o mapa chave→valor (preenchimento de formulário). */
export function achatarExercicio(ex: DemonstrativosExercicio): Record<string, Maybe> {
  const b = ex.balanco;
  const d = ex.dre;
  return {
    "ac.caixaEquivalentes": b.ativoCirculante.caixaEquivalentes,
    "ac.contasReceber": b.ativoCirculante.contasReceber,
    "ac.estoques": b.ativoCirculante.estoques,
    "ac.tributosRecuperar": b.ativoCirculante.tributosRecuperar,
    "ac.outros": b.ativoCirculante.outros,
    "anc.realizavelLongoPrazo": b.ativoNaoCirculante.realizavelLongoPrazo,
    "anc.investimentos": b.ativoNaoCirculante.investimentos,
    "anc.imobilizado": b.ativoNaoCirculante.imobilizado,
    "anc.intangivel": b.ativoNaoCirculante.intangivel,
    "anc.outros": b.ativoNaoCirculante.outros,
    "pc.fornecedores": b.passivoCirculante.fornecedores,
    "pc.emprestimosFinanciamentos": b.passivoCirculante.emprestimosFinanciamentos,
    "pc.obrigacoesTrabalhistas": b.passivoCirculante.obrigacoesTrabalhistas,
    "pc.obrigacoesTributarias": b.passivoCirculante.obrigacoesTributarias,
    "pc.outros": b.passivoCirculante.outros,
    "pnc.emprestimosFinanciamentos": b.passivoNaoCirculante.emprestimosFinanciamentos,
    "pnc.outros": b.passivoNaoCirculante.outros,
    "pl.capitalSocial": b.patrimonioLiquido.capitalSocial,
    "pl.reservas": b.patrimonioLiquido.reservas,
    "pl.lucrosAcumulados": b.patrimonioLiquido.lucrosAcumulados,
    "pl.prejuizosAcumulados": b.patrimonioLiquido.prejuizosAcumulados,
    "pl.outros": b.patrimonioLiquido.outros,
    "dre.receitaBrutaVendas": d.receitaBrutaVendas,
    "dre.deducoes": d.deducoes,
    "dre.custos": d.custos,
    "dre.despesasOperacionais": d.despesasOperacionais,
    "dre.despesasFinanceiras": d.despesasFinanceiras,
    "dre.receitasFinanceiras": d.receitasFinanceiras,
    "dre.outrasReceitasDespesas": d.outrasReceitasDespesas,
    "dre.tributosSobreLucro": d.tributosSobreLucro,
    "dre.depreciacaoAmortizacao": d.depreciacaoAmortizacao,
  };
}

/** Gera o conteúdo CSV de modelo para download. */
export function modeloCSV(): string {
  const linhas = ["chave;valor"];
  for (const c of TODOS_CAMPOS) linhas.push(`${c.chave};`);
  return linhas.join("\n");
}
