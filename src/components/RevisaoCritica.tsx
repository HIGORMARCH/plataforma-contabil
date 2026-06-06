"use client";

import { useState } from "react";

interface Observacao { tipo: "divergencia" | "omissao" | "excesso"; texto: string }
interface Revisao {
  alinhamento: "alinhado" | "atencao" | "divergente";
  resumo: string;
  observacoes: Observacao[];
  perguntas: string[];
  textoIA?: string;
  origem: "ia" | "deterministico";
  observacaoIA?: string;
  erro?: string;
}

const COR_ALINHAMENTO: Record<string, string> = {
  alinhado: "bg-green-50 border-green-200 text-green-800",
  atencao: "bg-amber-50 border-amber-200 text-amber-800",
  divergente: "bg-red-50 border-red-200 text-red-800",
};
const ROTULO_ALINHAMENTO: Record<string, string> = {
  alinhado: "✓ Conclusão coerente com os dados",
  atencao: "⚠ Pontos a revisar",
  divergente: "⛔ Divergência com os dados",
};
const ICONE_TIPO: Record<string, string> = { divergencia: "⛔", omissao: "👁", excesso: "❗" };

export function RevisaoCritica({ relatorioId }: { relatorioId: string }) {
  const [estado, setEstado] = useState<"idle" | "carregando" | "ok" | "erro">("idle");
  const [rev, setRev] = useState<Revisao | null>(null);
  const [msg, setMsg] = useState("");

  async function analisar() {
    setEstado("carregando");
    setMsg("Confrontando sua conclusão com os dados...");
    setRev(null);
    // Lê o rascunho atual dos campos da revisão (sem precisar salvar antes).
    const conclusaoEl = document.querySelector<HTMLTextAreaElement>('textarea[name="conclusao"]');
    const comentarioEl = document.querySelector<HTMLTextAreaElement>('textarea[name="comentario"]');
    const conclusao = (conclusaoEl?.value ?? "").split("\n").map((l) => l.trim()).filter(Boolean);
    const comentario = comentarioEl?.value ?? "";
    try {
      const r = await fetch(`/api/relatorios/${relatorioId}/revisao-critica`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ conclusao, comentario }),
      });
      const data = (await r.json()) as Revisao;
      if (!r.ok || data.erro) {
        setEstado("erro");
        setMsg(data.erro || "Falha ao gerar a revisão.");
        return;
      }
      setRev(data);
      setEstado("ok");
    } catch (e) {
      setEstado("erro");
      setMsg(`Erro: ${(e as Error).message}`);
    }
  }

  return (
    <div className="mt-4 border-t border-slate-100 pt-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-bold text-slate-700">🤔 Revisão crítica (anti-viés)</p>
          <p className="text-xs text-slate-500">
            A IA confronta a SUA conclusão com os dados, para reduzir viés de confirmação. Não altera nada — é um parecer para você decidir.
          </p>
        </div>
        <button type="button" onClick={analisar} className="btn btn-ghost whitespace-nowrap" disabled={estado === "carregando"}>
          {estado === "carregando" ? "Analisando..." : "Revisar meu raciocínio"}
        </button>
      </div>

      {estado === "carregando" && <p className="mt-2 text-xs text-slate-500">{msg}</p>}
      {estado === "erro" && <p className="mt-2 text-xs text-red-600">{msg}</p>}

      {rev && (
        <div className="mt-3 space-y-3">
          <div className={`rounded-lg border p-3 ${COR_ALINHAMENTO[rev.alinhamento]}`}>
            <p className="text-sm font-bold">{ROTULO_ALINHAMENTO[rev.alinhamento]}</p>
            <p className="mt-0.5 text-xs">{rev.resumo}</p>
          </div>

          {rev.observacoes.length > 0 && (
            <div>
              <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Observações</p>
              <ul className="space-y-1">
                {rev.observacoes.map((o, i) => (
                  <li key={i} className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-700">
                    <span className="mr-1">{ICONE_TIPO[o.tipo]}</span>
                    {o.texto}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div>
            <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Perguntas para você refletir</p>
            <ul className="list-disc space-y-1 pl-5 text-xs text-slate-600">
              {rev.perguntas.map((p, i) => (
                <li key={i}>{p}</li>
              ))}
            </ul>
          </div>

          {rev.textoIA && (
            <div className="rounded-lg border border-[var(--brand-2)] bg-[var(--brand-2-soft)] p-3">
              <p className="mb-1 text-xs font-bold text-slate-700">Parecer crítico da IA</p>
              <div className="space-y-1 whitespace-pre-line text-xs text-slate-700">{rev.textoIA}</div>
            </div>
          )}

          {rev.observacaoIA && <p className="text-[11px] text-slate-400">{rev.observacaoIA}</p>}
        </div>
      )}
    </div>
  );
}
