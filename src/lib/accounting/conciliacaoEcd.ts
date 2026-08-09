/**
 * Conciliação Domínio × ECD — compara dois exercícios (mesmo ano, mesmo
 * cliente) campo a campo e devolve as divergências.
 *
 * Estratégia:
 *  1. Compara TOTAIS DE GRUPO (AC, ANC, PC, PNC, PL, Ativo, Passivo+PL,
 *     Resultado). Divergência aqui é a mais grave — significa que os dois
 *     documentos não representam o mesmo balanço.
 *  2. Compara CONTAS DE DETALHE. Divergência aqui pode ser reclassificação
 *     (ex.: o Domínio classificou algo em PL.lucros, a ECD em PNC.outros) e
 *     é útil pra o contador identificar o que reagrupar.
 *
 * Aplica-se apenas a clientes Lucro Real/Presumido. Simples Nacional NÃO
 * entrega ECD — usar conciliação × DEFIS. Ver [[project-conciliacao-balanco-por-regime]].
 */

import type { DemonstrativosExercicio, Maybe } from "./types";
import { totaisBalanco, resultadosDRE } from "./compute";
import { moeda } from "./format";
import type { ContaAnalitica, GrupoBalanco } from "./contasAnaliticas";
import { ORDEM_GRUPOS, ROTULO_GRUPO } from "./contasAnaliticas";

/** Uma linha do quadro comparativo. */
export interface LinhaConciliacao {
  categoria: "total" | "detalhe";
  grupo: "ativo" | "passivo" | "pl" | "resultado" | "geral";
  campo: string;
  rotulo: string;
  valorDominio: Maybe;
  valorEcd: Maybe;
  diferenca: Maybe;
  /** true quando |dif| > 0,5% do valor absoluto do maior lado, com piso de R$ 1. */
  divergente: boolean;
}

export interface RelatorioConciliacao {
  ano: number;
  linhas: LinhaConciliacao[];
  divergenciasCriticas: LinhaConciliacao[]; // totais que divergem
  divergenciasDetalhe: LinhaConciliacao[]; // reclassificações
  fecha: boolean; // true se nenhuma divergência crítica
}

const TOLERANCIA_REL = 0.005; // 0,5%
const TOLERANCIA_ABS = 1.0; // R$ 1

function ehDivergente(valDom: Maybe, valEcd: Maybe): boolean {
  const a = valDom ?? 0;
  const b = valEcd ?? 0;
  const dif = Math.abs(a - b);
  if (dif <= TOLERANCIA_ABS) return false;
  const base = Math.max(Math.abs(a), Math.abs(b), 1);
  return dif / base > TOLERANCIA_REL;
}

function linha(
  categoria: LinhaConciliacao["categoria"],
  grupo: LinhaConciliacao["grupo"],
  campo: string,
  rotulo: string,
  valorDominio: Maybe,
  valorEcd: Maybe,
): LinhaConciliacao {
  const dif =
    valorDominio === null && valorEcd === null
      ? null
      : (valorDominio ?? 0) - (valorEcd ?? 0);
  return {
    categoria,
    grupo,
    campo,
    rotulo,
    valorDominio,
    valorEcd,
    diferenca: dif,
    divergente: ehDivergente(valorDominio, valorEcd),
  };
}

/** Compara dois exercícios já parseados. */
export function conciliar(
  dominio: DemonstrativosExercicio,
  ecd: DemonstrativosExercicio,
): RelatorioConciliacao {
  const bD = totaisBalanco(dominio.balanco);
  const bE = totaisBalanco(ecd.balanco);
  const rD = resultadosDRE(dominio.dre);
  const rE = resultadosDRE(ecd.dre);

  const linhas: LinhaConciliacao[] = [
    // ---- Totais de grupo (mais importantes) ----
    linha("total", "ativo", "ac.total", "Total Ativo Circulante", bD.ativoCirculante, bE.ativoCirculante),
    linha("total", "ativo", "anc.total", "Total Ativo Não Circulante", bD.ativoNaoCirculante, bE.ativoNaoCirculante),
    linha("total", "ativo", "ativoTotal", "TOTAL DO ATIVO", bD.ativoTotal, bE.ativoTotal),
    linha("total", "passivo", "pc.total", "Total Passivo Circulante", bD.passivoCirculante, bE.passivoCirculante),
    linha("total", "passivo", "pnc.total", "Total Passivo Não Circulante", bD.passivoNaoCirculante, bE.passivoNaoCirculante),
    linha("total", "pl", "pl.total", "Total Patrimônio Líquido", bD.patrimonioLiquido, bE.patrimonioLiquido),
    linha("total", "geral", "passivoMaisPL", "TOTAL PASSIVO + PL", bD.passivoMaisPL, bE.passivoMaisPL),
    linha("total", "resultado", "dre.receitaLiquida", "Receita Líquida", rD.receitaLiquida, rE.receitaLiquida),
    linha("total", "resultado", "dre.lucroBruto", "Lucro Bruto", rD.lucroBruto, rE.lucroBruto),
    linha("total", "resultado", "dre.resultadoAntesTributos", "Resultado Antes dos Tributos (LAIR)", dominio.dre.resultadoAntesTributos ?? null, ecd.dre.resultadoAntesTributos ?? null),
    linha("total", "resultado", "dre.resultadoLiquido", "Resultado Líquido do Exercício", rD.resultadoLiquido, rE.resultadoLiquido),
    linha("total", "resultado", "dre.resultadoInformado", "Resultado Líquido Informado", dominio.dre.resultadoLiquidoInformado ?? null, ecd.dre.resultadoLiquidoInformado ?? null),
    // ---- Detalhes do balanço ----
    linha("detalhe", "ativo", "ac.caixaEquivalentes", "Caixa e Equivalentes", dominio.balanco.ativoCirculante.caixaEquivalentes, ecd.balanco.ativoCirculante.caixaEquivalentes),
    linha("detalhe", "ativo", "ac.contasReceber", "Contas a Receber", dominio.balanco.ativoCirculante.contasReceber, ecd.balanco.ativoCirculante.contasReceber),
    linha("detalhe", "ativo", "ac.estoques", "Estoques", dominio.balanco.ativoCirculante.estoques, ecd.balanco.ativoCirculante.estoques),
    linha("detalhe", "ativo", "ac.tributosRecuperar", "Tributos a Recuperar", dominio.balanco.ativoCirculante.tributosRecuperar, ecd.balanco.ativoCirculante.tributosRecuperar),
    linha("detalhe", "ativo", "ac.outros", "AC — Outros", dominio.balanco.ativoCirculante.outros, ecd.balanco.ativoCirculante.outros),
    linha("detalhe", "ativo", "anc.imobilizado", "Imobilizado", dominio.balanco.ativoNaoCirculante.imobilizado, ecd.balanco.ativoNaoCirculante.imobilizado),
    linha("detalhe", "passivo", "pc.fornecedores", "Fornecedores", dominio.balanco.passivoCirculante.fornecedores, ecd.balanco.passivoCirculante.fornecedores),
    linha("detalhe", "passivo", "pc.emprestimosFinanciamentos", "Empréstimos (CP)", dominio.balanco.passivoCirculante.emprestimosFinanciamentos, ecd.balanco.passivoCirculante.emprestimosFinanciamentos),
    linha("detalhe", "passivo", "pc.obrigacoesTrabalhistas", "Obrigações Trabalhistas", dominio.balanco.passivoCirculante.obrigacoesTrabalhistas, ecd.balanco.passivoCirculante.obrigacoesTrabalhistas),
    linha("detalhe", "passivo", "pc.obrigacoesTributarias", "Obrigações Tributárias", dominio.balanco.passivoCirculante.obrigacoesTributarias, ecd.balanco.passivoCirculante.obrigacoesTributarias),
    linha("detalhe", "passivo", "pnc.emprestimosFinanciamentos", "Empréstimos (LP)", dominio.balanco.passivoNaoCirculante.emprestimosFinanciamentos, ecd.balanco.passivoNaoCirculante.emprestimosFinanciamentos),
    linha("detalhe", "passivo", "pnc.outros", "PNC — Outros", dominio.balanco.passivoNaoCirculante.outros, ecd.balanco.passivoNaoCirculante.outros),
    linha("detalhe", "pl", "pl.capitalSocial", "Capital Social", dominio.balanco.patrimonioLiquido.capitalSocial, ecd.balanco.patrimonioLiquido.capitalSocial),
    linha("detalhe", "pl", "pl.lucrosAcumulados", "Lucros Acumulados", dominio.balanco.patrimonioLiquido.lucrosAcumulados, ecd.balanco.patrimonioLiquido.lucrosAcumulados),
    linha("detalhe", "pl", "pl.prejuizosAcumulados", "Prejuízos Acumulados", dominio.balanco.patrimonioLiquido.prejuizosAcumulados, ecd.balanco.patrimonioLiquido.prejuizosAcumulados),
    // ---- Detalhes da DRE ----
    linha("detalhe", "resultado", "dre.receitaBrutaVendas", "Receita Bruta", dominio.dre.receitaBrutaVendas, ecd.dre.receitaBrutaVendas),
    linha("detalhe", "resultado", "dre.deducoes", "Deduções", dominio.dre.deducoes, ecd.dre.deducoes),
    linha("detalhe", "resultado", "dre.custos", "Custos (CMV)", dominio.dre.custos, ecd.dre.custos),
    linha("detalhe", "resultado", "dre.despesasOperacionais", "Despesas Operacionais", dominio.dre.despesasOperacionais, ecd.dre.despesasOperacionais),
  ];

  const divergenciasCriticas = linhas.filter((l) => l.categoria === "total" && l.divergente);
  const divergenciasDetalhe = linhas.filter((l) => l.categoria === "detalhe" && l.divergente);

  return {
    ano: dominio.ano,
    linhas,
    divergenciasCriticas,
    divergenciasDetalhe,
    fecha: divergenciasCriticas.length === 0,
  };
}

// ---------------------------------------------------------------------------
// Conciliação POR CONTA analítica — Domínio × ECD
// ---------------------------------------------------------------------------

/**
 * Uma linha do relatório de contas divergentes. Cada linha representa UMA
 * conta analítica que existe em um ou nos dois lados, com status:
 *   - "divergente"   → existe nos dois lados, valores diferem além da tolerância
 *   - "so-dominio"   → existe só no Domínio (a ECD não tem essa conta)
 *   - "so-ecd"       → existe só no SPED-ECD (o Domínio não tem essa conta)
 *   - "identica"     → existe nos dois, valores dentro da tolerância
 */
export interface LinhaContaConciliacao {
  grupo: GrupoBalanco;
  descricao: string;
  descNorm: string;
  codigoDominio: string | null;
  valorDominio: number | null;
  codigoEcd: string | null;
  valorEcd: number | null;
  /** valorDominio − valorEcd; null quando falta um dos lados. */
  diferenca: number | null;
  status: "divergente" | "so-dominio" | "so-ecd" | "identica";
}

/** Bloco pra exibição — agrupa linhas por grupo do BP. */
export interface BlocoContasPorGrupo {
  grupo: GrupoBalanco;
  rotulo: string;
  linhas: LinhaContaConciliacao[];
  totalDominio: number;
  totalEcd: number;
  diferenca: number;
}

export interface RelatorioContasConciliacao {
  ano: number;
  blocos: BlocoContasPorGrupo[];
  /** Total geral (todas as linhas em todos os grupos, sem filtro). */
  total: number;
  /** Contadores por status pra exibição no cabeçalho. */
  contagem: { divergente: number; soDominio: number; soEcd: number; identica: number };
}

/**
 * Casa contas Domínio × ECD por descrição normalizada. Cada descrição só
 * pode ser usada uma vez de cada lado — quando há múltiplas contas com a
 * mesma descrição (raro, mas acontece em planos redundantes), soma os valores
 * antes de comparar.
 *
 * Códigos NÃO servem de chave: cada sistema tem seu próprio plano de contas.
 * A descrição normalizada ("caixa geral") é o que existe em ambos.
 */
export function conciliarPorConta(
  contasDominio: ContaAnalitica[],
  contasEcd: ContaAnalitica[],
  ano: number,
): RelatorioContasConciliacao {
  /** Agrupa por descNorm somando valor; mantém primeiro código encontrado. */
  const agrupar = (contas: ContaAnalitica[]) => {
    const m = new Map<string, { codigo: string; descricao: string; valor: number; grupo: GrupoBalanco }>();
    for (const c of contas) {
      if (!c.descNorm) continue;
      const existe = m.get(c.descNorm);
      if (existe) {
        existe.valor += c.valor;
      } else {
        m.set(c.descNorm, { codigo: c.codigo, descricao: c.descricao, valor: c.valor, grupo: c.grupo });
      }
    }
    return m;
  };

  const mapDom = agrupar(contasDominio);
  const mapEcd = agrupar(contasEcd);
  const todasDescricoes = new Set<string>([...mapDom.keys(), ...mapEcd.keys()]);

  const linhas: LinhaContaConciliacao[] = [];
  for (const descNorm of todasDescricoes) {
    const d = mapDom.get(descNorm);
    const e = mapEcd.get(descNorm);
    const valDom = d?.valor ?? null;
    const valEcd = e?.valor ?? null;
    const dif = d && e ? d.valor - e.valor : null;

    // Ruído: contas que não têm nada em nenhum dos dois lados (ex.: fornecedores
    // que existem no plano da ECD mas nunca tiveram saldo, ou o inverso).
    // Ignora quando os dois lados são ≈ 0 e a diferença cabe na tolerância.
    const magDom = Math.abs(valDom ?? 0);
    const magEcd = Math.abs(valEcd ?? 0);
    if (magDom <= TOLERANCIA_ABS && magEcd <= TOLERANCIA_ABS) continue;

    let status: LinhaContaConciliacao["status"];
    if (d && !e) status = "so-dominio";
    else if (!d && e) status = "so-ecd";
    else if (ehDivergente(valDom, valEcd)) status = "divergente";
    else status = "identica";

    linhas.push({
      // Prefere o grupo do lado que existe; Domínio ganha desempate (código do
      // sistema origem é mais confiável pra grupo do que a heurística ECD).
      grupo: d?.grupo ?? e?.grupo ?? "nao-classificada",
      descricao: d?.descricao ?? e?.descricao ?? descNorm,
      descNorm,
      codigoDominio: d?.codigo ?? null,
      valorDominio: valDom,
      codigoEcd: e?.codigo ?? null,
      valorEcd: valEcd,
      diferenca: dif,
      status,
    });
  }

  // Ordena dentro de cada grupo por |diferenca| descendente (divergências
  // maiores no topo), depois por descrição.
  linhas.sort((a, b) => {
    const da = Math.abs(a.diferenca ?? Math.max(Math.abs(a.valorDominio ?? 0), Math.abs(a.valorEcd ?? 0)));
    const db = Math.abs(b.diferenca ?? Math.max(Math.abs(b.valorDominio ?? 0), Math.abs(b.valorEcd ?? 0)));
    if (da !== db) return db - da;
    return a.descricao.localeCompare(b.descricao);
  });

  const blocos: BlocoContasPorGrupo[] = ORDEM_GRUPOS.map((g) => {
    const linhasGrupo = linhas.filter((l) => l.grupo === g);
    const totalDominio = linhasGrupo.reduce((s, l) => s + (l.valorDominio ?? 0), 0);
    const totalEcd = linhasGrupo.reduce((s, l) => s + (l.valorEcd ?? 0), 0);
    return {
      grupo: g,
      rotulo: ROTULO_GRUPO[g],
      linhas: linhasGrupo,
      totalDominio,
      totalEcd,
      diferenca: totalDominio - totalEcd,
    };
  }).filter((b) => b.linhas.length > 0);

  const contagem = {
    divergente: linhas.filter((l) => l.status === "divergente").length,
    soDominio: linhas.filter((l) => l.status === "so-dominio").length,
    soEcd: linhas.filter((l) => l.status === "so-ecd").length,
    identica: linhas.filter((l) => l.status === "identica").length,
  };

  return { ano, blocos, total: linhas.length, contagem };
}

// ---------------------------------------------------------------------------
// Conciliação hierárquica: agrupa analíticas pela SINTÉTICA da ECD.
// ---------------------------------------------------------------------------
//
// Filosofia: a ECD é o filho/cópia do balanço do Domínio (fonte de verdade).
// A sintética ECD é o "endereço oficial" que a Receita enxerga. Se o total
// da sintética BATE entre Domínio e ECD, a exportação foi fiel naquele
// bloco — mesmo que uma analítica interna tenha divergido, ela compensa com
// outra. Se o total da sintética NÃO bate, aí sim precisa investigar.

export interface BlocoSintetica {
  /** Grupo do BP a que essa sintética pertence. */
  grupo: GrupoBalanco;
  /** Código da sintética na ECD (do bloco J100, campo COD_AGL). */
  codigoSinteticoEcd: string;
  descricaoSintetica: string;
  totalDominio: number;
  totalEcd: number;
  /** Domínio − ECD. Positivo = sobra no Domínio; negativo = falta. */
  diferenca: number;
  /** true se |diferenca| ≤ tolerância (a sintética "fecha"). */
  fecha: boolean;
  /** Analíticas dessa sintética, ordenadas por |diferença| desc. */
  analiticas: LinhaContaConciliacao[];
}

export interface RelatorioSinteticasConciliacao {
  ano: number;
  /** Blocos agrupados por sintética ECD. Sintéticas que fecham no fim. */
  blocos: BlocoSintetica[];
  /**
   * Analíticas do Domínio que não têm correspondência em nenhuma analítica
   * ECD — logo não conseguimos apontar a sintética referencial. Ficam num
   * bucket separado agrupado por grupo do BP.
   */
  soDominioSemSintetica: Array<{ grupo: GrupoBalanco; rotulo: string; linhas: LinhaContaConciliacao[] }>;
  contagem: { sinteticasDivergentes: number; sinteticasFechadas: number; analiticas: number };
}

/**
 * Agrupa a conciliação por sintética da ECD. Para cada sintética:
 *   - Soma o valor Domínio (contas analíticas Domínio matched pra analíticas
 *     ECD daquela sintética) e o valor ECD (soma direta das analíticas ECD).
 *   - Diferença é Domínio − ECD.
 *   - Analíticas ficam dentro do bloco, ordenadas por |diferença| desc.
 *
 * Analíticas Domínio sem match ECD → vão pra `soDominioSemSintetica` porque
 * não sabemos a que sintética referencial pertencem.
 */
export function conciliarPorSintetica(
  contasDominio: ContaAnalitica[],
  contasEcd: ContaAnalitica[],
  ano: number,
): RelatorioSinteticasConciliacao {
  /** descNorm → agregado (soma se houver duplicata do mesmo lado). */
  const agrupar = (contas: ContaAnalitica[]) => {
    const m = new Map<string, ContaAnalitica & { valor: number }>();
    for (const c of contas) {
      if (!c.descNorm) continue;
      const existe = m.get(c.descNorm);
      if (existe) existe.valor += c.valor;
      else m.set(c.descNorm, { ...c });
    }
    return m;
  };

  const mapDom = agrupar(contasDominio);
  const mapEcd = agrupar(contasEcd);

  /** Chave da sintética: código ECD + descrição pra caso o código repita. */
  const chaveSintetica = (c: ContaAnalitica): string =>
    `${c.codigoSintetica ?? "SEM_SINT"}::${c.descricaoSintetica ?? "SEM_SINT"}`;

  const blocosMap = new Map<
    string,
    {
      grupo: GrupoBalanco;
      codigoSinteticoEcd: string;
      descricaoSintetica: string;
      linhas: LinhaContaConciliacao[];
    }
  >();

  const soDominioLinhas: LinhaContaConciliacao[] = [];

  // Percorre todas as descrições que existem em algum dos lados.
  const todas = new Set<string>([...mapDom.keys(), ...mapEcd.keys()]);
  for (const descNorm of todas) {
    const d = mapDom.get(descNorm);
    const e = mapEcd.get(descNorm);
    const valDom = d?.valor ?? null;
    const valEcd = e?.valor ?? null;
    const magDom = Math.abs(valDom ?? 0);
    const magEcd = Math.abs(valEcd ?? 0);
    if (magDom <= TOLERANCIA_ABS && magEcd <= TOLERANCIA_ABS) continue;

    const dif = d && e ? d.valor - e.valor : null;
    let status: LinhaContaConciliacao["status"];
    if (d && !e) status = "so-dominio";
    else if (!d && e) status = "so-ecd";
    else if (ehDivergente(valDom, valEcd)) status = "divergente";
    else status = "identica";

    const linha: LinhaContaConciliacao = {
      grupo: d?.grupo ?? e?.grupo ?? "nao-classificada",
      descricao: d?.descricao ?? e?.descricao ?? descNorm,
      descNorm,
      codigoDominio: d?.codigo ?? null,
      valorDominio: valDom,
      codigoEcd: e?.codigo ?? null,
      valorEcd: valEcd,
      diferenca: dif,
      status,
    };

    // Se tem lado ECD (matched ou só-ECD), sabemos a sintética.
    if (e && e.codigoSintetica) {
      const chave = chaveSintetica(e);
      let bloco = blocosMap.get(chave);
      if (!bloco) {
        bloco = {
          grupo: e.grupo,
          codigoSinteticoEcd: e.codigoSintetica,
          descricaoSintetica: e.descricaoSintetica ?? e.codigoSintetica,
          linhas: [],
        };
        blocosMap.set(chave, bloco);
      }
      bloco.linhas.push(linha);
    } else {
      // Só Domínio ou ECD sem sintética identificada.
      soDominioLinhas.push(linha);
    }
  }

  // Monta blocos com totais + ordenação interna.
  const blocos: BlocoSintetica[] = Array.from(blocosMap.values()).map((b) => {
    const totalDominio = b.linhas.reduce((s, l) => s + (l.valorDominio ?? 0), 0);
    const totalEcd = b.linhas.reduce((s, l) => s + (l.valorEcd ?? 0), 0);
    const diferenca = totalDominio - totalEcd;
    const fecha = Math.abs(diferenca) <= TOLERANCIA_ABS;
    // Ordena analíticas: divergentes primeiro (|dif| desc), depois idênticas.
    b.linhas.sort((a, z) => {
      const da = Math.abs(a.diferenca ?? Math.max(Math.abs(a.valorDominio ?? 0), Math.abs(a.valorEcd ?? 0)));
      const dz = Math.abs(z.diferenca ?? Math.max(Math.abs(z.valorDominio ?? 0), Math.abs(z.valorEcd ?? 0)));
      if (da !== dz) return dz - da;
      return a.descricao.localeCompare(z.descricao);
    });
    return {
      grupo: b.grupo,
      codigoSinteticoEcd: b.codigoSinteticoEcd,
      descricaoSintetica: b.descricaoSintetica,
      totalDominio,
      totalEcd,
      diferenca,
      fecha,
      analiticas: b.linhas,
    };
  });

  // Ordena blocos: por grupo (na ordem canônica) → dentro do grupo, não-fechados
  // primeiro, depois por |diferença| desc.
  const ordemGrupoIdx = (g: GrupoBalanco) => ORDEM_GRUPOS.indexOf(g);
  blocos.sort((a, b) => {
    const ga = ordemGrupoIdx(a.grupo);
    const gb = ordemGrupoIdx(b.grupo);
    if (ga !== gb) return ga - gb;
    if (a.fecha !== b.fecha) return a.fecha ? 1 : -1;
    return Math.abs(b.diferenca) - Math.abs(a.diferenca);
  });

  // Só-Domínio-sem-sintética, agrupado por grupo do BP.
  const soDominioSemSintetica = ORDEM_GRUPOS.map((g) => ({
    grupo: g,
    rotulo: ROTULO_GRUPO[g],
    linhas: soDominioLinhas
      .filter((l) => l.grupo === g)
      .sort((a, b) => Math.abs(b.valorDominio ?? 0) - Math.abs(a.valorDominio ?? 0)),
  })).filter((b) => b.linhas.length > 0);

  return {
    ano,
    blocos,
    soDominioSemSintetica,
    contagem: {
      sinteticasDivergentes: blocos.filter((b) => !b.fecha).length,
      sinteticasFechadas: blocos.filter((b) => b.fecha).length,
      analiticas: blocos.reduce((s, b) => s + b.analiticas.length, 0) + soDominioLinhas.length,
    },
  };
}

/**
 * Variante determinística de conciliarPorSintetica — matching por CÓDIGO DA
 * CONTA (COD_CTA do Domínio), não por descrição.
 *
 * Requer que os dois lados usem o mesmo esquema de código Dom:
 *  - lado Domínio: vem do PDF do balanço (parseContas → contasAnaliticasDominio)
 *  - lado ECD:    vem do bloco I155 do SPED-ECD (contasAnaliticasEcdViaI155DoAno)
 *
 * Vantagem sobre matching por descrição: casa mesmo quando plano da empresa
 * foi reagrupado ("APLICACAO BANCO DO BRASIL" no Dom que na ECD virou
 * "BANCO DO BRASIL 1" + "BANCO DO BRASIL S/A" — mas pelo código Dom ambos
 * apontam pra mesma coisa e viram matched).
 */
export function conciliarPorCodigoDominio(
  contasDominio: ContaAnalitica[],
  contasEcd: ContaAnalitica[],
  ano: number,
): RelatorioSinteticasConciliacao {
  const agrupar = (contas: ContaAnalitica[]) => {
    const m = new Map<string, ContaAnalitica & { valor: number }>();
    for (const c of contas) {
      if (!c.codigo) continue;
      const existe = m.get(c.codigo);
      if (existe) existe.valor += c.valor;
      else m.set(c.codigo, { ...c });
    }
    return m;
  };

  const mapDom = agrupar(contasDominio);
  const mapEcd = agrupar(contasEcd);

  const chaveSintetica = (c: ContaAnalitica): string =>
    `${c.codigoSintetica ?? "SEM_SINT"}::${c.descricaoSintetica ?? "SEM_SINT"}`;

  const blocosMap = new Map<
    string,
    {
      grupo: GrupoBalanco;
      codigoSinteticoEcd: string;
      descricaoSintetica: string;
      linhas: LinhaContaConciliacao[];
    }
  >();

  const soDominioLinhas: LinhaContaConciliacao[] = [];

  const todosCodigos = new Set<string>([...mapDom.keys(), ...mapEcd.keys()]);
  for (const codigo of todosCodigos) {
    const d = mapDom.get(codigo);
    const e = mapEcd.get(codigo);
    const valDom = d?.valor ?? null;
    const valEcd = e?.valor ?? null;
    const magDom = Math.abs(valDom ?? 0);
    const magEcd = Math.abs(valEcd ?? 0);
    if (magDom <= TOLERANCIA_ABS && magEcd <= TOLERANCIA_ABS) continue;

    const dif = d && e ? d.valor - e.valor : null;
    let status: LinhaContaConciliacao["status"];
    if (d && !e) status = "so-dominio";
    else if (!d && e) status = "so-ecd";
    else if (ehDivergente(valDom, valEcd)) status = "divergente";
    else status = "identica";

    const linha: LinhaContaConciliacao = {
      grupo: e?.grupo ?? d?.grupo ?? "nao-classificada",
      descricao: d?.descricao ?? e?.descricao ?? codigo,
      descNorm: (e?.descNorm ?? d?.descNorm) || codigo,
      // Exibição: prefere a classificação hierárquica do Dom (1.1.50.100.1) se
      // disponível; senão mostra o sequencial (128 — mesmo do SPED). No lado ECD
      // só existe o sequencial mesmo.
      codigoDominio: d?.codigoExibicao ?? d?.codigo ?? codigo,
      valorDominio: valDom,
      codigoEcd: codigo,
      valorEcd: valEcd,
      diferenca: dif,
      status,
    };

    // Fonte da sintética: ECD prefere (é oficial); se só Dom, usa Dom.
    const fonteSint = e ?? d;
    if (fonteSint?.codigoSintetica) {
      const chave = chaveSintetica(fonteSint);
      let bloco = blocosMap.get(chave);
      if (!bloco) {
        bloco = {
          grupo: fonteSint.grupo,
          codigoSinteticoEcd: fonteSint.codigoSintetica,
          descricaoSintetica: fonteSint.descricaoSintetica ?? fonteSint.codigoSintetica,
          linhas: [],
        };
        blocosMap.set(chave, bloco);
      }
      bloco.linhas.push(linha);
    } else {
      soDominioLinhas.push(linha);
    }
  }

  const blocos: BlocoSintetica[] = Array.from(blocosMap.values()).map((b) => {
    const totalDominio = b.linhas.reduce((s, l) => s + (l.valorDominio ?? 0), 0);
    const totalEcd = b.linhas.reduce((s, l) => s + (l.valorEcd ?? 0), 0);
    const diferenca = totalDominio - totalEcd;
    const fecha = Math.abs(diferenca) <= TOLERANCIA_ABS;
    b.linhas.sort((a, z) => {
      const da = Math.abs(a.diferenca ?? Math.max(Math.abs(a.valorDominio ?? 0), Math.abs(a.valorEcd ?? 0)));
      const dz = Math.abs(z.diferenca ?? Math.max(Math.abs(z.valorDominio ?? 0), Math.abs(z.valorEcd ?? 0)));
      if (da !== dz) return dz - da;
      return a.descricao.localeCompare(z.descricao);
    });
    return {
      grupo: b.grupo,
      codigoSinteticoEcd: b.codigoSinteticoEcd,
      descricaoSintetica: b.descricaoSintetica,
      totalDominio,
      totalEcd,
      diferenca,
      fecha,
      analiticas: b.linhas,
    };
  });

  const ordemGrupoIdx = (g: GrupoBalanco) => ORDEM_GRUPOS.indexOf(g);
  blocos.sort((a, b) => {
    const ga = ordemGrupoIdx(a.grupo);
    const gb = ordemGrupoIdx(b.grupo);
    if (ga !== gb) return ga - gb;
    if (a.fecha !== b.fecha) return a.fecha ? 1 : -1;
    return Math.abs(b.diferenca) - Math.abs(a.diferenca);
  });

  const soDominioSemSintetica = ORDEM_GRUPOS.map((g) => ({
    grupo: g,
    rotulo: ROTULO_GRUPO[g],
    linhas: soDominioLinhas
      .filter((l) => l.grupo === g)
      .sort((a, b) => Math.abs(b.valorDominio ?? 0) - Math.abs(a.valorDominio ?? 0)),
  })).filter((b) => b.linhas.length > 0);

  return {
    ano,
    blocos,
    soDominioSemSintetica,
    contagem: {
      sinteticasDivergentes: blocos.filter((b) => !b.fecha).length,
      sinteticasFechadas: blocos.filter((b) => b.fecha).length,
      analiticas: blocos.reduce((s, b) => s + b.analiticas.length, 0) + soDominioLinhas.length,
    },
  };
}

/** Formata uma linha para output CLI. */
export function formatarLinha(l: LinhaConciliacao): string {
  const marker = l.divergente ? "✗" : " ";
  const dom = l.valorDominio === null ? "-" : moeda(l.valorDominio);
  const ecd = l.valorEcd === null ? "-" : moeda(l.valorEcd);
  const dif = l.diferenca === null ? "-" : moeda(l.diferenca);
  return `  ${marker} ${l.rotulo.padEnd(35)} DOM: ${dom.padStart(18)}   ECD: ${ecd.padStart(18)}   DIF: ${dif.padStart(18)}`;
}
