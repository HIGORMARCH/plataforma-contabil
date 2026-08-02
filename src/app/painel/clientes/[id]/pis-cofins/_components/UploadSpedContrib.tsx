"use client";

import { useState, useTransition, useRef } from "react";
import { useRouter } from "next/navigation";
import { uploadSpedContribAction } from "../actions";

export function UploadSpedContrib({ clienteId }: { clienteId: string }) {
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<{ tipo: "ok" | "erro"; texto: string } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  function enviar() {
    const file = fileRef.current?.files?.[0];
    if (!file) return setMsg({ tipo: "erro", texto: "Escolha o arquivo primeiro." });
    startTransition(async () => {
      const fd = new FormData();
      fd.set("clienteId", clienteId);
      fd.set("file", file);
      const r = await uploadSpedContribAction(fd);
      if (r.ok) {
        setMsg({ tipo: "ok", texto: r.mensagem });
        if (fileRef.current) fileRef.current.value = "";
        router.refresh();
      } else {
        setMsg({ tipo: "erro", texto: r.erro });
      }
    });
  }

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3">
      <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
        Importar SPED-Contribuições (.txt)
      </div>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
        <input
          ref={fileRef}
          type="file"
          accept=".txt"
          className="block flex-1 text-sm text-slate-600 file:mr-2 file:rounded file:border file:border-slate-300 file:bg-slate-50 file:px-3 file:py-1 file:text-sm hover:file:bg-slate-100"
        />
        <button
          type="button"
          onClick={enviar}
          disabled={pending}
          className="btn btn-primary text-sm whitespace-nowrap"
        >
          {pending ? "Importando..." : "Importar"}
        </button>
      </div>
      {msg && (
        <p className={`mt-1 text-xs ${msg.tipo === "erro" ? "text-red-600" : "text-green-700"}`}>
          {msg.texto}
        </p>
      )}
    </div>
  );
}
