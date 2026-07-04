import { NextResponse } from "next/server";
import { brl, type ValuationInput, type ValuationResult } from "@/lib/valuation/calc";

/**
 * Gera o texto do parecer de valuation.
 * A IA NUNCA cria número — recebe os valores já calculados pelo motor e apenas
 * os redige em linguagem de parecer técnico. Sem ANTHROPIC_API_KEY, cai no
 * texto determinístico (funciona igual, só menos fluido).
 */

const SYSTEM = `Você é assistente técnico de um contador brasileiro e redige um PARECER DE AVALIAÇÃO ECONÔMICA por múltiplos de mercado.
REGRAS INVIOLÁVEIS:
- NUNCA invente, altere ou crie números, percentuais ou valores. Use EXATAMENTE os valores fornecidos no JSON.
- Diferencie fato, indício e recomendação. Não emita laudo pericial nem afirme conformidade fiscal.
- Tom técnico-contábil, de consultoria, em português. Sem emojis.
- Estruture em seções: Síntese executiva; Leitura de ciclo; Direcionadores de valor (intangíveis); Cenário decisório (vender agora x segurar); Recomendação técnica.
- Seja objetivo (350-500 palavras).`;

function textoDeterministico(i: ValuationInput, r: ValuationResult): string {
  return `PARECER DE AVALIAÇÃO ECONÔMICA — ${i.razaoSocial || "Empresa"}

SÍNTESE EXECUTIVA
Com base na receita total declarada de ${brl(r.receitaTotal)} (faturamento fiscal de ${brl(
    i.faturamentoFiscal,
  )} somado a ${brl(i.comissao)} de outras receitas) e margem líquida de ${i.margemPct}%, o lucro estimado é de ${brl(
    r.lucroEstimado,
  )}. O valor de referência do negócio situa-se entre ${brl(r.valor.min)} e ${brl(
    r.valor.max,
  )}, com ponto médio de ${brl(r.valor.medio)}.

LEITURA DE CICLO
A avaliação considera o patamar atual de receita e a lucratividade informada pela administração, aplicando múltiplos de mercado usuais para o setor ${
    i.setor || "de atuação"
  }.

DIRECIONADORES DE VALOR (INTANGÍVEIS)
Aplicou-se prêmio de ${i.premioPct}% sobre o valor técnico, refletindo ativos intangíveis${
    i.anosMercado ? ` e ${i.anosMercado} anos de mercado` : ""
  } — barreira de entrada e relacionamento consolidado que não oscilam com o ciclo de curto prazo.

CENÁRIO DECISÓRIO — VENDER AGORA OU SEGURAR
- Venda sob pressão: ${brl(r.cenarios.pressao.min)} a ${brl(r.cenarios.pressao.max)}.
- Valor justo hoje: ${brl(r.cenarios.justo.min)} a ${brl(r.cenarios.justo.max)}.
- Segurar 24–36 meses: ${brl(r.cenarios.segurar.min)} a ${brl(r.cenarios.segurar.max)}.
Vender sob pressão realiza um preço deprimido frente ao valor justo e, sobretudo, frente ao cenário de retomada.

RECOMENDAÇÃO TÉCNICA
Preservar o ativo e reavaliar a decisão fora de um momento de pressão. Um aperto pontual de caixa admite soluções reversíveis (renegociação, revisão de custos, capital-ponte); a venda é irreversível.

(Parecer indicativo; não constitui laudo pericial. Revisão do responsável técnico obrigatória.)`;
}

export async function POST(req: Request) {
  let body: { input: ValuationInput; resultado: ValuationResult };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ erro: "Corpo inválido." }, { status: 400 });
  }
  const { input, resultado } = body;
  const fallback = textoDeterministico(input, resultado);

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ texto: fallback, origem: "deterministico" });
  }

  try {
    const modelo = process.env.ANTHROPIC_MODEL || "claude-sonnet-4-6";
    const resp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: modelo,
        max_tokens: 1600,
        system: SYSTEM,
        messages: [
          {
            role: "user",
            content:
              "Redija o parecer usando EXATAMENTE estes valores (não altere nenhum número):\n" +
              JSON.stringify({ input, resultado }, null, 2),
          },
        ],
      }),
    });
    if (!resp.ok) throw new Error("HTTP " + resp.status);
    const data = await resp.json();
    const texto = data?.content?.[0]?.text?.trim();
    return NextResponse.json({ texto: texto || fallback, origem: texto ? "ia" : "deterministico" });
  } catch (e) {
    return NextResponse.json({ texto: fallback, origem: "deterministico", aviso: (e as Error).message });
  }
}
