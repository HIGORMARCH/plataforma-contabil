/**
 * Gerador de NOTA TÉCNICA CONTEXTUAL.
 *
 * Recebe a análise contábil-financeira JÁ CALCULADA + um "contexto do exercício"
 * escrito pelo contador (ex.: "primeiro ano de operação", "expansão com filial",
 * "retração por perda de contrato principal") e produz uma nota técnica formal
 * que interpreta os indicadores à luz desse contexto.
 *
 * Princípios (iguais aos demais módulos de IA):
 * - IA NÃO inventa números — recebe os fatos calculados e os reescreve;
 * - Assinatura do contador continua obrigatória;
 * - Se ANTHROPIC_API_KEY não estiver definida, devolve um esboço determinístico
 *   pra que a feature funcione mesmo sem a chave, com aviso claro.
 */

import type { ResultadoAnalise } from "../accounting/analyze";

export interface NotaTecnicaGerada {
  texto: string; // texto em Markdown (títulos, parágrafos, listas com "-")
  origem: "ia" | "deterministico";
  modelo?: string;
  observacao?: string;
}

const SYSTEM_PROMPT = `Você é um contador brasileiro sênior redigindo uma NOTA TÉCNICA CONTEXTUAL que acompanhará um relatório de análise econômico-financeira já emitido. O objetivo da nota é DEFENDER a empresa dos pontos críticos apontados por análise puramente quantitativa, sempre que houver JUSTIFICATIVA TÉCNICA à luz do contexto do exercício.

REGRAS INVIOLÁVEIS:
- NUNCA invente, altere ou crie números, percentuais ou classificações. Use apenas os fatos fornecidos.
- Se um dado necessário não estiver na análise, escreva "não informado" — não preencha lacunas.
- Trate cada indicador crítico da análise: reconheça, justifique com o contexto se aplicável, e proponha caminho de consolidação.
- Tom formal, técnico, defensável — texto que o contador pode assinar e apresentar a instituição financeira, comprador ou fiscalização.
- Estrutura fixa: 1. Objeto | 2. Contexto | 3. Investimentos e movimentações do exercício | 4. Exame dos indicadores reputados críticos | 5. Indicadores de viabilidade operacional | 6. Recomendações técnicas | 7. Documentos e cruzamentos que acompanham a nota | 8. Conclusão.
- Se o campo "anexos_cruzamentos" contiver itens, a Seção 7 deve LISTAR cada anexo/cruzamento com bullet "- Descrição do documento/cruzamento." e declarar que estão disponíveis para conferência. Se estiver vazio, escreva na Seção 7: "Nenhum documento adicional foi anexado a esta nota."
- Cada seção começa com "**N. TÍTULO**" em negrito.
- Sub-itens dentro das seções: "**N.M** — Descrição." (negrito na numeração e travessão).
- Use travessão (—) em vez de dois-pontos quando abrir uma explicação.
- Nunca use emojis, ícones, marcadores gráficos. Apenas texto puro em Markdown.
- Encerre a nota com "Recomenda-se, portanto, a REVISÃO da análise anteriormente realizada, à luz do contexto ora exposto e dos documentos que acompanham esta nota."`;

function esbocoDeterministico(analise: ResultadoAnalise, contexto: string, cliente?: string, ano?: number): string {
  const empresa = cliente ?? "a empresa analisada";
  const exerc = ano ? String(ano) : "do exercício analisado";
  return [
    `**NOTA TÉCNICA CONTEXTUAL**`,
    ``,
    `Empresa: ${empresa}`,
    `Exercício: ${exerc}`,
    ``,
    `**1. OBJETO**`,
    ``,
    `Esta nota tem por objeto contextualizar os indicadores econômico-financeiros de ${empresa} referentes ao exercício ${exerc} e demonstrar que os pontos identificados como críticos pela análise quantitativa decorrem, na medida do exposto adiante, do momento específico da entidade.`,
    ``,
    `**2. CONTEXTO**`,
    ``,
    contexto || "(Contexto do exercício não informado pelo contador — preencher antes da assinatura.)",
    ``,
    `**3. EXAME DOS INDICADORES REPUTADOS CRÍTICOS**`,
    ``,
    `(Rascunho determinístico — para geração completa com base nos indicadores calculados, configure ANTHROPIC_API_KEY no ambiente.)`,
    ``,
    `**7. CONCLUSÃO**`,
    ``,
    `Recomenda-se, portanto, a REVISÃO da análise anteriormente realizada, para que os indicadores sejam interpretados à luz do contexto ora exposto.`,
  ].join("\n");
}

export async function gerarNotaTecnica(
  analise: ResultadoAnalise,
  contexto: string,
  meta: {
    cliente?: string; ano?: number; contador?: string; crc?: string; cidade?: string;
    anexos?: string[]; // lista de anexos/cruzamentos que acompanham a nota
  } = {},
): Promise<NotaTecnicaGerada> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return {
      texto: esbocoDeterministico(analise, contexto, meta.cliente, meta.ano),
      origem: "deterministico",
      observacao: "ANTHROPIC_API_KEY não configurada — texto é apenas um esboço. Configure a chave para geração completa.",
    };
  }

  const modelo = process.env.ANTHROPIC_MODEL || "claude-sonnet-4-6";
  const payload = {
    contexto_exercicio: contexto || "(não informado)",
    empresa: meta.cliente ?? "(não informada)",
    ano: meta.ano ?? "(não informado)",
    contador_responsavel: meta.contador ?? "(não informado)",
    crc: meta.crc ?? "(não informado)",
    cidade: meta.cidade ?? "(não informada)",
    anexos_cruzamentos: (meta.anexos ?? []).filter((a) => a.trim()),
    analise, // ResultadoAnalise inteiro — inclui indicadores, situação, dados dos demonstrativos
  };

  try {
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
              "Gere a NOTA TÉCNICA CONTEXTUAL a partir dos dados abaixo. Responda APENAS com o texto da nota (Markdown), sem preâmbulo, sem cercas de código, sem JSON.\n\n" +
              JSON.stringify(payload),
          },
        ],
      }),
    });

    if (!resp.ok) {
      const err = await resp.text();
      return {
        texto: esbocoDeterministico(analise, contexto, meta.cliente, meta.ano),
        origem: "deterministico",
        observacao: `Falha ao chamar a IA (HTTP ${resp.status}). Detalhe: ${err.slice(0, 200)}`,
      };
    }

    const data = (await resp.json()) as { content?: Array<{ type: string; text?: string }> };
    const texto = data.content?.find((c) => c.type === "text")?.text?.trim() ?? "";
    if (!texto) {
      return {
        texto: esbocoDeterministico(analise, contexto, meta.cliente, meta.ano),
        origem: "deterministico",
        observacao: "Resposta vazia da IA — mantido esboço determinístico.",
      };
    }
    return {
      texto,
      origem: "ia",
      modelo,
      observacao: "Gerada por IA a partir dos dados calculados. Revisão e assinatura do contador são obrigatórias.",
    };
  } catch (e) {
    return {
      texto: esbocoDeterministico(analise, contexto, meta.cliente, meta.ano),
      origem: "deterministico",
      observacao: `Erro inesperado na IA: ${(e as Error).message}`,
    };
  }
}
