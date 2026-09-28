"use client";
import { useActionState } from "react";
import { importarRaicmsSiagriAction } from "../siagri-actions";

/** Upload de um ou vários RAICMS do Siagri (PDF). Cada um cai no estabelecimento do seu CNPJ. */
export function UploadRaicmsSiagri({ clienteId }: { clienteId: string }) {
  const [resultado, enviar, enviando] = useActionState(
    importarRaicmsSiagriAction.bind(null, clienteId),
    null,
  );

  return (
    <div>
      <form action={enviar} className="flex flex-wrap items-center gap-3">
        <input
          type="file"
          name="arquivos"
          multiple
          accept=".pdf,application/pdf"
          disabled={enviando}
          className="text-sm file:mr-3 file:rounded-md file:border-0 file:bg-slate-100 file:px-3 file:py-2 file:text-sm file:font-medium hover:file:bg-slate-200"
        />
        <button className="btn btn-primary text-sm" disabled={enviando}>
          {enviando ? "Lendo..." : "Importar RAICMS"}
        </button>
      </form>
      {resultado && resultado.itens.length > 0 && (
        <ul className="mt-3 space-y-1 text-xs">
          {resultado.itens.map((i) => (
            <li
              key={i.arquivo}
              className={`rounded border px-2 py-1 ${i.ok ? "border-emerald-200 bg-emerald-50 text-emerald-900" : "border-red-200 bg-red-50 text-red-900"}`}
            >
              <b>{i.arquivo}</b> — {i.mensagem}
              {i.alertas.map((a) => (
                <span key={a} className="block text-amber-800">⚠ {a}</span>
              ))}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
