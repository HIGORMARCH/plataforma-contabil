/**
 * Parser do SPED-ECD (Escrituração Contábil Digital) — bloco J.
 *
 * A ECD é a fonte OFICIAL do balanço patrimonial e DRE de empresas do
 * Lucro Real e Presumido (Simples Nacional NÃO entrega ECD — vide
 * [[project-conciliacao-balanco-por-regime]]).
 *
 * Registros lidos:
 *  - J005: data de encerramento das demonstrações (uma ECD pode ter várias
 *          — trimestrais + anual). Selecionamos a que fecha em 31/12/AAAA.
 *  - J100: balanço patrimonial — uma linha por conta agregada, com nível
 *          hierárquico, indicador D/C e saldo final.
 *  - J150: DRE — uma linha por rubrica de resultado.
 *
 * Layout do J100 (posições, separador |):
 *   REG | COD_AGL | IND_COD (T/D) | NIVEL_AGL | COD_AGL_SUP | IND_GRP_BAL (A/P)
 *       | DESCR | VAL_INI | IND_DC_INI | VAL_FIN | IND_DC_FIN | NIRE
 *
 * Layout do J150:
 *   REG | NUM_ORD | COD_AGL | NIVEL_AGL | COD_AGL_SUP | IND_GRP_BAL
 *       | DESCR | VAL_CTA | IND_DC_CTA
 *
 * Encoding: ANSI/Latin1 (Windows-1252). O SPED usa CP1252, não UTF-8 —
 * ignoramos acentos ao normalizar descrições em vez de decodificar.
 */

import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import type { DemonstrativosExercicio, Maybe } from "../accounting/types";
import { montarExercicio } from "../import";
import { caminhoArquivo, copiarDeOrigem, type ClienteRef } from "../storage/filesystem";

export interface DemonstracaoEcd {
  /** data_ini no formato DDMMAAAA (SPED). */
  dataIni: string;
  /** data_fim no formato DDMMAAAA (SPED). */
  dataFim: string;
  anoFim: number;
  mesFim: number;
  diaFim: number;
  /** true quando cobre 01/01 a 31/12 do mesmo ano. */
  anual: boolean;
  /** contas do J100 dessa demonstração. */
  contasBP: ContaEcd[];
  /** rubricas do J150 dessa demonstração. */
  contasDRE: ContaEcd[];
}

export interface ContaEcd {
  codigo: string;
  indCod: "T" | "D"; // totalizadora (sintética) ou de detalhe (analítica)
  nivel: number;
  codigoSuperior: string;
  grupo: "A" | "P" | ""; // A=ativo, P=passivo (inclui PL). Vazio no J150.
  descricao: string;
  descNorm: string;
  valorInicial: number;
  dcInicial: "D" | "C" | "";
  valorFinal: number;
  dcFinal: "D" | "C" | "";
  /** valor final COM sinal contábil: negativo se D em passivo ou C em ativo. */
  valorFinalSinal: number;
}

/** Normaliza descrição pra comparação (sem acentos, sem caractere corrompido de CP1252). */
export function normalizar(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    // Caracteres não-ASCII (incluindo o "�" do CP1252 mal decodificado) viram
    // um marcador ".", pra tornar comparação estável. "PATRIM�NIO L�QUIDO"
    // vira "patrim.nio l.quido" e ainda casa por prefixo em "patrim".
    .replace(/[^\x20-\x7e]+/g, ".")
    .replace(/\s+/g, " ")
    .trim();
}

function num(s: string): number {
  if (!s) return 0;
  const n = Number(s.replace(/\./g, "").replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}

function parseData(ddmmaaaa: string): { dia: number; mes: number; ano: number } {
  return {
    dia: Number(ddmmaaaa.slice(0, 2)),
    mes: Number(ddmmaaaa.slice(2, 4)),
    ano: Number(ddmmaaaa.slice(4, 8)),
  };
}

/** Lê o arquivo ECD em Latin1 e devolve array de linhas cru. */
export function lerArquivoEcd(caminho: string): string[] {
  const buf = readFileSync(caminho);
  // SPED é ANSI/CP1252 mas Latin1 é aceitável — não usamos os caracteres
  // acentuados (comparação por descNorm ignora acento).
  return buf.toString("latin1").split(/\r?\n/);
}

function parseJ100(campos: string[]): ContaEcd | null {
  // |J100|COD_AGL|IND_COD|NIVEL_AGL|COD_AGL_SUP|IND_GRP_BAL|DESCR|VAL_INI|IND_DC_INI|VAL_FIN|IND_DC_FIN|NIRE|
  if (campos.length < 12) return null;
  const grupo = campos[6] as "A" | "P" | "";
  const dcFinal = (campos[11] ?? "") as "D" | "C" | "";
  const valorFinal = num(campos[10] ?? "");
  let valorFinalSinal = valorFinal;
  // Sinal contábil: ATIVO devedor = +, credor = -. PASSIVO/PL credor = +, devedor = -.
  if (grupo === "A" && dcFinal === "C") valorFinalSinal = -valorFinal;
  else if (grupo === "P" && dcFinal === "D") valorFinalSinal = -valorFinal;
  return {
    codigo: campos[2] ?? "",
    indCod: (campos[3] as "T" | "D") ?? "T",
    nivel: Number(campos[4] ?? "0"),
    codigoSuperior: campos[5] ?? "",
    grupo,
    descricao: campos[7] ?? "",
    descNorm: normalizar(campos[7] ?? ""),
    valorInicial: num(campos[8] ?? ""),
    dcInicial: (campos[9] ?? "") as "D" | "C" | "",
    valorFinal,
    dcFinal,
    valorFinalSinal,
  };
}

function parseJ150(campos: string[]): ContaEcd | null {
  // Layout atual do J150 (13 campos + delimitadores):
  // |J150|NUM_ORD|COD_AGL|IND_COD|NIVEL_AGL|COD_AGL_SUP|DESCR|VAL_CTA_INI|IND_DC_INI|VAL_CTA_FIN|IND_DC_FIN|NAT_SUB_CNT||
  //
  // Observação empírica com o SPED da Casa São Paulo: em cada trimestre, o
  // CAMPO 8 (VAL_CTA_INI) contém o valor do TRIMESTRE ANTERIOR (encadeamento)
  // e o CAMPO 10 (VAL_CTA_FIN) contém o valor DO próprio período. Para o J005
  // anual, CAMPO 8 vem zero e CAMPO 10 traz o total do ano. Portanto o valor
  // que interessa está sempre em CAMPO 10.
  if (campos.length < 11) return null;
  const valorFinal = num(campos[10] ?? "");
  const dcFinal = (campos[11] ?? "") as "D" | "C" | "";
  return {
    codigo: campos[3] ?? "",
    indCod: ((campos[4] ?? "T") as "T" | "D"),
    nivel: Number(campos[5] ?? "0"),
    codigoSuperior: campos[6] ?? "",
    grupo: "",
    descricao: campos[7] ?? "",
    descNorm: normalizar(campos[7] ?? ""),
    valorInicial: 0,
    dcInicial: "",
    valorFinal,
    dcFinal,
    // No J150 o sinal já é semântico (D=despesa, C=receita). Guardamos o valor
    // como magnitude — quem usa decide o sinal pela natureza da rubrica.
    valorFinalSinal: dcFinal === "D" ? -valorFinal : valorFinal,
  };
}

/**
 * Lê todas as demonstrações contidas num arquivo ECD.
 * Cada J005 abre uma nova demonstração; J100/J150 seguintes pertencem a ela.
 */
export function extrairDemonstracoes(linhas: string[]): DemonstracaoEcd[] {
  const demonstracoes: DemonstracaoEcd[] = [];
  let atual: DemonstracaoEcd | null = null;

  for (const linha of linhas) {
    if (!linha.startsWith("|")) continue;
    const campos = linha.split("|");
    const reg = campos[1];

    if (reg === "J005") {
      const dataIni = campos[2] ?? "";
      const dataFim = campos[3] ?? "";
      const { dia, mes, ano } = parseData(dataFim);
      const { dia: di, mes: mi, ano: ai } = parseData(dataIni);
      atual = {
        dataIni,
        dataFim,
        anoFim: ano,
        mesFim: mes,
        diaFim: dia,
        anual: di === 1 && mi === 1 && ai === ano && dia === 31 && mes === 12,
        contasBP: [],
        contasDRE: [],
      };
      demonstracoes.push(atual);
    } else if (reg === "J100" && atual) {
      const c = parseJ100(campos);
      if (c) atual.contasBP.push(c);
    } else if (reg === "J150" && atual) {
      const c = parseJ150(campos);
      if (c) atual.contasDRE.push(c);
    }
  }

  return demonstracoes;
}

// ---------------------------------------------------------------------------
// Mapeamento das contas ECD pros campos padronizados de DemonstrativosExercicio.
// ---------------------------------------------------------------------------

type CampoAlvo = keyof ReturnType<typeof mapaVazio>;

function mapaVazio() {
  return {
    "ac.caixaEquivalentes": null as Maybe,
    "ac.contasReceber": null as Maybe,
    "ac.estoques": null as Maybe,
    "ac.tributosRecuperar": null as Maybe,
    "ac.outros": null as Maybe,
    "anc.realizavelLongoPrazo": null as Maybe,
    "anc.investimentos": null as Maybe,
    "anc.imobilizado": null as Maybe,
    "anc.intangivel": null as Maybe,
    "anc.outros": null as Maybe,
    "pc.fornecedores": null as Maybe,
    "pc.emprestimosFinanciamentos": null as Maybe,
    "pc.obrigacoesTrabalhistas": null as Maybe,
    "pc.obrigacoesTributarias": null as Maybe,
    "pc.outros": null as Maybe,
    "pnc.emprestimosFinanciamentos": null as Maybe,
    "pnc.outros": null as Maybe,
    "pl.capitalSocial": null as Maybe,
    "pl.reservas": null as Maybe,
    "pl.lucrosAcumulados": null as Maybe,
    "pl.prejuizosAcumulados": null as Maybe,
    "pl.outros": null as Maybe,
    "dre.receitaBrutaVendas": null as Maybe,
    "dre.deducoes": null as Maybe,
    "dre.custos": null as Maybe,
    "dre.despesasOperacionais": null as Maybe,
    "dre.despesasFinanceiras": null as Maybe,
    "dre.receitasFinanceiras": null as Maybe,
    "dre.outrasReceitasDespesas": null as Maybe,
    "dre.tributosSobreLucro": null as Maybe,
    "dre.depreciacaoAmortizacao": null as Maybe,
    "dre.resultadoAntesTributos": null as Maybe,
    "dre.resultadoLiquidoInformado": null as Maybe,
  };
}

/** Retorna a conta sintética filha imediata que casa com algum dos termos. */
function acharSubgrupo(
  contas: ContaEcd[],
  paiCodigo: string,
  termos: string[],
): ContaEcd | undefined {
  // Filhos: contas com codigoSuperior == paiCodigo (nível +1).
  const filhos = contas.filter((c) => c.codigoSuperior === paiCodigo && c.indCod === "T");
  return filhos.find((c) => termos.some((t) => c.descNorm.includes(t)));
}

function acharGrupoRaiz(contas: ContaEcd[], termos: string[]): ContaEcd | undefined {
  // Grupos raiz do BP: ATIVO CIRCULANTE, ATIVO NÃO-CIRCULANTE, PASSIVO CIRCULANTE,
  // PASSIVO NÃO-CIRCULANTE, PATRIMÔNIO LÍQUIDO. Todos filhos diretos de ATIVO (nivel 1)
  // ou PASSIVO (nivel 1). Buscamos por descrição.
  return contas.find(
    (c) => c.indCod === "T" && c.nivel === 2 && termos.some((t) => c.descNorm.includes(t)),
  );
}

/** Devolve todas as contas sintéticas descendentes de um pai (BFS). */
function descendentesSinteticos(contas: ContaEcd[], paiCodigo: string): ContaEcd[] {
  const filhos: ContaEcd[] = [];
  const stack = [paiCodigo];
  const visitados = new Set<string>();
  while (stack.length > 0) {
    const cur = stack.pop()!;
    if (visitados.has(cur)) continue;
    visitados.add(cur);
    for (const c of contas) {
      if (c.codigoSuperior === cur) {
        if (c.indCod === "T") filhos.push(c);
        stack.push(c.codigo);
      }
    }
  }
  return filhos;
}

/**
 * Distribui os saldos do grupo raiz nos campos padronizados. Estratégia:
 *  1. Para cada regra específica, pega a conta sintética descendente MAIS
 *     AGREGADA (menor nível) cuja descrição casa com algum termo. Isso permite
 *     encontrar "TRIBUTOS A RECUPERAR" mesmo quando o SPED o coloca aninhado
 *     em "OUTROS CRÉDITOS".
 *  2. "outros" é calculado por resíduo — total do grupo raiz menos a soma dos
 *     campos específicos capturados — pra garantir que a soma dos campos
 *     retornados feche com o total oficial do grupo (mesmo padrão do parser
 *     de classificação — ver classificacao.ts).
 */
function distribuir(
  contas: ContaEcd[],
  grupoRaiz: ContaEcd | undefined,
  regras: Array<[keyof ReturnType<typeof mapaVazio>, string[]]>,
): Partial<ReturnType<typeof mapaVazio>> {
  const out: Partial<ReturnType<typeof mapaVazio>> = {};
  if (!grupoRaiz) return out;

  const candidatos = descendentesSinteticos(contas, grupoRaiz.codigo);
  let somaClassificados = 0;
  const codigosUsados = new Set<string>();

  const ehDescendenteDe = (c: ContaEcd, pais: Set<string>): boolean => {
    let atual = c.codigoSuperior;
    while (atual && atual !== grupoRaiz.codigo) {
      if (pais.has(atual)) return true;
      const pai = candidatos.find((x) => x.codigo === atual);
      if (!pai) return false;
      atual = pai.codigoSuperior;
    }
    return false;
  };

  for (const [campo, termos] of regras) {
    if (termos.length === 0) continue; // regra "outros" é resíduo, não busca direta
    const cands = candidatos
      // Exclui não só as próprias contas já usadas, mas também qualquer
      // descendente delas (evita capturar a mesma linha em 2 campos quando o
      // SPED tem "LUCROS OU PREJUÍZOS ACUMULADOS" no nível 3 e uma sub-conta
      // homônima no nível 4).
      .filter((c) => !codigosUsados.has(c.codigo) && !ehDescendenteDe(c, codigosUsados))
      .filter((c) => termos.some((t) => c.descNorm.includes(t)))
      .sort((a, b) => a.nivel - b.nivel || b.valorFinal - a.valorFinal);
    const escolhida = cands[0];
    if (escolhida) {
      out[campo] = escolhida.valorFinalSinal;
      somaClassificados += escolhida.valorFinalSinal;
      codigosUsados.add(escolhida.codigo);
    }
  }

  const chaveOutros = regras.find((r) => r[0].endsWith(".outros"))?.[0];
  if (chaveOutros) {
    const resid = grupoRaiz.valorFinalSinal - somaClassificados;
    if (Math.abs(resid) > 0.005) out[chaveOutros] = resid;
  }
  return out;
}

/** Extrai um DemonstrativosExercicio a partir de uma DemonstracaoEcd anual. */
export function demonstracaoParaExercicio(dem: DemonstracaoEcd): DemonstrativosExercicio {
  const mapa = mapaVazio();

  // ---- Balanço Patrimonial ----
  const gAC = acharGrupoRaiz(dem.contasBP, ["ativo circulante"]);
  const gANC = acharGrupoRaiz(dem.contasBP, ["ativo n.o", "ativo nao", "ativo realiz.vel a longo"]);
  const gPC = acharGrupoRaiz(dem.contasBP, ["passivo circulante"]);
  const gPNC = acharGrupoRaiz(dem.contasBP, ["passivo n.o", "passivo nao", "passivo exig", "exig.vel a longo"]);
  const gPL = acharGrupoRaiz(dem.contasBP, ["patrim.nio", "patrimonio l"]);

  Object.assign(
    mapa,
    distribuir(dem.contasBP, gAC, [
      ["ac.caixaEquivalentes", ["dispon", "caixa", "bancos", "aplica"]],
      ["ac.contasReceber", ["clientes", "duplicatas a receber", "contas a receber"]],
      ["ac.estoques", ["estoque", "mercadoria"]],
      ["ac.tributosRecuperar", ["tributos a recuperar", "impostos a recuperar", "tributos a compensar"]],
      ["ac.outros", []], // catch-all
    ]),
    distribuir(dem.contasBP, gANC, [
      ["anc.realizavelLongoPrazo", ["realiz.vel a longo", "realizavel a longo"]],
      ["anc.investimentos", ["investiment"]],
      ["anc.imobilizado", ["imobilizado"]],
      ["anc.intangivel", ["intang"]],
      ["anc.outros", []],
    ]),
    distribuir(dem.contasBP, gPC, [
      ["pc.fornecedores", ["fornecedor"]],
      ["pc.emprestimosFinanciamentos", ["emprestim", "financiam", "institui.oes financeiras"]],
      ["pc.obrigacoesTrabalhistas", ["trabalhist", "salari", "obriga.oes com o pessoal", "sociais", "inss", "fgts"]],
      ["pc.obrigacoesTributarias", ["tribut", "fiscai", "impostos a recolher"]],
      ["pc.outros", []],
    ]),
    distribuir(dem.contasBP, gPNC, [
      ["pnc.emprestimosFinanciamentos", ["emprestim", "financiam"]],
      ["pnc.outros", []],
    ]),
    distribuir(dem.contasBP, gPL, [
      ["pl.capitalSocial", ["capital social", "capital subscrit"]],
      ["pl.reservas", ["reserva"]],
      // Uma única regra pra "lucros ou prejuizos acumulados". O SPED usa esse
      // nome único no plano padrão — a distinção lucro/prejuízo é pelo SINAL
      // do saldo, não por conta separada. Post-processamento abaixo divide.
      ["pl.lucrosAcumulados", ["lucros ou preju", "lucros acumulad", "preju.zos acumulad", "prejuizos acumulad"]],
      ["pl.outros", []],
    ]),
  );

  // Post-processamento do PL: se "lucros" saiu negativo, é prejuízo acumulado
  // (informado positivo por convenção do tipos.ts — quem soma respeita o sinal).
  const lucros = mapa["pl.lucrosAcumulados"];
  if (lucros !== null && lucros < 0) {
    mapa["pl.prejuizosAcumulados"] = -lucros;
    mapa["pl.lucrosAcumulados"] = null;
  }

  // ---- DRE ----
  // No J150 as rubricas vêm na ordem "de cima pra baixo" da DRE. Nossa
  // heurística: procurar por descrição, guardar o valor absoluto (a
  // convenção de tipos.ts é magnitude positiva; sinal já é semântico).
  const dreRegras: Array<[keyof ReturnType<typeof mapaVazio>, string[]]> = [
    ["dre.receitaBrutaVendas", ["receita bruta", "receita operacional bruta", "receita de vendas"]],
    ["dre.deducoes", ["dedu", "impostos sobre venda", "impostos incident", "devolu"]],
    ["dre.custos", ["custo das mercadoria", "custo dos produto", "custo dos servico", "custo das venda", "cmv", "cpv"]],
    ["dre.despesasOperacionais", ["despesas operacionai", "despesas administrat", "despesas comerciai", "despesas com venda"]],
    ["dre.despesasFinanceiras", ["despesas financeira"]],
    ["dre.receitasFinanceiras", ["receitas financeira"]],
    ["dre.outrasReceitasDespesas", ["outras receitas", "outras despesas"]],
    ["dre.tributosSobreLucro", ["irpj", "csll", "imposto de renda", "contribui.ao social"]],
    ["dre.depreciacaoAmortizacao", ["deprecia", "amortiza"]],
    // Resultado ANTES DOS TRIBUTOS (LAIR — "Lucro Antes do IR"). Vem antes do
    // IRPJ/CSLL. Preserva sinal (D=negativo, C=positivo).
    ["dre.resultadoAntesTributos", [
      "resultado antes do ir", "resultado antes dos tributos", "resultado antes do imposto",
      "lucro antes do ir", "lucro antes do imposto", "lair",
      "prejuizo antes do ir", "preju.zo antes do ir",
    ]],
    // Resultado LÍQUIDO do exercício = após IRPJ/CSLL — é o valor que vai pra
    // lucros acumulados / dividendos. A ordem dos termos importa: quem casa
    // com "lucro/prejuízo LÍQUIDO" tem prioridade. Os termos sem "líquido"
    // ("prejuízo do exercício", "lucro do exercício") ficam como fallback pra
    // planos de contas simplificados que não distinguem — nesses casos a
    // linha do plano geralmente já É o valor pós-IR (a apuração fecha nela).
    ["dre.resultadoLiquidoInformado", [
      "lucro liquido do exerc", "prejuizo liquido do exerc", "resultado liquido do exerc",
      "resultado do exerc", "lucro do exerc", "preju.zo do exerc", "prejuizo do exerc",
    ]],
  ];
  const camposComSinal = new Set(["dre.resultadoLiquidoInformado", "dre.resultadoAntesTributos"]);
  for (const [campo, termos] of dreRegras) {
    const c = dem.contasDRE.find((c) => termos.some((t) => c.descNorm.includes(t)));
    if (!c) continue;
    // Convenção do tipos.ts: rubricas em módulo (positivo). Exceção: campos de
    // RESULTADO (LAIR e Líquido) guardam sinal — positivo=lucro, negativo=prejuízo —
    // pra que as validações DRE_DIVERGENTE e LAIR_MENOS_TRIBUTOS possam comparar.
    mapa[campo] = camposComSinal.has(campo) ? c.valorFinalSinal : c.valorFinal;
  }

  return montarExercicio(dem.anoFim, mapa, [`SPED-ECD ${dem.dataIni}-${dem.dataFim}`]);
}

/**
 * Facilidade: dado um caminho de arquivo ECD, retorna o exercício do ano-base.
 * Estratégia:
 *  1) Se houver J005 anual (01/01–31/12), usa direto — é a demonstração oficial.
 *  2) Senão, monta um "anual sintético":
 *     - Balanço: pega o último trimestre (data_fim = 31/12). Saldo final é o
 *       saldo de fechamento do ano.
 *     - DRE: soma as rubricas dos 4 trimestres do ano-base. J150 traz o
 *       resultado do período (não acumulado), então DRE anual = soma dos 4.
 */
export function extrairExercicioAnual(caminho: string, anoAlvo?: number): DemonstrativosExercicio | null {
  const linhas = lerArquivoEcd(caminho);
  const demonstracoes = extrairDemonstracoes(linhas);
  if (demonstracoes.length === 0) return null;
  const ano = anoAlvo ?? Math.max(...demonstracoes.map((d) => d.anoFim));

  // Caminho preferencial: J005 anual do ano-alvo.
  const anual = demonstracoes.find((d) => d.anual && d.anoFim === ano);
  if (anual) return demonstracaoParaExercicio(anual);

  // Fallback: compõe a partir dos trimestres do ano-alvo.
  const trimestres = demonstracoes
    .filter((d) => d.anoFim === ano)
    .sort((a, b) => a.mesFim - b.mesFim);
  if (trimestres.length === 0) return null;

  // Balanço: última demonstração com data_fim = 31/12; senão, a mais recente.
  const dezembro = trimestres.find((t) => t.mesFim === 12 && t.diaFim === 31);
  const balancoOrigem = dezembro ?? trimestres[trimestres.length - 1];

  // DRE: soma linhas do J150 de todos os trimestres do ano, agrupadas por
  // descrição normalizada (para casar mesma rubrica entre trimestres).
  const dreAgregada = new Map<string, ContaEcd>();
  for (const t of trimestres) {
    for (const c of t.contasDRE) {
      const existente = dreAgregada.get(c.descNorm);
      if (existente) {
        existente.valorFinal += c.valorFinal;
        existente.valorFinalSinal += c.valorFinalSinal;
      } else {
        dreAgregada.set(c.descNorm, { ...c });
      }
    }
  }

  const composto: DemonstracaoEcd = {
    dataIni: `0101${ano}`,
    dataFim: `3112${ano}`,
    anoFim: ano,
    mesFim: 12,
    diaFim: 31,
    anual: false, // sintético, não veio anual do SPED
    contasBP: balancoOrigem.contasBP,
    contasDRE: [...dreAgregada.values()],
  };
  return demonstracaoParaExercicio(composto);
}

/**
 * DEPRECADO — usa `pastaFiscal` legado. Prefira `caminhoEcdDoAno()` que
 * usa a pasta única C:\PlataformaContabil\.  Mantido temporariamente pra
 * scripts CLI que ainda apontam pra ReceitanetBX diretamente.
 */
export function pastaEcdDoCliente(pastaFiscal: string | null | undefined): string | null {
  if (!pastaFiscal) return null;
  const p = path.join(pastaFiscal, "ECD");
  return existsSync(p) ? p : null;
}

/**
 * Resolve o caminho do SPED-ECD de um ano na pasta única do cliente.
 * Se não estiver lá mas houver `pastaFiscalLegada` com ECD/, copia pra pasta
 * única (uma vez) e retorna o path novo. Se não achar em lugar nenhum, null.
 *
 * Esta é a função canônica pra usar em novos módulos — a pasta única é a
 * fonte de verdade da plataforma. Ver project_fonte_unica_arquivos.
 */
export async function caminhoEcdDoAno(
  cliente: ClienteRef,
  ano: number,
  opts?: { pastaFiscalLegada?: string | null },
): Promise<string | null> {
  const alvo = caminhoArquivo(cliente, "SPED-ECD", ano, null, ".txt");
  if (existsSync(alvo)) return alvo;

  // Fallback: procura na pasta legada e copia pra única (só primeira vez).
  const pastaLegada = opts?.pastaFiscalLegada ? path.join(opts.pastaFiscalLegada, "ECD") : null;
  if (!pastaLegada || !existsSync(pastaLegada)) return null;
  const origem = escolherArquivoEcdEmPasta(pastaLegada, ano);
  if (!origem) return null;
  await copiarDeOrigem(origem, alvo);
  return existsSync(alvo) ? alvo : null;
}

/**
 * Escolhe o "melhor" .txt de ECD dentro de uma pasta pra um ano específico.
 * Mesmo critério de encontrarEcdDoAno: prefere ECD com J005 anual, depois
 * com mais trimestres, depois de maior sequência de retificação.
 */
function escolherArquivoEcdEmPasta(pastaEcd: string, ano: number): string | null {
  return encontrarEcdDoAno(pastaEcd, ano);
}

/**
 * Escolhe o melhor arquivo SPED-ECD do ano dentro de `pastaEcd`. Critérios em
 * ordem: (1) arquivos que têm J005 anual (01/01-31/12) vencem os que só têm
 * trimestres; (2) mais trimestres cobertos; (3) maior número de retificação.
 * Retorna o caminho absoluto ou null se nenhum arquivo servir.
 */
export function encontrarEcdDoAno(pastaEcd: string, ano: number): string | null {
  const candidatos = readdirSync(pastaEcd)
    .filter((f) => f.toLowerCase().endsWith(".txt") && f.includes(`${ano}0101-${ano}1231`))
    .map((nome) => {
      const seq = Number((nome.match(/-(\d+)-SPED-ECD\.txt$/i) ?? [])[1] ?? 0);
      let temAnual = false;
      let trimestres = 0;
      try {
        const linhas = lerArquivoEcd(path.join(pastaEcd, nome));
        const dem = extrairDemonstracoes(linhas).filter((d) => d.anoFim === ano);
        temAnual = dem.some((d) => d.anual);
        trimestres = dem.filter((d) => !d.anual).length;
      } catch {
        // arquivo corrompido — ignora
      }
      return { nome, seq, temAnual, trimestres };
    })
    .filter((c) => c.temAnual || c.trimestres > 0)
    .sort((a, b) => {
      if (a.temAnual !== b.temAnual) return a.temAnual ? -1 : 1;
      if (a.trimestres !== b.trimestres) return b.trimestres - a.trimestres;
      return b.seq - a.seq;
    });
  return candidatos[0] ? path.join(pastaEcd, candidatos[0].nome) : null;
}
