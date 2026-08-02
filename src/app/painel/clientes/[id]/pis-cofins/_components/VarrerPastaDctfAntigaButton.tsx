"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { varrerPastaDctfAntigaAction, type ResultadoDctfDetalhes } from "../actions";

export function VarrerPastaDctfAntigaButton({ clienteId }: { clienteId: string }) {
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<{ tipo: "ok" | "erro" | "info"; texto: string } | null>(null);
  const [detalhes, setDetalhes] = useState<ResultadoDctfDetalhes[]>([]);
  const [mostrar, setMostrar] = useState(false);
  const [pasta, setPasta] = useState("");
  const router = useRouter();

  function varrer() {
    startTransition(async () => {
      setMsg({ tipo: "info", texto: "Varrendo pasta .dec..." });
      const fd = new FormData();
      fd.set("clienteId", clienteId);
      fd.set("pasta", pasta);
      const r = await varrerPastaDctfAntigaAction(fd);
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
        DCTF antiga (.dec — 2022 e anteriores)
      </div>
      <input
        type="text"
        value={pasta}
        onChange={(e) => setPasta(e.target.value)}
        placeholder={`Z:\\...\\DECLARAÇÕES\\DCTF\\2022`}
        className="input font-mono text-xs mb-2"
      />
      <button type="button" onClick={varrer} disabled={pending} className="btn btn-accent text-sm">
        {pending ? "Varrendo..." : "🗂️ Varrer .dec e importar"}
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
            onClick={() => setMostrar((v) => !v)}
            className="text-xs text-slate-500 underline"
          >
            {mostrar ? "Esconder" : `Ver detalhes (${detalhes.length})`}
          </button>
          {mostrar && (
            <ul className="mt-1 max-h-64 overflow-y-auto rounded border border-slate-100 bg-slate-50 p-2 text-[11px]">
              {detalhes.map((d, i) => (
                <li key={i} className="font-mono">
                  <span className="text-slate-500">{d.arquivo}</span>
                  {d.periodo ? <span> — {d.periodo}</span> : null}
                  {d.pis ? <span> · PIS {d.pis}</span> : null}
                  {d.cofins ? <span> · COFINS {d.cofins}</span> : null}
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
