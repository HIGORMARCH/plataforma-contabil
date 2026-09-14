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
    let candidata = bruta.trim();
    // Alguns balancetes têm uma coluna textual à esquerda que repete o nome do grupo
    // (ex.: "CLIENTES 12 1.1.2 CLIENTES 0,00 ..."). Se a linha começa com letra mas
    // logo depois vem "num<sp>num.num..." (padrão de código de conta), corta o prefixo.
    if (!/^\d/.test(candidata)) {
      const idx = candidata.search(/\s\d+\s+\d[\d.]*\d?\s+/);
      if (idx > 0) candidata = candidata.slice(idx + 1);
    }
    const m = candidata.match(RE_CONTA);
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
  // Reservas de Capital (ex.: Adiantamento p/ Futuro Aumento de Capital)
  // aparecem em sintética própria no plano brasileiro (2.3.2 ou similar).
  // Sem essa entrada, o parser jogava as reservas dentro do plug de lucros
  // acumulados, gerando divergência falsa contra a ECD.
  "pl.reservas": ["reservas de capital", "reservas", "adiantamento p/fut", "adiantamento para futuro aumento", "adiantamento p/futuro"],
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

/** Soma as contas ANALÍTICAS (sem subcontas) sob um grupo cuja descrição casa. */
function somaFolhas(contas: Conta[], prefixoGrupo: string, re: RegExp): { valor: number; trecho: string } | null {
  const folhas = contas.filter(
    (c) =>
      sob(c.codigo, prefixoGrupo) &&
      c.codigo !== prefixoGrupo &&
      re.test(c.descNorm) &&
      !contas.some((o) => o.codigo !== c.codigo && o.codigo.startsWith(c.codigo + ".")),
  );
  if (folhas.length === 0) return null;
  const valor = Math.round(folhas.reduce((a, c) => a + c.valor, 0) * 100) / 100;
  return { valor, trecho: folhas.map((c) => c.bruta).join(" + ") };
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
        // Usa c.valor (com sinal contábil) — não c.mag. Assim, contas com
        // saldo invertido no plano de contas da origem (ex.: ativo com saldo
        // credor) chegam ao banco como negativas e a validação SALDO_INVERTIDO
        // aponta pro contador — mantém o princípio "importar fiel + apontar".
        set(campo, c.valor, c.bruta);
      }
    }
  };
  aplicarDetalhes(["ac.caixaEquivalentes", "ac.contasReceber", "ac.tributosRecuperar", "ac.estoques"], gAC);
  aplicarDetalhes(["anc.realizavelLongoPrazo", "anc.imobilizado", "anc.intangivel", "anc.investimentos"], gANC);
  aplicarDetalhes(["pc.fornecedores", "pc.obrigacoesTributarias", "pc.obrigacoesTrabalhistas"], gPC);
  aplicarDetalhes(["pl.capitalSocial", "pl.reservas"], gPL);

  // Empréstimos: roteados pelo prefixo do passivo circulante / não circulante.
  const ehEmp = (c: Conta) => /emprestimos|financiamentos|instituicoes financeiras/.test(c.descNorm);
  const empPC = gPC ? melhorConta(contas, gPC.codigo, ehEmp) : undefined;
  const empPNC = gPNC ? melhorConta(contas, gPNC.codigo, ehEmp) : undefined;
  if (empPC) set("pc.emprestimosFinanciamentos", empPC.valor, empPC.bruta);
  if (empPNC) set("pnc.emprestimosFinanciamentos", empPNC.valor, empPNC.bruta);

  // ---- Resíduo em "outros" para FECHAR cada grupo ----
  // Soma pelo VALOR (com sinal), não magnitude — assim contas invertidas não
  // inflam o total detalhado e jogam um resíduo artificial em "outros".
  const soma = (...cs: (Conta | undefined)[]) =>
    cs.reduce((acc, c) => acc + (c ? c.valor : 0), 0);

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
    const detPC = soma(detalhe["pc.fornecedores"], detalhe["pc.obrigacoesTributarias"], detalhe["pc.obrigacoesTrabalhistas"]) + (empPC ? empPC.valor : 0);
    const resid = gPC.valor - detPC;
    if (Math.abs(resid) > 0.005) set("pc.outros", resid, `Resíduo p/ fechar ${gPC.bruta}`, "media");
  }
  if (gPNC) {
    const resid = gPNC.valor - (empPNC ? empPNC.valor : 0);
    if (Math.abs(resid) > 0.005) set("pnc.outros", resid, `Resíduo p/ fechar ${gPNC.bruta}`, "media");
  }

  // ---- Patrimônio Líquido (respeita sinal: D = negativo) ----
  if (gPL) {
    const capital = detalhe["pl.capitalSocial"]?.valor ?? 0;
    // Subtrai também as Reservas quando existem em sintética própria — senão
    // o plug de lucros incorporaria erroneamente o saldo das reservas.
    const reservas = detalhe["pl.reservas"]?.valor ?? 0;
    // Resultado do exercício ainda no PL ("resultado do exercício em curso") —
    // em campo próprio, para a tela provar que é o mesmo da DRE.
    const resultado = somaFolhas(contas, gPL.codigo, /resultado do exercicio|lucro do exercicio|prejuizo do exercicio/);
    if (resultado && Math.abs(resultado.valor) > 0.005) set("pl.resultadoExercicio", resultado.valor, resultado.trecho);
    // Retiradas/distribuição antecipada de lucro reduzem o PL — vão em "Outros (PL)".
    const retiradas = somaFolhas(contas, gPL.codigo, /retirada de lucro|lucros distribuidos|distribuicao de lucro|dividendos/);
    if (retiradas && Math.abs(retiradas.valor) > 0.005) set("pl.outros", retiradas.valor, retiradas.trecho);
    // plug de lucros/prejuízos para o PL fechar com o total do grupo (com sinal).
    const plug =
      Math.round((gPL.valor - capital - reservas - (resultado?.valor ?? 0) - (retiradas?.valor ?? 0)) * 100) / 100;
    if (plug >= 0) {
      set("pl.lucrosAcumulados", plug, `Ajuste p/ PL = ${gPL.bruta}`, "media");
    } else {
      set("pl.prejuizosAcumulados", -plug, `Passivo a descoberto — PL = ${gPL.bruta}`, "media");
    }
  }

  // ---- DRE ----
  const inicioDRE = linhas.findIndex((l) => RE_TITULO_DRE.test(l));
  if (inicioDRE >= 0) Object.assign(campos, extrairDRE(linhas, inicioDRE));

  return { ano: detectarAnoReferencia(linhas), campos, linhas };
}

const RE_TITULO_DRE = /demonstra[çc][ãa]o d[oe] resultado/i;
const RE_TITULO_BALANCO = /balan[çc]o patrimonial/i;

/**
 * Documento que é SÓ a Demonstração do Resultado — a "D. R. E." impressa pelo
 * Domínio não traz código de conta, então não cai no parser por classificação.
 * Na heurística genérica ela sobrescrevia o balanço já importado: "VENDA DE
 * MERCADORIAS" virava estoque e "SALÁRIOS E ORDENADOS" virava obrigação
 * trabalhista. Um PDF de DRE só pode preencher campo de DRE.
 */
export function ehSoDemonstracaoResultado(linhas: string[]): boolean {
  return linhas.some((l) => RE_TITULO_DRE.test(l)) && !linhas.some((l) => RE_TITULO_BALANCO.test(l));
}

export function extrairDemonstracaoResultado(linhas: string[]): ResultadoExtracao {
  const inicio = linhas.findIndex((l) => RE_TITULO_DRE.test(l));
  return { ano: detectarAnoReferencia(linhas), campos: inicio >= 0 ? extrairDRE(linhas, inicio) : {}, linhas };
}

/** Descrição sem o marcador de sinal à esquerda — "(-) depreciações" → "depreciações". */
function semMarcador(norm: string): string {
  return norm.replace(/^\([-+=]\)\s*/, "");
}

/** Magnitude do último valor monetário da linha, ou null. */
function magnitude(linha: string): number | null {
  const nums = linha.match(/[\d.]+,\d{2}/g);
  return nums && nums.length ? numero(nums[nums.length - 1]) : null;
}

/**
 * IRPJ/CSLL: só procura DEPOIS da linha do LAIR — antes dela "contribuição
 * social" pode ser qualquer outra coisa. Se a primeira linha já traz os dois
 * tributos juntos ("PROVISÃO PARA IR E CSLL"), ela é o total; senão soma as linhas.
 */
function tributosSobreLucro(linhas: string[], aPartirDe: number): { v: Maybe; trecho: string } {
  const termos = ["provisao para", "imposto de renda", "irpj", "contribuicao social", "csll"];
  const achadas: { v: number; trecho: string; norm: string }[] = [];
  for (let i = aPartirDe; i < linhas.length; i++) {
    const norm = semMarcador(normalizar(linhas[i]));
    if (!termos.some((t) => norm.startsWith(t))) continue;
    const v = magnitude(linhas[i]);
    if (v !== null) achadas.push({ v, trecho: linhas[i].trim(), norm });
  }
  if (achadas.length === 0) return { v: null, trecho: "" };
  const primeira = achadas[0];
  const ehConjunta = /(imposto de renda|irpj|\bir\b)/.test(primeira.norm) && /(contribuicao social|csll|\bcs\b)/.test(primeira.norm);
  if (ehConjunta) return { v: primeira.v, trecho: primeira.trecho };
  return { v: achadas.reduce((a, x) => a + x.v, 0), trecho: achadas.map((x) => x.trecho).join(" + ") };
}

/**
 * Depreciação/amortização é informativa (EBITDA) — já está dentro das despesas.
 * Soma as linhas da DRE; se uma delas é o subtotal das demais, fica só ela.
 */
function depreciacaoAmortizacao(linhas: string[], inicioDRE: number): { v: Maybe; trecho: string } {
  const achadas: { v: number; trecho: string }[] = [];
  for (let i = inicioDRE; i < linhas.length; i++) {
    const norm = semMarcador(normalizar(linhas[i]));
    if (!/^(deprecia|amortiza|exaust)/.test(norm)) continue;
    const v = magnitude(linhas[i]);
    if (v !== null) achadas.push({ v, trecho: linhas[i].trim() });
  }
  if (achadas.length === 0) return { v: null, trecho: "" };
  const total = achadas.reduce((a, x) => a + x.v, 0);
  const subtotal = achadas.length > 1 ? achadas.find((x) => Math.abs(x.v - (total - x.v)) < 0.01) : undefined;
  if (subtotal) return { v: subtotal.v, trecho: subtotal.trecho };
  return { v: total, trecho: achadas.map((x) => x.trecho).join(" + ") };
}

function extrairDRE(linhas: string[], inicioDRE: number): Record<string, CampoExtraido> {
  const campos: Record<string, CampoExtraido> = {};
  const set = (chave: string, valor: Maybe, trecho: string, confianca: CampoExtraido["confianca"] = "alta") => {
    if (valor === null) return;
    campos[chave] = { valor: Math.round(valor * 100) / 100, trecho, confianca };
  };

  const rb = valorDRErotulo(linhas, inicioDRE, ["receita bruta", "receita operacional bruta", "receita de vendas"]);
  const dfin = valorDRErotulo(linhas, inicioDRE, ["despesas financeiras"]);
  const rfin = valorDRErotulo(linhas, inicioDRE, ["receitas financeiras"]);
  const outras = valorDRErotuloComSinal(linhas, inicioDRE, [
    "outras receitas operacionais",
    "outras receitas e despesas operacionais",
    "outras receitas e despesas",
    "outras despesas operacionais",
  ]);
  const resInfo = valorDRErotuloComSinal(linhas, inicioDRE, [
    "lucro liquido do exercicio",
    "prejuizo liquido do exercicio",
    "resultado liquido do exercicio",
    "(=) resultado liquido",
    "prejuizo do exercicio",
    "lucro do exercicio",
    "resultado do exercicio",
  ]);
  const lair = valorDRErotuloComSinal(linhas, inicioDRE, [
    "resultado antes do ir",
    "resultado antes dos tributos",
    "resultado antes do imposto",
    "lucro antes do ir",
    "lucro antes do imposto",
    "prejuizo antes do ir",
  ]);
  const idxLair = lair.v === null ? -1 : linhas.findIndex((l, i) => i >= inicioDRE && l.trim() === lair.trecho);
  const trib = idxLair >= 0 ? tributosSobreLucro(linhas, idxLair + 1) : { v: null, trecho: "" };
  const dep = depreciacaoAmortizacao(linhas, inicioDRE);

  if (lair.v !== null) set("dre.resultadoAntesTributos", lair.v, lair.trecho);
  if (trib.v !== null) set("dre.tributosSobreLucro", trib.v, trib.trecho);
  if (dep.v !== null) set("dre.depreciacaoAmortizacao", dep.v, dep.trecho, "media");

  // Importa FIEL: cada campo é a linha que o documento imprime. Nada é
  // deduzido de diferença entre subtotais — se as linhas não fecharem com o
  // resultado impresso, a validação DRE_DIVERGENTE aponta para o contador.
  const ded = valorDRErotulo(linhas, inicioDRE, ["deducoes", "(-) deducoes", "impostos sobre"]);
  const cus = valorDRErotulo(linhas, inicioDRE, ["cmv", "custo das mercadorias", "custo dos produtos", "custo dos servicos", "custo das vendas", "custos"]);
  const dop = valorDRErotulo(linhas, inicioDRE, ["despesas operacionais"]);

  set("dre.receitaBrutaVendas", rb.v, rb.trecho);
  set("dre.deducoes", ded.v, ded.trecho);
  set("dre.custos", cus.v, cus.trecho);
  set("dre.despesasOperacionais", dop.v, dop.trecho);
  set("dre.receitasFinanceiras", rfin.v, rfin.trecho);
  set("dre.despesasFinanceiras", dfin.v, dfin.trecho);
  set("dre.outrasReceitasDespesas", outras.v, outras.trecho);
  set("dre.resultadoLiquidoInformado", resInfo.v, resInfo.trecho);
  return campos;
}
