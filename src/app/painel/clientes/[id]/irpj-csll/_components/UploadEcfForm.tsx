"use client";

import { useState, useTransition, useRef } from "react";
import { useRouter } from "next/navigation";
import { uploadEcfAction } from "../actions";

export function UploadEcfForm({ clienteId }: { clienteId: string }) {
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<{ tipo: "ok" | "erro"; texto: string } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  function submit() {
    const file = fileRef.current?.files?.[0];
    if (!file) {
      setMsg({ tipo: "erro", texto: "Escolha um arquivo .txt do SPED-ECF." });
      return;
    }
    startTransition(async () => {
      const fd = new FormData();
      fd.set("clienteId", clienteId);
      fd.set("file", file);
      const r = await uploadEcfAction(fd);
      if (r.ok) {
        setMsg({ tipo: "ok", texto: `${r.mensagem}${r.ano ? ` (ano ${r.ano})` : ""}` });
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
        Importar ECF (.txt) manualmente
      </div>
      <input
        type="file"
        ref={fileRef}
        accept=".txt,.ecf,.sped"
        className="text-xs"
      />
      <button
        type="button"
        onClick={submit}
        disabled={pending}
        className="btn btn-accent mt-2 text-sm"
      >
        {pending ? "Importando..." : "📤 Importar"}
      </button>
      {msg && (
        <p className={`mt-2 text-xs ${msg.tipo === "erro" ? "text-red-600" : "text-green-700"}`}>
          {msg.texto}
        </p>
      )}
    </div>
  );
}
