"use client";
import { useActionState } from "react";
import { buscarNaPlanilhaAction } from "../estabelecimentos-actions";

/**
 * Preenche o cadastro com a planilha do escritório — só campos vazios, só
 * quando clicado. Mostra o que foi preenchido por estabelecimento (nomes dos
 * campos, nunca o valor de senha).
 */
export function BuscarNaPlanilhaButton({ clienteId }: { clienteId: string }) {
  const [resultado, executar, rodando] = useActionState(
    buscarNaPlanilhaAction.bind(null, clienteId),
    null,
  );

  return (
    <div className="inline-block">
      <form action={executar} className="inline">
        <button
          disabled={rodando}
          className="mt-1 text-xs text-[var(--ink-soft)] underline decoration-dotted underline-offset-2 hover:text-[var(--brand-deep)] disabled:opacity-50"
        >
          {rodando ? "lendo a planilha..." : "buscar na planilha"}
        </button>
      </form>
      {resultado && (
        <div
          className={
            "mt-2 max-w-xl rounded-lg border px-3 py-2 text-xs " +
            (resultado.ok ? "border-slate-200 bg-white text-slate-600" : "border-red-200 bg-red-50 text-red-700")
          }
        >
          <p className="font-medium">{resultado.mensagem}</p>
          {resultado.estabelecimentos.length > 0 && (
            <ul className="mt-1 space-y-0.5">
              {resultado.estabelecimentos.map((e) => (
                <li key={e.cnpj}>
                  <b>{e.rotulo}</b>:{" "}
                  {!e.encontrado
                    ? "CNPJ não está na planilha"
                    : e.preenchidos.length > 0
                      ? `preenchido ${e.preenchidos.join(", ")}`
                      : "nada a preencher (campos já preenchidos)"}
                  {e.avisos.map((a) => (
                    <span key={a} className="block text-amber-700">
                      ⚠ {a}
                    </span>
                  ))}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
