/**
 * Parser heurístico: mapeia linhas de texto de um Balanço/DRE para as chaves
 * canônicas. Determinístico e auditável — cada valor extraído carrega o
 * trecho de origem para conferência humana. Nunca grava sem revisão.
 */

import { parseNumero } from "../import";
import type { Maybe } from "../accounting/types";

export interface CampoExtraido {
  valor: Maybe;
  trecho: string;
  confianca: "alta" | "media";
}

export interface ResultadoExtracao {
  ano: number | null;
  campos: Record<string, CampoExtraido>;
  linhas: string[];
}

type Secao = "ativo_circ" | "ativo_ncirc" | "passivo_circ" | "passivo_ncirc" | "pl" | "dre" | null;

function normalizar(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Extrai todos os números monetários de uma linha, na ordem da esquerda p/ direita. */
function numerosNaLinha(linha: string): Maybe[] {
  const tokens = linha.match(/\(?\s*-?\s*\d[\d.]*(?:,\d{1,2})?\s*\)?/g) ?? [];
  const vals: Maybe[] = [];
  for (const t of tokens) {
    const neg = /\(.*\)/.test(t);
    const limpo = t.replace(/[()\s]/g, "");
    // Ignora tokens curtos sem separador (provável numeração de conta, ex.: "1.1").
    if (!/[,]/.test(limpo) && limpo.replace(/\./g, "").length < 3) continue;
    let v = parseNumero(limpo);
    if (v !== null && neg) v = -Math.abs(v);
    if (v !== null) vals.push(v);
  }
  return vals;
}

/** Escolhe o valor do saldo: o mais à direita (saldo atual / coluna corrente). */
function valorSaldo(linha: string): Maybe {
  const vals = numerosNaLinha(linha);
  if (vals.length === 0) return null;
  return vals[vals.length - 1];
}

interface Regra {
  chave: string;
  // padrões testados sobre a linha normalizada
  testar: (l: string, secao: Secao) => boolean;
}

const incl = (...termos: string[]) => (l: string) => termos.some((t) => l.includes(t));

const REGRAS: Regra[] = [
  // ---- Ativo circulante ----
  { chave: "ac.caixaEquivalentes", testar: incl("caixa", "equivalentes de caixa", "disponibilidades", "disponivel") },
  { chave: "ac.contasReceber", testar: (l) => incl("clientes", "contas a receber", "duplicatas a receber", "creditos a receber")(l) },
  { chave: "ac.estoques", testar: (l) => l.includes("estoque") || (l.includes("mercadorias") && !l.includes("custo")) },
  { chave: "ac.tributosRecuperar", testar: incl("tributos a recuperar", "impostos a recuperar", "tributos a compensar", "icms a recuperar") },
  // ---- Ativo não circulante ----
  { chave: "anc.realizavelLongoPrazo", testar: incl("realizavel a longo prazo") },
  { chave: "anc.investimentos", testar: incl("investimentos") },
  { chave: "anc.imobilizado", testar: incl("imobilizado") },
  { chave: "anc.intangivel", testar: incl("intangivel") },
  // ---- Passivo circulante ----
  { chave: "pc.fornecedores", testar: incl("fornecedores") },
  { chave: "pc.obrigacoesTrabalhistas", testar: incl("salarios", "obrigacoes trabalhistas", "obrigacoes sociais", "provisao de ferias", "inss", "fgts", "encargos sociais") },
  { chave: "pc.obrigacoesTributarias", testar: incl("obrigacoes tributarias", "obrigacoes fiscais", "impostos a recolher", "tributos a recolher", "icms a recolher") },
  // ---- Patrimônio líquido ----
  { chave: "pl.capitalSocial", testar: incl("capital social", "capital realizado", "capital subscrito") },
  { chave: "pl.prejuizosAcumulados", testar: incl("prejuizos acumulados", "prejuizo acumulado") },
  { chave: "pl.lucrosAcumulados", testar: incl("lucros acumulados", "lucros ou prejuizos acumulados") },
  { chave: "pl.reservas", testar: incl("reservas", "reserva de lucros", "reserva legal") },
  // ---- DRE ----
  { chave: "dre.receitaBrutaVendas", testar: incl("receita bruta", "receita operacional bruta", "receita de vendas", "vendas brutas", "faturamento") },
  { chave: "dre.deducoes", testar: incl("deducoes", "impostos sobre vendas", "impostos incidentes", "devolucoes", "abatimentos") },
  { chave: "dre.custos", testar: incl("custo das mercadorias", "custo dos produtos", "custo dos servicos", "custo das vendas", "cmv", "cpv", "custo dos bens") },
  { chave: "dre.despesasFinanceiras", testar: incl("despesas financeiras") },
  { chave: "dre.receitasFinanceiras", testar: incl("receitas financeiras") },
  { chave: "dre.despesasOperacionais", testar: incl("despesas operacionais", "despesas administrativas", "despesas comerciais", "despesas com vendas", "despesas gerais") },
  { chave: "dre.tributosSobreLucro", testar: incl("irpj", "csll", "imposto de renda", "contribuicao social", "provisao para ir") },
  { chave: "dre.depreciacaoAmortizacao", testar: incl("depreciacao", "amortizacao", "exaustao") },
];

// Chaves roteadas por seção (empréstimos e "outros").
function regraSecao(l: string, secao: Secao): { chave: string } | null {
  const ehEmprestimo = incl("emprestimos", "financiamentos", "instituicoes financeiras", "emprestimos e financiamentos")(l);
  if (ehEmprestimo) {
    if (secao === "passivo_circ") return { chave: "pc.emprestimosFinanciamentos" };
    if (secao === "passivo_ncirc") return { chave: "pnc.emprestimosFinanciamentos" };
  }
  return null;
}

function detectarSecao(l: string): Secao {
  if (/total/.test(l)) return null; // linhas de total não trocam a seção
  if (l.includes("ativo circulante")) return "ativo_circ";
  if (l.includes("ativo nao circulante") || l.includes("ativo realizavel")) return "ativo_ncirc";
  if (l.includes("passivo circulante")) return "passivo_circ";
  if (l.includes("passivo nao circulante") || l.includes("passivo exigivel a longo")) return "passivo_ncirc";
  if (l.includes("patrimonio liquido")) return "pl";
  if (l.includes("demonstracao do resultado") || l.includes("receita") || l.includes("dre")) return "dre";
  return null;
}

function ehLinhaTotal(l: string): boolean {
  return /^(total|soma|subtotal|total do|total da|total de)\b/.test(l);
}

export function extrairDemonstrativos(linhas: string[]): ResultadoExtracao {
  const campos: Record<string, CampoExtraido> = {};
  let secao: Secao = null;
  let ano: number | null = null;

  for (const bruta of linhas) {
    const l = normalizar(bruta);
    if (!l) continue;

    // Detecta ano (31/12/AAAA ou "exercicio AAAA").
    const mAno = bruta.match(/\b(20\d{2}|19\d{2})\b/);
    if (mAno) {
      const a = Number(mAno[1]);
      // mantém o maior ano encontrado (exercício mais recente).
      if (a >= 1990 && a <= 2100 && (ano === null || a > ano)) ano = a;
    }

    const novaSecao = detectarSecao(l);
    if (novaSecao) secao = novaSecao;

    if (ehLinhaTotal(l)) continue; // não captura linhas de totalização

    const valor = valorSaldo(bruta);
    if (valor === null) continue; // linha sem valor monetário

    // 1) Regras por seção (empréstimos).
    const rs = regraSecao(l, secao);
    if (rs && !(rs.chave in campos)) {
      campos[rs.chave] = { valor, trecho: bruta.trim(), confianca: "media" };
      continue;
    }

    // 2) Regras específicas — primeira que casar e ainda não preenchida.
    for (const r of REGRAS) {
      if (r.chave in campos) continue;
      if (r.testar(l, secao)) {
        campos[r.chave] = { valor, trecho: bruta.trim(), confianca: "alta" };
        break;
      }
    }
  }

  return { ano, campos, linhas };
}
