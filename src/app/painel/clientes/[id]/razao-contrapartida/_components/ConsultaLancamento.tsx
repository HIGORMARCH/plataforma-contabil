"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

interface Props {
  clienteId: string;
  ano: number;
  numeroAtual: string;
  suportado: boolean;
}

export function ConsultaLancamento({
  clienteId,
  ano,
  numeroAtual,
  suportado,
}: Props) {
  const router = useRouter();
  const [num, setNum] = useState(numeroAtual);
  const [pending, startTransition] = useTransition();

  function ir(novoNum: string) {
    startTransition(() => {
      const p = new URLSearchParams();
      p.set("ano", String(ano));
      p.set("aba", "lancamento");
      if (novoNum) p.set("numero", novoNum);
      router.push(
        `/painel/clientes/${clienteId}/razao-contrapartida?${p.toString()}`,
      );
    });
  }

  return (
    <div className="mb-4 flex flex-wrap items-end gap-3 rounded border border-[var(--rule)] bg-[var(--paper)] px-4 py-3">
      <div className="flex-1 min-w-[220px]">
        <div className="eyebrow mb-1">Número do lançamento</div>
        <div className="flex gap-2">
          <input
            className="input font-mono text-sm"
            value={num}
            placeholder="ex.: 67980"
            onChange={(e) => setNum(e.target.value.trim())}
            onKeyDown={(e) => {
              if (e.key === "Enter" && suportado) ir(num);
            }}
            disabled={!suportado}
          />
          <button
            type="button"
            className="btn btn-accent"
            disabled={pending || !suportado}
            onClick={() => ir(num)}
          >
            {pending ? "Buscando..." : "Consultar"}
          </button>
        </div>
        {!suportado && (
          <p className="mt-2 text-[11px] text-[var(--ink-soft)]">
            Consulta por número exige ECD tipo G (Diário completo). O arquivo
            transmitido este ano não traz lançamentos individuais.
          </p>
        )}
      </div>
    </div>
  );
}
