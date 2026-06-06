"use client";

import { useState } from "react";

interface Campo {
  valor: number | null;
  trecho: string;
  confianca: "alta" | "media";
}
interface Resposta {
  ano: number | null;
  origem: "heuristica" | "ia" | "plano_contas";
  totalLinhas: number;
  campos: Record<string, Campo>;
  erro?: string;
}

const ROTULO_ORIGEM: Record<Resposta["origem"], string> = {
  plano_contas: " (plano de contas com código D/C — balanço reconciliado)",
  ia: " (com auxílio de IA)",
  heuristica: "",
};

function formatarBR(v: number): string {
  return v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function ExtrairPDF() {
  const [estado, setEstado] = useState<"idle" | "processando" | "ok" | "erro">("idle");
  const [msg, setMsg] = useState<string>("");
  const [resumo, setResumo] = useState<{ chave: string; campo: Campo }[]>([]);

  async function enviar(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setEstado("processando");
    setMsg("Lendo o PDF e extraindo os saldos...");
    setResumo([]);

    try {
      const fd = new FormData();
      fd.append("arquivo", file);
      const r = await fetch("/api/extrair-pdf", { method: "POST", body: fd });
      const data = (await r.json()) as Resposta;
      if (!r.ok || data.erro) {
        setEstado("erro");
        setMsg(data.erro || "Falha ao processar o PDF.");
        return;
      }

      // Preenche o ano.
      if (data.ano) {
        document.querySelectorAll<HTMLInputElement>('input[name="ano"]').forEach((i) => {
          i.value = String(data.ano);
        });
      }

      // Preenche os campos e destaca.
      const preenchidos: { chave: string; campo: Campo }[] = [];
      for (const [chave, campo] of Object.entries(data.campos)) {
        if (campo.valor === null) continue;
        const input = document.getElementById(chave) as HTMLInputElement | null;
        if (input) {
          input.value = formatarBR(campo.valor);
          input.classList.add("ring-2", "ring-[var(--brand-2)]", "bg-teal-50");
          preenchidos.push({ chave, campo });
        }
      }

      setResumo(preenchidos);
      setEstado("ok");
      setMsg(
        `${preenchidos.length} campo(s) preenchido(s) automaticamente a partir de ${data.totalLinhas} linhas` +
          ROTULO_ORIGEM[data.origem] +
          ". Confira os valores destacados antes de salvar.",
      );
    } catch (err) {
      setEstado("erro");
      setMsg(`Erro: ${(err as Error).message}`);
    } finally {
      e.target.value = "";
    }
  }

  return (
    <section className="card mb-6 border-l-4 border-l-[var(--brand-2)] p-5">
      <h2 className="mb-1 text-sm font-bold uppercase tracking-wide text-slate-500">
        📄 Extrair de PDF (Balanço / DRE)
      </h2>
      <p className="mb-3 text-xs text-slate-500">
        Envie o PDF do Balanço Patrimonial ou da DRE. A plataforma extrai os saldos e{" "}
        <b>pré-preenche o formulário abaixo para sua conferência</b> — nada é salvo automaticamente.
      </p>

      <label className="btn btn-accent cursor-pointer">
        {estado === "processando" ? "Processando..." : "Selecionar PDF"}
        <input
          type="file"
          accept="application/pdf,.pdf"
          className="hidden"
          onChange={enviar}
          disabled={estado === "processando"}
        />
      </label>

      {msg && (
        <div
          className={`mt-3 rounded-lg px-3 py-2 text-sm ${
            estado === "erro"
              ? "bg-red-50 text-red-700"
              : estado === "ok"
                ? "bg-green-50 text-green-700"
                : "bg-slate-50 text-slate-600"
          }`}
        >
          {msg}
        </div>
      )}

      {resumo.length > 0 && (
        <details className="mt-3 text-xs text-slate-600">
          <summary className="cursor-pointer font-medium text-slate-700">
            Ver trechos de origem ({resumo.length})
          </summary>
          <ul className="mt-2 space-y-1">
            {resumo.map(({ chave, campo }) => (
              <li key={chave} className="flex justify-between gap-3 border-b border-slate-100 py-1">
                <span className="font-mono text-[11px] text-slate-400">{chave}</span>
                <span className="flex-1 truncate text-slate-600" title={campo.trecho}>
                  {campo.trecho}
                </span>
                {campo.confianca === "media" && (
                  <span className="rounded bg-amber-100 px-1 text-[10px] text-amber-700">revisar</span>
                )}
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}
