/**
 * Geração do relatório técnico em LINGUAGEM SIMPLES, acessível ao cliente.
 *
 * Esta é a camada determinística (sem IA): transforma os números calculados
 * em texto claro, sem jargão, explicando o que cada coisa significa na prática.
 * É também o "fallback" usado quando não há provedor de IA configurado e a
 * base factual que a IA recebe (para nunca inventar números).
 */

import { resultadosDRE, totaisBalanco } from "./compute";
import { moeda, percentual } from "./format";
import { ROTULO_SITUACAO, type ResultadoAnalise } from "./analyze";
import type { DemonstrativosExercicio, Indicador } from "./types";

export interface RelatorioTexto {
  resumoExecutivo: string[];
  analiseBalanco: string[];
  analiseResultado: string[];
  pontosAtencao: string[];
  recomendacoes: string[];
  conclusao: string[];
  /** Aviso fixo de limitação/responsabilidade. */
  limitacaoEscopo: string;
}

function frasePositivaNegativa(valor: number, positivo: string, negativo: string) {
  return valor >= 0 ? positivo : negativo;
}

/** Gera o relatório determinístico em linguagem simples. */
export function gerarRelatorioSimples(
  exercicios: DemonstrativosExercicio[],
  analise: ResultadoAnalise,
): RelatorioTexto {
  const ordenados = [...exercicios].sort((a, b) => a.ano - b.ano);
  const ultimo = ordenados[ordenados.length - 1];
  const primeiro = ordenados[0];
  const b = totaisBalanco(ultimo.balanco);
  const r = resultadosDRE(ultimo.dre);
  const temHistorico = ordenados.length > 1;

  const ind = (chave: string): Indicador | undefined =>
    analise.indicadoresRecentes.find((i) => i.chave === chave);

  // ---------- RESUMO EXECUTIVO ----------
  const resumoExecutivo: string[] = [];
  resumoExecutivo.push(
    `Este relatório analisa a saúde financeira da empresa no exercício de ${ultimo.ano}` +
      (temHistorico ? `, comparando com o período de ${primeiro.ano} a ${ultimo.ano}.` : ".") +
      " Ele foi escrito em linguagem direta para que você entenda a situação do seu negócio sem precisar ser especialista em contabilidade.",
  );
  if (r.resultadoLiquido !== null) {
    resumoExecutivo.push(
      frasePositivaNegativa(
        r.resultadoLiquido,
        `No último exercício a empresa teve LUCRO de ${moeda(r.resultadoLiquido)}. Em termos simples: depois de pagar todos os custos, despesas e impostos, sobrou esse valor.`,
        `No último exercício a empresa teve PREJUÍZO de ${moeda(Math.abs(r.resultadoLiquido))}. Em termos simples: os custos, despesas e impostos superaram o que a empresa recebeu.`,
      ),
    );
  }
  const liq = ind("liquidez_corrente");
  if (liq?.valor != null) {
    resumoExecutivo.push(
      liq.valor >= 1
        ? `A empresa tem fôlego para pagar suas contas de curto prazo: para cada R$ 1,00 que deve no curto prazo, possui ${liq.valorFormatado} disponível.`
        : `Atenção ao caixa: para cada R$ 1,00 que a empresa deve no curto prazo, ela tem apenas ${liq.valorFormatado} disponível para pagar. Isso aperta o caixa.`,
    );
  }
  resumoExecutivo.push(`Classificação geral da situação: ${ROTULO_SITUACAO[analise.situacao]}.`);

  // ---------- ANÁLISE DO BALANÇO ----------
  const analiseBalanco: string[] = [];
  analiseBalanco.push(
    "O Balanço Patrimonial é como uma 'fotografia' do que a empresa tem (bens e direitos) e do que ela deve (obrigações) em uma data.",
  );
  if (b.ativoTotal !== null) {
    analiseBalanco.push(
      `No fim de ${ultimo.ano}, a empresa reunia ${moeda(b.ativoTotal)} em bens e direitos (o chamado Ativo Total).`,
    );
  }
  if (b.capitalTerceiros !== null && b.patrimonioLiquido !== null && b.ativoTotal) {
    const partTerceiros = (b.capitalTerceiros ?? 0) / b.ativoTotal;
    analiseBalanco.push(
      `Desse total, ${percentual(partTerceiros)} é financiado por dívidas (dinheiro de terceiros: bancos, fornecedores, impostos a pagar) e o restante por recursos próprios da empresa (Patrimônio Líquido de ${moeda(
        b.patrimonioLiquido,
      )}).`,
    );
    if (b.patrimonioLiquido < 0) {
      analiseBalanco.push(
        "ATENÇÃO: o Patrimônio Líquido está negativo (passivo a descoberto) — as dívidas superam o total de bens e direitos. Em geral isso reflete PREJUÍZOS ACUMULADOS de anos anteriores, e não necessariamente o resultado do período atual. É uma fragilidade patrimonial que pede recomposição de capital pelos sócios.",
      );
    }
  }
  const endiv = ind("endividamento_geral");
  if (endiv?.valor != null) {
    analiseBalanco.push(endiv.interpretacao + " " + endiv.recomendacao);
  }
  if (temHistorico) {
    const linhaPL = analise.cruzamento.patrimonial.find((l) => l.rotulo === "Patrimônio líquido");
    if (linhaPL?.variacaoTotal != null) {
      analiseBalanco.push(
        linhaPL.variacaoTotal >= 0
          ? `Ao longo do período analisado, o patrimônio próprio da empresa CRESCEU ${percentual(linhaPL.variacaoTotal)} — sinal de fortalecimento.`
          : `Ao longo do período analisado, o patrimônio próprio da empresa DIMINUIU ${percentual(Math.abs(linhaPL.variacaoTotal))} — sinal de desgaste que merece atenção.`,
      );
    }
  }

  // ---------- ANÁLISE DA DRE ----------
  const analiseResultado: string[] = [];
  analiseResultado.push(
    "A DRE (Demonstração do Resultado) mostra se a empresa ganhou ou perdeu dinheiro no período: começa pela receita e vai descontando custos, despesas e impostos até chegar ao lucro (ou prejuízo).",
  );
  if (r.receitaLiquida !== null) {
    analiseResultado.push(`A receita líquida (o que a empresa faturou, já sem impostos sobre venda) foi de ${moeda(r.receitaLiquida)}.`);
  }
  const mb = ind("margem_bruta");
  const ml = ind("margem_liquida");
  if (mb?.valor != null) {
    analiseResultado.push(
      `Margem bruta de ${mb.valorFormatado}: de cada R$ 100 vendidos, sobram ${moeda((mb.valor ?? 0) * 100)} após pagar os custos diretos do produto/serviço.`,
    );
  }
  if (ml?.valor != null) {
    analiseResultado.push(
      ml.valor >= 0
        ? `Margem líquida de ${ml.valorFormatado}: no fim das contas, de cada R$ 100 vendidos a empresa transforma ${moeda((ml.valor ?? 0) * 100)} em lucro.`
        : `Margem líquida NEGATIVA de ${ml.valorFormatado}: a cada R$ 100 vendidos, a empresa perde ${moeda(Math.abs((ml.valor ?? 0) * 100))}. O preço de venda ou a estrutura de custos precisa ser revista.`,
    );
  }
  if (temHistorico) {
    const linhaRec = analise.cruzamento.resultado.find((l) => l.rotulo === "Receita líquida");
    const linhaLuc = analise.cruzamento.resultado.find((l) => l.rotulo === "Resultado líquido");
    if (linhaRec?.variacaoTotal != null) {
      analiseResultado.push(
        linhaRec.variacaoTotal >= 0
          ? `A receita cresceu ${percentual(linhaRec.variacaoTotal)} no período.`
          : `A receita caiu ${percentual(Math.abs(linhaRec.variacaoTotal))} no período — é preciso entender o motivo (perda de clientes, queda de preços, mercado).`,
      );
    }
    if (linhaLuc?.variacaoTotal != null) {
      analiseResultado.push(
        `O resultado do período ${linhaLuc.variacaoTotal >= 0 ? "melhorou" : "piorou"} ${percentual(Math.abs(linhaLuc.variacaoTotal))} comparando o primeiro e o último ano.`,
      );
    }
  }

  // ---------- PONTOS DE ATENÇÃO ----------
  const pontosAtencao: string[] = [];
  const todasInconsist = [
    ...analise.exercicios.flatMap((e) => e.inconsistencias),
    ...analise.inconsistenciasVariacao,
  ];
  for (const inc of todasInconsist.filter((i) => i.severidade !== "info")) {
    pontosAtencao.push(`${inc.titulo}: ${inc.descricao}`);
  }
  for (const i of analise.indicadoresRecentes.filter((x) => x.classificacao === "critico")) {
    pontosAtencao.push(`${i.nome} em nível crítico (${i.valorFormatado}). ${i.recomendacao}`);
  }
  const tesouraria = ind("saldo_tesouraria");
  if (tesouraria?.valor != null && tesouraria.valor < 0) {
    pontosAtencao.push(
      "A empresa está usando empréstimos de curto prazo para bancar o dia a dia (efeito tesoura). Isso encarece a operação com juros e aumenta o risco.",
    );
  }
  if (pontosAtencao.length === 0) {
    pontosAtencao.push("Não foram identificados pontos de atenção relevantes nos dados fornecidos.");
  }

  // ---------- RECOMENDAÇÕES ----------
  const recomendacoes: string[] = [];
  const liqC = ind("liquidez_corrente");
  if (liqC?.valor != null && liqC.valor < 1.2) {
    recomendacoes.push("Reforçar o capital de giro: negociar prazos maiores com fornecedores, acelerar recebimentos e evitar estoques parados.");
  }
  if (endiv?.valor != null && endiv.valor > 0.7) {
    recomendacoes.push("Reduzir o endividamento, priorizando a quitação das dívidas mais caras (juros altos) e evitando novos financiamentos não essenciais.");
  }
  if (ml?.valor != null && ml.valor < 0.05) {
    recomendacoes.push("Revisar a precificação e a estrutura de custos/despesas para ampliar a margem de lucro.");
  }
  const comp = ind("composicao_endividamento");
  if (comp?.valor != null && comp.valor > 0.7) {
    recomendacoes.push("Buscar alongar o prazo das dívidas (trocar dívida de curto prazo por longo prazo) para aliviar a pressão sobre o caixa.");
  }
  if (b.patrimonioLiquido !== null && b.patrimonioLiquido < 0) {
    recomendacoes.push("RECOMPOSIÇÃO PATRIMONIAL (decisão dos sócios/direção): avaliar aporte de capital, capitalização de lucros futuros ou reestruturação societária para reverter o passivo a descoberto. Manter a geração de lucro operacional, que vem reduzindo o déficit acumulado.");
  }
  recomendacoes.push("Manter a escrituração contábil em dia e fornecer os documentos completos para que as próximas análises sejam ainda mais precisas.");

  // ---------- CONCLUSÃO ----------
  const conclusao: string[] = [];
  const plRecente = b.patrimonioLiquido;
  const lucroLiquido = r.resultadoLiquido;
  const linhaEvolucaoPL = analise.cruzamento.patrimonial.find((l) => l.rotulo === "Patrimônio líquido");
  const plMelhorando = (linhaEvolucaoPL?.variacaoTotal ?? 0) > 0;

  if (analise.bloqueado) {
    conclusao.push(
      "A análise ficou INCONCLUSIVA porque foram encontradas inconsistências que comprometem a CONFIABILIDADE DOS DADOS (por exemplo, o Balanço não fecha ou faltam contas essenciais). Esses pontos precisam ser revisados nos arquivos de origem antes de qualquer conclusão sobre a saúde da empresa.",
    );
  } else if (plRecente !== null && plRecente < 0) {
    // PASSIVO A DESCOBERTO — questão estrutural/societária, não erro técnico.
    conclusao.push(
      "Do ponto de vista TÉCNICO-CONTÁBIL, os demonstrativos apresentam-se CONSISTENTES: o Balanço fecha e a escrituração é coerente. A análise é, portanto, conclusiva.",
    );
    conclusao.push(
      `A empresa apresenta PATRIMÔNIO LÍQUIDO NEGATIVO (passivo a descoberto) de ${moeda(Math.abs(plRecente))}. Essa condição decorre de PREJUÍZOS ACUMULADOS de exercícios anteriores — e não de um desempenho ruim do período analisado. É uma questão de natureza ESTRUTURAL e PATRIMONIAL, não um ajuste a cargo da contabilidade.`,
    );
    if (lucroLiquido !== null && lucroLiquido > 0) {
      conclusao.push(
        `Ponto relevante: a OPERAÇÃO ATUAL É LUCRATIVA (resultado de ${moeda(lucroLiquido)} no exercício)` +
          (plMelhorando && linhaEvolucaoPL?.variacaoTotal != null
            ? `, o que vem REDUZINDO gradativamente o passivo a descoberto — o patrimônio líquido melhorou ${percentual(linhaEvolucaoPL.variacaoTotal)} no período analisado. Há uma trajetória de recuperação em curso.`
            : ". Ainda assim, os prejuízos acumulados superam os resultados positivos recentes."),
      );
    }
    conclusao.push(
      "Diversos indicadores que dependem do patrimônio líquido ficam distorcidos ou inconclusivos por causa do patrimônio negativo herdado — eles NÃO refletem o desempenho operacional do período, que é positivo.",
    );
    conclusao.push(
      "A recomposição definitiva do patrimônio depende de DELIBERAÇÃO DOS SÓCIOS E DA ADMINISTRAÇÃO (aporte de capital, capitalização de lucros futuros ou reestruturação societária). É uma decisão de GOVERNANÇA da empresa: ao contador cabe evidenciar, mensurar e acompanhar a situação; a adoção das medidas de reforço patrimonial é responsabilidade da DIREÇÃO da corporação.",
    );
  } else {
    conclusao.push(`Com base nos documentos fornecidos, a situação da empresa é classificada como: ${ROTULO_SITUACAO[analise.situacao]}.`);
    switch (analise.situacao) {
      case "favoravel":
        conclusao.push("A empresa apresenta boa capacidade de pagamento, endividamento sob controle e geração de resultado positiva. O cenário é confortável, mas o acompanhamento contínuo é recomendado.");
        break;
      case "regular_com_atencao":
        conclusao.push("A empresa está em situação administrável, porém com pontos que merecem acompanhamento próximo. Agindo sobre as recomendações deste relatório, é possível melhorar os indicadores nos próximos exercícios.");
        break;
      case "critica":
        conclusao.push("A empresa apresenta fragilidades importantes que, se não tratadas, podem comprometer a continuidade do negócio. Recomenda-se ação imediata sobre os pontos de atenção e acompanhamento de perto pelo contador.");
        break;
      default:
        conclusao.push("Não há dados suficientes para uma conclusão definitiva.");
    }
  }

  const limitacaoEscopo =
    "Esta análise foi elaborada exclusivamente com base nos documentos fornecidos pela empresa e NÃO representa auditoria independente, perícia contábil, nem garantia absoluta de inexistência de erros, fraudes ou omissões. A Inteligência Artificial atua como ferramenta auxiliar; a responsabilidade técnica final é do contador responsável, que revisa e aprova o relatório antes de sua liberação.";

  return {
    resumoExecutivo,
    analiseBalanco,
    analiseResultado,
    pontosAtencao,
    recomendacoes,
    conclusao,
    limitacaoEscopo,
  };
}
