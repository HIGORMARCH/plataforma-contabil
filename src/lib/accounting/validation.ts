/**
 * Validações contábeis automáticas executadas ANTES da análise.
 * Quando há inconsistência relevante (bloqueia=true), a plataforma não
 * emite conclusão definitiva — exige revisão do contador.
 */

import { resultadosDRE, totaisBalanco, div } from "./compute";
import { moeda, percentual } from "./format";
import type { DemonstrativosExercicio, Inconsistencia, Maybe } from "./types";

/** Tolerância relativa para conferência do balanço (0,5%). */
const TOLERANCIA = 0.005;

function relevante(diferenca: number, base: Maybe): boolean {
  // Quando a base é zero (ou nula), o quociente é indefinido — cai para
  // tolerância absoluta de 1 centavo pra não disparar falso positivo em
  // arredondamento de ponto flutuante (ex.: -4.5e-13 tratado como "diferente
  // de zero"). Ao mesmo tempo, uma diferença de R$ 100 continua relevante.
  if (base === null || base === 0) return Math.abs(diferenca) > 0.01;
  return Math.abs(diferenca) / Math.abs(base) > TOLERANCIA;
}

export function validarExercicio(ex: DemonstrativosExercicio): Inconsistencia[] {
  const problemas: Inconsistencia[] = [];
  const b = totaisBalanco(ex.balanco);
  const r = resultadosDRE(ex.dre);

  // 1) Ativo Total = Passivo + PL
  if (b.ativoTotal !== null && b.passivoMaisPL !== null) {
    const dif = b.ativoTotal - b.passivoMaisPL;
    if (relevante(dif, b.ativoTotal)) {
      problemas.push({
        codigo: "BP_NAO_FECHA",
        severidade: "critico",
        titulo: "Balanço não fecha",
        descricao: `Ativo Total (${moeda(b.ativoTotal)}) difere de Passivo + PL (${moeda(
          b.passivoMaisPL,
        )}) em ${moeda(dif)}. A equação patrimonial fundamental não se confirma.`,
        bloqueia: true,
      });
    }
  } else {
    problemas.push({
      codigo: "BP_INCOMPLETO",
      severidade: "critico",
      titulo: "Balanço incompleto",
      descricao: "Não há dados suficientes para conferir a equação Ativo = Passivo + Patrimônio Líquido.",
      bloqueia: true,
    });
  }

  // 2) Conferência do Ativo Total informado x calculado
  if (ex.balanco.ativoTotalInformado != null && b.ativoTotal !== null) {
    const dif = b.ativoTotal - ex.balanco.ativoTotalInformado;
    if (relevante(dif, ex.balanco.ativoTotalInformado)) {
      problemas.push({
        codigo: "ATIVO_DIVERGENTE",
        severidade: "atencao",
        titulo: "Ativo total divergente do informado",
        descricao: `Soma das contas do ativo (${moeda(b.ativoTotal)}) difere do total informado no documento (${moeda(
          ex.balanco.ativoTotalInformado,
        )}). Possível erro de digitação ou conta faltante.`,
        bloqueia: false,
      });
    }
  }

  // 3) Coerência entre o resultado da DRE e o informado
  if (ex.dre.resultadoLiquidoInformado != null && r.resultadoLiquido !== null) {
    const dif = r.resultadoLiquido - ex.dre.resultadoLiquidoInformado;
    if (relevante(dif, ex.dre.resultadoLiquidoInformado)) {
      problemas.push({
        codigo: "DRE_DIVERGENTE",
        severidade: "atencao",
        titulo: "Resultado da DRE divergente do informado",
        descricao: `Resultado líquido recalculado (${moeda(r.resultadoLiquido)}) difere do informado (${moeda(
          ex.dre.resultadoLiquidoInformado,
        )}). Verificar deduções, custos ou tributos.`,
        bloqueia: false,
      });
    }
  }

  // 3.b) Coerência da apuração de tributos sobre o lucro:
  //   Resultado Líquido = LAIR − (IRPJ + CSLL)
  // Se o documento traz LAIR (resultado antes dos tributos) E o resultado
  // líquido informado, a diferença tem que bater com o tributosSobreLucro
  // declarado. Divergência aqui indica IRPJ/CSLL calculado errado, apuração
  // fora do CST, ou reclassificação entre as duas linhas.
  const lair = ex.dre.resultadoAntesTributos;
  const liq = ex.dre.resultadoLiquidoInformado;
  const trib = ex.dre.tributosSobreLucro;
  if (lair != null && liq != null) {
    const tributosImplicitos = lair - liq; // deveria ser +IRPJ+CSLL (positivo se houve tributo)
    const tributosDeclarados = trib ?? 0;
    const dif = tributosImplicitos - tributosDeclarados;
    // Tolerância: R$ 1 absoluto ou 1% do LAIR — o que for maior.
    const tolerancia = Math.max(1, Math.abs(lair) * 0.01);
    if (Math.abs(dif) > tolerancia) {
      problemas.push({
        codigo: "LAIR_MENOS_TRIBUTOS",
        severidade: "atencao",
        titulo: "LAIR menos tributos não bate com o resultado líquido",
        descricao: `LAIR (${moeda(lair)}) menos Resultado Líquido (${moeda(
          liq,
        )}) = ${moeda(tributosImplicitos)} de tributos implícitos. Mas os tributos sobre o lucro declarados são ${moeda(
          tributosDeclarados,
        )} — diferença de ${moeda(dif)}. Verificar apuração de IRPJ/CSLL ou reclassificação entre as linhas de resultado.`,
        bloqueia: false,
      });
    }
  }

  // 4) Patrimônio Líquido negativo (passivo a descoberto).
  // NÃO é uma inconsistência de dados — é uma condição patrimonial REAL (desde
  // que o balanço feche). Não bloqueia a conclusão: a empresa pode e deve ser
  // analisada. A resolução é de natureza societária/estrutural (decisão dos
  // sócios e da administração), não um ajuste técnico-contábil.
  if (b.patrimonioLiquido !== null && b.patrimonioLiquido < 0) {
    problemas.push({
      codigo: "PL_NEGATIVO",
      severidade: "critico",
      titulo: "Patrimônio Líquido negativo (passivo a descoberto)",
      descricao: `O Patrimônio Líquido é negativo (${moeda(
        b.patrimonioLiquido,
      )}): as obrigações superam o ativo. Em geral reflete prejuízos acumulados de exercícios anteriores. É uma fragilidade patrimonial relevante cuja recomposição depende de deliberação societária (aporte/capitalização), não de correção contábil.`,
      bloqueia: false,
    });
  }

  // 5) Contas com saldo invertido (valores negativos onde se espera positivo).
  // Cobre ATIVO (deve ser devedor), PASSIVO (credor) e PL (credor, exceto
  // prejuízos acumulados que são informados em módulo). Um saldo invertido é
  // sinal clássico de lançamento errado no plano de contas na fonte
  // (Domínio/ERP), não algo pra "consertar" — o contador precisa ver.
  const contasPositivas: Array<[string, Maybe]> = [
    ["Caixa e equivalentes", ex.balanco.ativoCirculante.caixaEquivalentes],
    ["Contas a receber", ex.balanco.ativoCirculante.contasReceber],
    ["Estoques", ex.balanco.ativoCirculante.estoques],
    ["Tributos a recuperar", ex.balanco.ativoCirculante.tributosRecuperar],
    ["Realizável a longo prazo", ex.balanco.ativoNaoCirculante.realizavelLongoPrazo],
    ["Investimentos", ex.balanco.ativoNaoCirculante.investimentos],
    ["Imobilizado", ex.balanco.ativoNaoCirculante.imobilizado],
    ["Intangível", ex.balanco.ativoNaoCirculante.intangivel],
    ["Fornecedores", ex.balanco.passivoCirculante.fornecedores],
    ["Empréstimos e financiamentos (CP)", ex.balanco.passivoCirculante.emprestimosFinanciamentos],
    ["Obrigações trabalhistas", ex.balanco.passivoCirculante.obrigacoesTrabalhistas],
    ["Obrigações tributárias", ex.balanco.passivoCirculante.obrigacoesTributarias],
    ["Empréstimos e financiamentos (LP)", ex.balanco.passivoNaoCirculante.emprestimosFinanciamentos],
    ["Capital social", ex.balanco.patrimonioLiquido.capitalSocial],
    ["Reservas", ex.balanco.patrimonioLiquido.reservas],
  ];
  for (const [nome, valor] of contasPositivas) {
    if (valor !== null && valor < 0) {
      problemas.push({
        codigo: "SALDO_INVERTIDO",
        severidade: "atencao",
        titulo: `Saldo invertido: ${nome}`,
        descricao: `A conta "${nome}" apresenta saldo negativo (${moeda(
          valor,
        )}), o que normalmente indica erro de classificação contábil no plano de contas da fonte.`,
        bloqueia: false,
      });
    }
  }

  // 5.b) Apuração do exercício não integralizada.
  // Sintoma: receita relevante mas resultado líquido informado ≈ zero. Típico
  // de balanço extraído do sistema contábil antes da apuração do resultado
  // (CMV, tributos sobre lucro, transferências pra "resultado do exercício").
  // Bloqueia porque análise sobre resultado zerado com R$ mi de receita seria
  // completamente enganosa.
  const rec = ex.dre.receitaBrutaVendas;
  const resInfo = ex.dre.resultadoLiquidoInformado;
  if (rec !== null && rec > 100_000 && resInfo != null && Math.abs(resInfo) < 0.01) {
    problemas.push({
      codigo: "APURACAO_NAO_FECHADA",
      severidade: "critico",
      titulo: "Apuração do exercício não integralizada",
      descricao: `O resultado líquido informado é zero (${moeda(
        resInfo,
      )}) apesar de a receita bruta ser de ${moeda(
        rec,
      )}. Isso é um sinal clássico de que a apuração do exercício ainda não foi fechada na origem (o resultado não foi lançado contra as contas de receita/custo/despesa). Refazer a apuração no sistema contábil e reimportar antes de qualquer análise.`,
      bloqueia: true,
    });
  }

  // 6) Ausência de contas essenciais
  const essenciais: Array<[string, Maybe]> = [
    ["Receita bruta de vendas", ex.dre.receitaBrutaVendas],
    ["Passivo circulante", b.passivoCirculante],
    ["Ativo circulante", b.ativoCirculante],
    ["Patrimônio líquido", b.patrimonioLiquido],
  ];
  for (const [nome, valor] of essenciais) {
    if (valor === null) {
      problemas.push({
        codigo: "CONTA_ESSENCIAL_AUSENTE",
        severidade: "atencao",
        titulo: `Conta essencial ausente: ${nome}`,
        descricao: `Não há dados de "${nome}", o que limita a análise e a confiabilidade de indicadores dependentes.`,
        bloqueia: false,
      });
    }
  }

  // 7) Indício de distribuição de lucros incompatível com prejuízos acumulados
  const prejuizo = ex.balanco.patrimonioLiquido.prejuizosAcumulados ?? 0;
  const lucros = ex.balanco.patrimonioLiquido.lucrosAcumulados ?? 0;
  if (prejuizo > 0 && lucros > 0) {
    problemas.push({
      codigo: "LUCRO_E_PREJUIZO",
      severidade: "atencao",
      titulo: "Lucros e prejuízos acumulados simultâneos",
      descricao:
        "Há lucros acumulados e prejuízos acumulados ao mesmo tempo. Reservas/prejuízos devem ser compensados — verificar classificação no PL.",
      bloqueia: false,
    });
  }

  return problemas;
}

/** Compara dois exercícios e sinaliza variações relevantes entre períodos. */
export function validarVariacoes(
  anterior: DemonstrativosExercicio,
  atual: DemonstrativosExercicio,
  limiteVariacao = 0.5, // 50%
): Inconsistencia[] {
  const problemas: Inconsistencia[] = [];
  const ba = totaisBalanco(anterior.balanco);
  const bb = totaisBalanco(atual.balanco);
  const ra = resultadosDRE(anterior.dre);
  const rb = resultadosDRE(atual.dre);

  const checar = (nome: string, base: Maybe, novo: Maybe) => {
    if (base === null || base === 0 || novo === null) return;
    const variacao = (novo - base) / Math.abs(base);
    if (Math.abs(variacao) > limiteVariacao) {
      problemas.push({
        codigo: "VARIACAO_RELEVANTE",
        severidade: "info",
        titulo: `Variação relevante: ${nome}`,
        descricao: `${nome} variou ${percentual(variacao)} de ${anterior.ano} para ${atual.ano} (${moeda(
          base,
        )} → ${moeda(novo)}). Confirmar se a oscilação tem respaldo documental.`,
        bloqueia: false,
      });
    }
  };

  checar("Ativo total", ba.ativoTotal, bb.ativoTotal);
  checar("Patrimônio líquido", ba.patrimonioLiquido, bb.patrimonioLiquido);
  checar("Capital de terceiros", ba.capitalTerceiros, bb.capitalTerceiros);
  checar("Estoques", anterior.balanco.ativoCirculante.estoques, atual.balanco.ativoCirculante.estoques);
  checar("Contas a receber", anterior.balanco.ativoCirculante.contasReceber, atual.balanco.ativoCirculante.contasReceber);

  // MARGEM_BRUTA_ANOMALA — variação abrupta da margem bruta entre anos
  // consecutivos (>20 pontos percentuais) sugere reclassificação errada de
  // receita/custo, ou (mais comum) CMV que ainda não foi integralizado no
  // exercício atual — inflando artificialmente a margem.
  const mgA = div(ra.lucroBruto, ra.receitaLiquida);
  const mgB = div(rb.lucroBruto, rb.receitaLiquida);
  if (mgA !== null && mgB !== null && Math.abs(mgB - mgA) > 0.20) {
    problemas.push({
      codigo: "MARGEM_BRUTA_ANOMALA",
      severidade: "atencao",
      titulo: "Variação abrupta da margem bruta",
      descricao: `A margem bruta variou de ${percentual(mgA)} em ${anterior.ano} para ${percentual(
        mgB,
      )} em ${atual.ano} (${(Math.abs(mgB - mgA) * 100).toFixed(1)} pontos percentuais). Verificar se o CMV/CSV do exercício foi integralmente lançado e se não houve reclassificação de contas.`,
      bloqueia: false,
    });
  }

  // ESTOQUE_CRESCE_CMV_CAI — sinal clássico de CMV não integralizado: as
  // compras entraram no estoque (BP) mas não saíram pra custo (DRE). Cross-
  // check entre balanço e DRE que capta o padrão antes de qualquer análise
  // de rentabilidade ficar comprometida.
  const estA = anterior.balanco.ativoCirculante.estoques;
  const estB = atual.balanco.ativoCirculante.estoques;
  const cusA = anterior.dre.custos;
  const cusB = atual.dre.custos;
  if (estA !== null && estA > 0 && estB !== null && cusA !== null && cusA > 0 && cusB !== null) {
    const varEst = (estB - estA) / estA;
    const varCus = (cusB - cusA) / cusA;
    if (varEst > 0.10 && varCus < -0.10) {
      problemas.push({
        codigo: "ESTOQUE_CRESCE_CMV_CAI",
        severidade: "critico",
        titulo: "Estoque crescendo com CMV caindo",
        descricao: `O estoque cresceu ${percentual(varEst)} (${moeda(estA)} → ${moeda(
          estB,
        )}) enquanto o CMV caiu ${percentual(varCus)} (${moeda(cusA)} → ${moeda(
          cusB,
        )}). Sinal clássico de custo da mercadoria vendida não integralizado no exercício — as compras entraram no estoque mas não saíram pra custo. Refazer apuração antes de qualquer análise de rentabilidade.`,
        bloqueia: true,
      });
    }
  }

  // PL_NAO_EVOLUI — a equação de continuidade patrimonial diz que
  //   PL_final = PL_inicial + resultado_do_exercicio ± ajustes de PL (aportes,
  //   dividendos, ajustes de exercícios anteriores).
  // Uma quebra maior que 5% do PL sem justificativa aparente indica que ou
  // (a) o resultado do exercício não foi lançado no PL, ou (b) houve
  // movimentação societária (aporte/dividendo) não documentada, ou
  // (c) reclassificação de contas entre exercícios.
  const plA = ba.patrimonioLiquido;
  const plB = bb.patrimonioLiquido;
  const resB = rb.resultadoLiquido;
  if (plA !== null && plB !== null && resB !== null) {
    const esperado = plA + resB;
    const dif = plB - esperado;
    const base = Math.max(Math.abs(plA), Math.abs(plB), 1);
    if (Math.abs(dif) / base > 0.05) {
      problemas.push({
        codigo: "PL_NAO_EVOLUI",
        severidade: "atencao",
        titulo: "PL não fecha com o resultado do exercício",
        descricao: `O PL de ${atual.ano} (${moeda(plB)}) difere em ${moeda(
          dif,
        )} do PL esperado (${moeda(esperado)} = PL de ${anterior.ano} ${moeda(
          plA,
        )} + resultado do exercício ${moeda(resB)}). Verificar aportes, distribuição de dividendos ou ajustes de exercícios anteriores não refletidos.`,
        bloqueia: false,
      });
    }
  }

  return problemas;
}

/**
 * Converte o relatório de conciliação Domínio × ECD em apontamentos padrão
 * (`Inconsistencia[]`) pra que a UI da análise possa consumi-los junto com o
 * resto — sem precisar tratar `RelatorioConciliacao` como caso especial.
 *
 * Divergências CRÍTICAS (totais que não batem) viram apontamentos com
 * `DOMINIO_DIVERGE_ECD` severidade CRÍTICO com `bloqueia=true`. Divergências
 * de detalhe (reclassificações) viram apontamentos `atenção` sem bloqueio —
 * podem refletir escolhas contábeis diferentes entre os dois sistemas, não
 * necessariamente erros.
 *
 * Aplica-se APENAS a clientes Lucro Real/Presumido. Simples Nacional deve
 * conciliar contra DEFIS (validação análoga a ser adicionada com a task #3).
 */
export function validarConciliacaoEcd(rel: {
  ano: number;
  divergenciasCriticas: Array<{ rotulo: string; diferenca: Maybe; valorDominio: Maybe; valorEcd: Maybe }>;
  divergenciasDetalhe: Array<{ rotulo: string; diferenca: Maybe; valorDominio: Maybe; valorEcd: Maybe }>;
}): Inconsistencia[] {
  const problemas: Inconsistencia[] = [];
  for (const d of rel.divergenciasCriticas) {
    problemas.push({
      codigo: "DOMINIO_DIVERGE_ECD",
      severidade: "critico",
      titulo: `Domínio × ECD (${rel.ano}) — ${d.rotulo}`,
      descricao: `O total "${d.rotulo}" no balanço do Domínio (${moeda(
        d.valorDominio ?? 0,
      )}) não bate com a ECD transmitida à Receita (${moeda(
        d.valorEcd ?? 0,
      )}) — diferença de ${moeda(d.diferenca ?? 0)}. Investigar: (a) balanço do Domínio foi alterado após a transmissão da ECD? (b) ECD foi transmitida com dados desatualizados? (c) existe retificação pendente?`,
      bloqueia: true,
    });
  }
  for (const d of rel.divergenciasDetalhe) {
    problemas.push({
      codigo: "DOMINIO_DIVERGE_ECD",
      severidade: "atencao",
      titulo: `Reclassificação Domínio × ECD (${rel.ano}) — ${d.rotulo}`,
      descricao: `A conta "${d.rotulo}" difere entre Domínio (${moeda(
        d.valorDominio ?? 0,
      )}) e ECD (${moeda(d.valorEcd ?? 0)}) em ${moeda(
        d.diferenca ?? 0,
      )}, mas os totais de grupo fecham. Provável reclassificação interna entre planos de contas — verificar se é intencional.`,
      bloqueia: false,
    });
  }
  return problemas;
}

/** Há ao menos uma inconsistência que bloqueia a conclusão automática? */
export function existeBloqueio(problemas: Inconsistencia[]): boolean {
  return problemas.some((p) => p.bloqueia);
}
