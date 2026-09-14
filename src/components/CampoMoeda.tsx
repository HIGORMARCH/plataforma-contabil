"use client";

import { parseNumero } from "@/lib/import";

function formatarBR(v: number): string {
  return v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/**
 * Campo de valor em reais: abre formatado (1.980.951,65) e reformata ao sair
 * do campo. Antes o valor salvo aparecia cru (1980951.65).
 */
export function CampoMoeda({ id, valorInicial }: { id: string; valorInicial: number | null }) {
  return (
    <input
      id={id}
      name={id}
      type="text"
      inputMode="decimal"
      className="input text-right tabular-nums"
      defaultValue={valorInicial == null ? "" : formatarBR(valorInicial)}
      placeholder="0,00"
      onBlur={(e) => {
        const input = e.currentTarget;
        const v = parseNumero(input.value);
        if (v === null) return;
        const formatado = formatarBR(v);
        if (formatado === input.value) return;
        input.value = formatado;
        input.dispatchEvent(new Event("input", { bubbles: true }));
      }}
    />
  );
}
