/**
 * Camada de IA PLUGGABLE.
 *
 * Princípio: a IA NUNCA gera números. Todos os valores e classificações vêm
 * do motor determinístico. A IA recebe os fatos já calculados e apenas os
 * reescreve em linguagem mais fluida e acessível ao cliente.
 *
 * - Se ANTHROPIC_API_KEY estiver definido, refina o texto via API da Anthropic.
 * - Caso contrário, devolve o texto determinístico (fallback), sem falhar.
 *
 * Toda resposta é registrada (log) para auditoria. A revisão humana do
 * contador permanece obrigatória antes da emissão final.
 */

import type { RelatorioTexto } from "../accounting/narrative";

export interface RefinoIA {
  texto: RelatorioTexto;
  origem: "ia" | "deterministico";
  modelo?: string;
  observacao?: string;
}

const SYSTEM_PROMPT = `Você é assistente técnico de um contador brasileiro. Recebe um relatório de análise financeira JÁ CALCULADO (com números e classificações definidos por um motor determinístico) e deve reescrevê-lo em português claro e acessível a um empresário leigo, mantendo o tom profissional.

REGRAS INVIOLÁVEIS:
- NUNCA invente, altere ou crie números, percentuais, valores ou classificações. Use somente os fatos fornecidos.
- NÃO afirme regularidade fiscal, conformidade legal plena ou ausência de fraudes.
- NÃO emita parecer de auditoria nem laudo pericial.
- Diferencie fato contábil, indício e recomendação.
- Se um dado estiver ausente, diga que falta informação — não preencha lacunas.
- Mantenha a estrutura de seções recebida. Retorne JSON no mesmo formato de entrada.`;

export async function refinarRelatorio(
  texto: RelatorioTexto,
  contexto: { cliente: string; ano: number },
): Promise<RefinoIA> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return {
      texto,
      origem: "deterministico",
      observacao:
        "Texto gerado pelo motor determinístico (nenhuma chave de IA configurada). Defina ANTHROPIC_API_KEY para ativar o refino por IA.",
    };
  }

  try {
    const modelo = process.env.ANTHROPIC_MODEL || "claude-sonnet-4-6";
    const userContent = JSON.stringify({ contexto, relatorio: texto });
    const resp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: modelo,
        max_tokens: 4096,
        system: SYSTEM_PROMPT,
        messages: [
          {
            role: "user",
            content:
              "Reescreva o relatório a seguir em linguagem clara para o cliente, respeitando as regras invioláveis. " +
              "Responda APENAS com um objeto JSON com as chaves: resumoExecutivo, analiseBalanco, analiseResultado, pontosAtencao, recomendacoes, conclusao (todas arrays de strings) e limitacaoEscopo (string). " +
              "Dados:\n" +
              userContent,
          },
        ],
      }),
    });

    if (!resp.ok) {
      const err = await resp.text();
      return {
        texto,
        origem: "deterministico",
        observacao: `Falha ao chamar a IA (HTTP ${resp.status}). Mantido texto determinístico. Detalhe: ${err.slice(0, 200)}`,
      };
    }

    const data = (await resp.json()) as {
      content?: Array<{ type: string; text?: string }>;
    };
    const raw = data.content?.find((c) => c.type === "text")?.text ?? "";
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return { texto, origem: "deterministico", observacao: "Resposta da IA não retornou JSON válido; mantido texto determinístico." };
    }
    const parsed = JSON.parse(jsonMatch[0]) as Partial<RelatorioTexto>;

    // Mescla preservando a limitação de escopo fixa (não pode ser alterada pela IA).
    const refinado: RelatorioTexto = {
      resumoExecutivo: parsed.resumoExecutivo ?? texto.resumoExecutivo,
      analiseBalanco: parsed.analiseBalanco ?? texto.analiseBalanco,
      analiseResultado: parsed.analiseResultado ?? texto.analiseResultado,
      pontosAtencao: parsed.pontosAtencao ?? texto.pontosAtencao,
      recomendacoes: parsed.recomendacoes ?? texto.recomendacoes,
      conclusao: parsed.conclusao ?? texto.conclusao,
      limitacaoEscopo: texto.limitacaoEscopo, // fixo, não alterável
    };

    return { texto: refinado, origem: "ia", modelo, observacao: "Refinado por IA. Revisão humana obrigatória antes da emissão." };
  } catch (e) {
    return {
      texto,
      origem: "deterministico",
      observacao: `Erro inesperado na IA: ${(e as Error).message}. Mantido texto determinístico.`,
    };
  }
}
