"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

interface Props {
  clienteId: string;
  ano: number;
  contaAtual: string;
}

/**
 * Barra de seleção do código da conta. Atualiza a URL — a page.tsx
 * renderiza baseado no que veio do searchParams.
 */
export function SeletorConta({ clienteId, ano, contaAtual }: Props) {
  const router = useRouter();
  const [cod, setCod] = useState(contaAtual);
  const [pending, startTransition] = useTransition();

  function ir(novoCod: string) {
    startTransition(() => {
      const p = new URLSearchParams();
      p.set("ano", String(ano));
      p.set("aba", "conta");
      if (novoCod) p.set("conta", novoCod);
      router.push(
        `/painel/clientes/${clienteId}/razao-contrapartida?${p.toString()}`,
      );
    });
  }

  return (
    <div className="mb-4 flex flex-wrap items-end gap-3 rounded border border-[var(--rule)] bg-[var(--paper)] px-4 py-3">
      <div className="flex-1 min-w-[220px]">
        <div className="eyebrow mb-1">Código da conta</div>
        <div className="flex gap-2">
          <input
            className="input font-mono text-sm"
            value={cod}
            placeholder="ex.: 5"
            onChange={(e) => setCod(e.target.value.trim())}
            onKeyDown={(e) => {
              if (e.key === "Enter") ir(cod);
            }}
          />
          <button
            type="button"
            className="btn btn-accent"
            disabled={pending}
            onClick={() => ir(cod)}
          >
            {pending ? "Buscando..." : "Abrir razão"}
          </button>
        </div>
      </div>
    </div>
  );
}
