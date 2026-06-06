/**
 * Refino OPCIONAL da extração por IA (quando há ANTHROPIC_API_KEY).
 * A IA apenas LÊ o texto do documento e mapeia para as chaves canônicas —
 * não inventa números. O resultado ainda passa por conferência humana.
 */

import { TODOS_CAMPOS, parseNumero } from "../import";
import type { Maybe } from "../accounting/types";

export async function extrairComIA(linhas: string[]): Promise<Record<string, Maybe> | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;

  const chaves = TODOS_CAMPOS.map((c) => `${c.chave} = ${c.rotulo}`).join("\n");
  const texto = linhas.join("\n").slice(0, 12000);

  try {
    const resp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: process.env.ANTHROPIC_MODEL || "claude-sonnet-4-6",
        max_tokens: 1500,
        system:
          "Você extrai saldos de demonstrativos contábeis (Balanço/DRE) a partir do texto bruto. " +
          "Mapeie cada conta para a chave canônica correspondente. NUNCA invente valores: use apenas números presentes no texto. " +
          "Se uma conta não existir no documento, omita a chave. Valores sempre positivos (módulo), em número (ponto decimal). " +
          "Responda APENAS com um objeto JSON { chave: numero }.",
        messages: [
          {
            role: "user",
            content: `Chaves canônicas disponíveis:\n${chaves}\n\nTexto do documento:\n${texto}`,
          },
        ],
      }),
    });
    if (!resp.ok) return null;
    const data = (await resp.json()) as { content?: Array<{ type: string; text?: string }> };
    const raw = data.content?.find((c) => c.type === "text")?.text ?? "";
    const m = raw.match(/\{[\s\S]*\}/);
    if (!m) return null;
    const obj = JSON.parse(m[0]) as Record<string, unknown>;
    const chavesValidas = new Set(TODOS_CAMPOS.map((c) => c.chave));
    const out: Record<string, Maybe> = {};
    for (const [k, v] of Object.entries(obj)) {
      if (chavesValidas.has(k)) out[k] = parseNumero(v as string | number);
    }
    return out;
  } catch {
    return null;
  }
}
