"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { sincronizarDctfWebAction } from "../actions";

export function SincronizarDctfWebButton({
  clienteId,
  ano,
}: {
  clienteId: string;
  ano: number;
}) {
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<{ tipo: "ok" | "erro" | "info"; texto: string } | null>(null);
  const router = useRouter();

  function sincronizar() {
    startTransition(async () => {
      setMsg({ tipo: "info", texto: `Consultando DCTFWeb ${ano}...` });
      const fd = new FormData();
      fd.set("clienteId", clienteId);
      fd.set("ano", String(ano));
      const r = await sincronizarDctfWebAction(fd);
      setMsg({ tipo: r.ok ? "ok" : "erro", texto: r.mensagem });
      if (r.ok) router.refresh();
    });
  }

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3">
      <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
        Sincronizar DCTFWeb (via SERPRO)
      </div>
      <button
        type="button"
        onClick={sincronizar}
        disabled={pending}
        className="btn btn-accent text-sm"
      >
        {pending ? "Sincronizando..." : `🔄 Buscar DCTFWeb ${ano}`}
      </button>
      {msg && (
        <p
          className={`mt-1 text-xs ${
            msg.tipo === "erro" ? "text-red-600" : msg.tipo === "ok" ? "text-green-700" : "text-slate-500"
          }`}
        >
          {msg.texto}
        </p>
      )}
    </div>
  );
}
