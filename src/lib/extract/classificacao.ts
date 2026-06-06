/**
 * Parser para o formato "Balanço/Balancete por plano de contas" (padrão dos
 * sistemas contábeis brasileiros: linhas com CÓDIGO DE CLASSIFICAÇÃO, descrição,
 * valor e indicador D/C — devedor/credor).
 *
 * Estratégia (determinística e auditável):
 *  - lê cada conta como {codigo, descricao, valor, dc};
 *  - usa os TOTAIS SINTÉTICOS dos grupos (1.1, 1.2, 2.1, 2.2, 2.3) para garantir
 *    que o balanço FECHE, lançando o resíduo de cada grupo em "outros";
 *  - respeita o sinal contábil (D/C), tratando corretamente PL negativo
 *    (passivo a descoberto);
 *  - lê a DRE pelos subtotais rotulados.
 *
 * Nada é gravado sem conferência humana — cada valor traz o trecho de origem.
 */

import type { CampoExtraido, ResultadoExtracao } from "./heuristic";
import type { Maybe } from "../accounting/types";

interface Conta {
  codigo: string;
  segmentos: number;
  descNorm: string;
  bruta: string;
  /** Valor com sinal contábil já resolvido pelo lado (ativo/passivo) e D/C. */
  valor: number;
  /** Magnitude (sempre positiva). */
  mag: number;
  dc: "D" | "C" | null;
}

function normalizar(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function numero(s: string): number {
  return Number(s.replace(/\./g, "").replace(",", "."));
}

const RE_CONTA = /^(\d+)\s+(\d[\d.]*\d|\d)\s+(.+?)\s+([\d.]+,\d{2})\s*([DC])?\s*$/;

/** Detecta se o documento está no formato de plano de contas com código + D/C. */
export function ehFormatoClassificacao(linhas: string[]): boolean {
  let comCodigo = 0;
  for (const l of linhas) if (RE_CONTA.test(l.trim())) comCodigo++;
  return comCodigo >= 15;
}

/** Ano de referência: prioriza "encerrado em DD/MM/AAAA" / "exercício ... em 31/12/AAAA". */
export function detectarAnoReferencia(linhas: string[]): number | null {
  for (const l of linhas) {
    const m =
      l.match(/encerrad[oa]\s+em:?\s*\d{2}\/\d{2}\/(\d{4})/i) ||
      l.match(/exerc[ií]cio\s+em\s+\d{2}\/\d{2}\/(\d{4})/i) ||
      l.match(/compet[êe]ncia[:\s]+\d{2}\/(\d{4})/i);
    if (m) return Number(m[1]);
  }
  // fallback: maior 31/12/AAAA encontrado
  let melhor: number | null = null;
  for (const l of linhas) {
    const m = l.match(/31\/12\/(\d{4})/);
    if (m) {
      const a = Number(m[1]);
      if (melhor === null || a > melhor) melhor = a;
    }
  }
  return melhor;
}

function parseContas(linhas: string[]): Conta[] {
  const contas: Conta[] = [];
  for (const bruta of linhas) {
    const m = bruta.trim().match(RE_CONTA);
    if (!m) continue;
    const codigo = m[2];
    const descNorm = normalizar(m[3]);
    const mag = numero(m[4]);
    const dc = (m[5] as "D" | "C") ?? null;
    const lado = codigo[0]; // "1" ativo, "2" passivo/PL
    let valor = mag;
    if (lado === "1") valor = dc === "C" ? -mag : mag;
    else if (lado === "2") valor = dc === "D" ? -mag : mag;
    contas.push({ codigo, segmentos: codigo.split(".").length, descNorm, bruta: bruta.trim(), valor, mag, dc });
  }
  return contas;
}

/**
 * Localiza o TOTAL de um grupo pela descrição (robusto a planos de contas com
 * códigos diferentes — ex.: PL em "2.3" numa empresa e "2.4" em outra).
 * Prefere a conta mais sintética (menor código).
 */
function grupoPorDescricao(contas: Conta[], nomes: string[]): Conta | undefined {
  const cands = contas.filter((c) => nomes.some((n) => c.descNorm.startsWith(n)));
  cands.sort((a, b) => a.segmentos - b.segmentos || a.codigo.localeCompare(b.codigo));
  return cands[0];
}

/** Termos de cada conta de detalhe (independente do código do plano). */
const TERMOS_DETALHE: Record<string, string[]> = {
  "ac.caixaEquivalentes": ["disponibilidade", "disponivel", "caixa e equivalentes", "caixa", "bancos conta movimento"],
  "ac.contasReceber": ["clientes", "duplicatas a receber", "contas a receber"],
  "ac.tributosRecuperar": ["tributos a recuperar", "impostos a recuperar", "tributos a recuperar/compensar"],
  "ac.estoques": ["estoque", "estoques"],
  "anc.realizavelLongoPrazo": ["realizavel a longo prazo"],
  "anc.imobilizado": ["imobilizado"],
  "anc.intangivel": ["intangivel"],
  "anc.investimentos": ["investimentos"],
  "pc.fornecedores": ["fornecedores"],
  "pc.obrigacoesTributarias": ["obrigacoes tributarias", "obrigacoes fiscais", "impostos e contribuicoes a recolher", "impostos a recolher"],
  "pc.obrigacoesTrabalhistas": ["obrigacoes trabalhista", "obrigacoes sociais", "obrigacoes com o pessoal", "salarios"],
  "pl.capitalSocial": ["capital social", "capital subscrito"],
};

/** Verdadeiro se `cod` está hierarquicamente sob `prefixo` (comparação por segmentos). */
function sob(cod: string, prefixo: string): boolean {
  return cod === prefixo || cod.startsWith(prefixo + ".");
}

/**
 * Escolhe a melhor conta sob um grupo que satisfaz `pred`. Critério, em ordem:
 *  1) contas SINTÉTICAS (que possuem subcontas) — os subtotais reais;
 *  2) menos segmentos (mais agregada);
 *  3) maior saldo (evita subcontas zeradas);
 *  4) código.
 * Isso lida com planos que numeram subtotais como 1.1.1, 1.1.21.1 ou 2.3.10.101.
 */
function melhorConta(contas: Conta[], prefixoGrupo: string, pred: (c: Conta) => boolean): Conta | undefined {
  if (!prefixoGrupo) return undefined;
  const temFilho = (cod: string) => contas.some((o) => o.codigo !== cod && o.codigo.startsWith(cod + "."));
  const cands = contas.filter((c) => sob(c.codigo, prefixoGrupo) && c.codigo !== prefixoGrupo && pred(c));
  if (cands.length === 0) return undefined;
  cands.sort(
    (a, b) =>
      (temFilho(a.codigo) ? 0 : 1) - (temFilho(b.codigo) ? 0 : 1) ||
      a.segmentos - b.segmentos ||
      b.mag - a.mag ||
      a.codigo.localeCompare(b.codigo),
  );
  return cands[0];
}

function melhorDetalhe(contas: Conta[], prefixoGrupo: string, termos: string[]): Conta | undefined {
  return melhorConta(contas, prefixoGrupo, (c) => termos.some((t) => c.descNorm.includes(t)));
}

function valorDRErotulo(linhas: string[], inicioDRE: number, termos: string[]): { v: Maybe; trecho: string } {
  for (let i = inicioDRE; i < linhas.length; i++) {
    const norm = normalizar(linhas[i]);
    if (termos.some((t) => norm.startsWith(t))) {
      const nums = linhas[i].match(/[\d.]+,\d{2}/g);
      if (nums && nums.length) {
        return { v: numero(nums[nums.length - 1]), trecho: linhas[i].trim() };
      }
    }
  }
  return { v: null, trecho: "" };
}

/** Como valorDRErotulo, mas preserva o sinal: valores entre parênteses → negativos. */
function valorDRErotuloComSinal(linhas: string[], inicioDRE: number, termos: string[]): { v: Maybe; trecho: string } {
  for (let i = inicioDRE; i < linhas.length; i++) {
    const norm = normalizar(linhas[i]);
    if (termos.some((t) => norm.startsWith(t))) {
      const nums = linhas[i].match(/[\d.]+,\d{2}/g);
      if (nums && nums.length) {
        const neg = /\([^)]*[\d.]+,\d{2}[^)]*\)/.test(linhas[i]);
        const mag = numero(nums[nums.length - 1]);
        return { v: neg ? -mag : mag, trecho: linhas[i].trim() };
      }
    }
  }
  return { v: null, trecho: "" };
}

export function extrairPorClassificacao(linhas: string[]): ResultadoExtracao {
  const contas = parseContas(linhas);
  const campos: Record<string, CampoExtraido> = {};
  const set = (chave: string, valor: Maybe, trecho: string, confianca: CampoExtraido["confianca"] = "alta") => {
    if (valor === null) return;
    campos[chave] = { valor, trecho, confianca };
  };

  // ---- Totais dos grupos (localizados pela descrição) ----
  const gAC = grupoPorDescricao(contas, ["ativo circulante"]);
  const gANC = grupoPorDescricao(contas, ["ativo nao circulante", "ativo nao-circulante", "ativo realizavel a longo"]);
  const gPC = grupoPorDescricao(contas, ["passivo circulante"]);
  const gPNC = grupoPorDescricao(contas, ["passivo nao circulante", "passivo nao-circulante", "passivo exigivel a longo"]);
  const gPL = grupoPorDescricao(contas, ["patrimonio liquido"]);

  // ---- Detalhes, roteados pelo prefixo do código de cada grupo ----
  const detalhe: Record<string, Conta | undefined> = {};
  const aplicarDetalhes = (campos2: string[], grupo: Conta | undefined) => {
    for (const campo of campos2) {
      const c = melhorDetalhe(contas, grupo?.codigo ?? "", TERMOS_DETALHE[campo]);
      if (c) {
        detalhe[campo] = c;
        set(campo, c.mag, c.bruta);
      }
    }
  };
  aplicarDetalhes(["ac.caixaEquivalentes", "ac.contasReceber", "ac.tributosRecuperar", "ac.estoques"], gAC);
  aplicarDetalhes(["anc.realizavelLongoPrazo", "anc.imobilizado", "anc.intangivel", "anc.investimentos"], gANC);
  aplicarDetalhes(["pc.fornecedores", "pc.obrigacoesTributarias", "pc.obrigacoesTrabalhistas"], gPC);
  aplicarDetalhes(["pl.capitalSocial"], gPL);

  // Empréstimos: roteados pelo prefixo do passivo circulante / não circulante.
  const ehEmp = (c: Conta) => /emprestimos|financiamentos|instituicoes financeiras/.test(c.descNorm);
  const empPC = gPC ? melhorConta(contas, gPC.codigo, ehEmp) : undefined;
  const empPNC = gPNC ? melhorConta(contas, gPNC.codigo, ehEmp) : undefined;
  if (empPC) set("pc.emprestimosFinanciamentos", empPC.mag, empPC.bruta);
  if (empPNC) set("pnc.emprestimosFinanciamentos", empPNC.mag, empPNC.bruta);

  // ---- Resíduo em "outros" para FECHAR cada grupo ----
  const soma = (...cs: (Conta | undefined)[]) =>
    cs.reduce((acc, c) => acc + (c ? c.mag : 0), 0);

  if (gAC) {
    const detAC = soma(detalhe["ac.caixaEquivalentes"], detalhe["ac.contasReceber"], detalhe["ac.tributosRecuperar"], detalhe["ac.estoques"]);
    const resid = gAC.valor - detAC;
    if (Math.abs(resid) > 0.005) set("ac.outros", resid, `Resíduo p/ fechar ${gAC.bruta}`, "media");
  }
  if (gANC) {
    const detANC = soma(detalhe["anc.realizavelLongoPrazo"], detalhe["anc.imobilizado"], detalhe["anc.intangivel"], detalhe["anc.investimentos"]);
    const resid = gANC.valor - detANC;
    if (Math.abs(resid) > 0.005) set("anc.outros", resid, `Resíduo p/ fechar ${gANC.bruta}`, "media");
  }
  if (gPC) {
    const detPC = soma(detalhe["pc.fornecedores"], detalhe["pc.obrigacoesTributarias"], detalhe["pc.obrigacoesTrabalhistas"]) + (empPC ? empPC.mag : 0);
    const resid = gPC.valor - detPC;
    if (Math.abs(resid) > 0.005) set("pc.outros", resid, `Resíduo p/ fechar ${gPC.bruta}`, "media");
  }
  if (gPNC) {
    const resid = gPNC.valor - (empPNC ? empPNC.mag : 0);
    if (Math.abs(resid) > 0.005) set("pnc.outros", resid, `Resíduo p/ fechar ${gPNC.bruta}`, "media");
  }

  // ---- Patrimônio Líquido (respeita sinal: D = negativo) ----
  if (gPL) {
    const capital = detalhe["pl.capitalSocial"]?.mag ?? 0;
    // plug de lucros/prejuízos para o PL fechar com o total do grupo (com sinal).
    const plug = gPL.valor - capital;
    if (plug >= 0) {
      set("pl.lucrosAcumulados", plug, `Ajuste p/ PL = ${gPL.bruta}`, "media");
    } else {
      set("pl.prejuizosAcumulados", -plug, `Passivo a descoberto — PL = ${gPL.bruta}`, "media");
    }
  }

  // ---- DRE ----
  const inicioDRE = linhas.findIndex((l) => /demonstra[çc][ãa]o do resultado/i.test(l));
  if (inicioDRE >= 0) {
    const rb = valorDRErotulo(linhas, inicioDRE, ["receita bruta", "receita operacional bruta", "receita de vendas"]);
    const recLiq = valorDRErotulo(linhas, inicioDRE, ["receita liquida", "receita operacional liquida"]);
    const lucroBruto = valorDRErotulo(linhas, inicioDRE, ["lucro bruto", "resultado bruto", "prejuizo bruto"]);
    const dfin = valorDRErotulo(linhas, inicioDRE, ["despesas financeiras"]);
    const rfin = valorDRErotulo(linhas, inicioDRE, ["receitas financeiras"]);
    const outras = valorDRErotuloComSinal(linhas, inicioDRE, [
      "outras receitas operacionais",
      "outras receitas e despesas operacionais",
      "outras receitas e despesas",
    ]);
    const resInfo = valorDRErotuloComSinal(linhas, inicioDRE, [
      "lucro liquido do exercicio",
      "prejuizo liquido do exercicio",
      "resultado liquido do exercicio",
      "(=) resultado liquido",
      "prejuizo do exercicio",
      "resultado do exercicio",
    ]);

    if (rb.v !== null && recLiq.v !== null && lucroBruto.v !== null && resInfo.v !== null) {
      // ESTRATÉGIA ROBUSTA: ancora nos subtotais declarados e deriva os
      // componentes, de modo que o resultado feche com o LUCRO LÍQUIDO do
      // documento — independente de como cada plano nomeia as despesas.
      set("dre.receitaBrutaVendas", rb.v, rb.trecho);
      const ded = rb.v - recLiq.v;
      if (ded > 0.005) set("dre.deducoes", ded, `Receita bruta − líquida (${recLiq.trecho})`, "media");
      const cus = recLiq.v - lucroBruto.v;
      if (cus > 0.005) set("dre.custos", cus, `Receita líquida − lucro bruto (${lucroBruto.trecho})`, "media");
      if (rfin.v !== null) set("dre.receitasFinanceiras", rfin.v, rfin.trecho);
      if (dfin.v !== null) set("dre.despesasFinanceiras", dfin.v, dfin.trecho);
      if (outras.v !== null) set("dre.outrasReceitasDespesas", outras.v, outras.trecho);
      // Despesas operacionais = total apurado para o resultado bater com o declarado:
      // resultadoLíquido = lucroBruto − despOp + outras + recFin − despFin.
      const despOp = lucroBruto.v + (outras.v ?? 0) + (rfin.v ?? 0) - (dfin.v ?? 0) - resInfo.v;
      if (Math.abs(despOp) > 0.005) set("dre.despesasOperacionais", despOp, `Despesas apuradas p/ resultado = ${resInfo.trecho}`, "media");
      set("dre.resultadoLiquidoInformado", resInfo.v, resInfo.trecho, "media");
    } else {
      // FALLBACK: captura por componentes (DREs sem todos os subtotais).
      set("dre.receitaBrutaVendas", rb.v, rb.trecho);
      const ded = valorDRErotulo(linhas, inicioDRE, ["deducoes", "(-) deducoes", "impostos sobre"]);
      set("dre.deducoes", ded.v, ded.trecho);
      const cus = valorDRErotulo(linhas, inicioDRE, ["cmv", "custo das mercadorias", "custo dos produtos", "custo dos servicos", "custos"]);
      set("dre.custos", cus.v, cus.trecho);
      const dop = valorDRErotulo(linhas, inicioDRE, ["despesas operacionais"]);
      set("dre.despesasOperacionais", dop.v, dop.trecho);
      if (dfin.v !== null) set("dre.despesasFinanceiras", dfin.v, dfin.trecho);
      if (rfin.v !== null) set("dre.receitasFinanceiras", rfin.v, rfin.trecho);
      if (outras.v !== null) set("dre.outrasReceitasDespesas", outras.v, outras.trecho);
      set("dre.resultadoLiquidoInformado", resInfo.v, resInfo.trecho, "media");
    }
  }

  return { ano: detectarAnoReferencia(linhas), campos, linhas };
}
