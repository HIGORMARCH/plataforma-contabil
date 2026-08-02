"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { varrerPastaSpedAction } from "../actions";

export function VarrerPastaButton({
  clienteId,
  pastaSugerida,
}: {
  clienteId: string;
  pastaSugerida?: string | null;
}) {
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<{ tipo: "ok" | "erro" | "info"; texto: string } | null>(null);
  const [detalhes, setDetalhes] = useState<Array<{ arquivo: string; periodo?: string; acao: string }>>([]);
  const [mostrarDetalhes, setMostrarDetalhes] = useState(false);
  const [pasta, setPasta] = useState(pastaSugerida ?? "");
  const router = useRouter();

  function varrer() {
    startTransition(async () => {
      setMsg({ tipo: "info", texto: "Varrendo pasta..." });
      const fd = new FormData();
      fd.set("clienteId", clienteId);
      fd.set("pasta", pasta);
      const r = await varrerPastaSpedAction(fd);
      if (r.ok) {
        setMsg({ tipo: "ok", texto: r.resumo });
        setDetalhes(r.detalhes);
        router.refresh();
      } else {
        setMsg({ tipo: "erro", texto: r.erro });
        setDetalhes([]);
      }
    });
  }

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3">
      <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
        Varrer pasta (importa TODOS os SPED-Contribuições de uma vez)
      </div>
      <div className="mb-2">
        <input
          type="text"
          value={pasta}
          onChange={(e) => setPasta(e.target.value)}
          placeholder={pastaSugerida ?? `D:\\SPED\\CLIENTES\\...\\EFD CONTRIBUIÇÕES`}
          className="input font-mono text-xs"
        />
        <p className="mt-1 text-[11px] text-slate-500">
          {pastaSugerida
            ? `Sugerida (pastaFiscal cadastrada): ${pastaSugerida}. Pode ajustar.`
            : "Cadastre pastaFiscal no cliente pra ter default. Ou digite aqui direto."}
        </p>
      </div>
      <button
        type="button"
        onClick={varrer}
        disabled={pending}
        className="btn btn-accent text-sm"
      >
        {pending ? "Varrendo..." : "🔎 Varrer e importar tudo"}
      </button>
      {msg && (
        <p
          className={`mt-2 text-xs ${
            msg.tipo === "erro" ? "text-red-600" : msg.tipo === "ok" ? "text-green-700" : "text-slate-500"
          }`}
        >
          {msg.texto}
        </p>
      )}
      {detalhes.length > 0 && (
        <div className="mt-2">
          <button
            type="button"
            onClick={() => setMostrarDetalhes((v) => !v)}
            className="text-xs text-slate-500 underline"
          >
            {mostrarDetalhes ? "Esconder detalhes" : `Ver detalhes por arquivo (${detalhes.length})`}
          </button>
          {mostrarDetalhes && (
            <ul className="mt-1 max-h-64 overflow-y-auto rounded border border-slate-100 bg-slate-50 p-2 text-[11px]">
              {detalhes.map((d, i) => (
                <li key={i} className="font-mono">
                  <span className="text-slate-500">{d.arquivo}</span>
                  {d.periodo ? <span> — {d.periodo}</span> : null}
                  <span className="ml-1 text-slate-600">→ {d.acao}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
