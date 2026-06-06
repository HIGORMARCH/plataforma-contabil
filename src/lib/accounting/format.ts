/** Formatação numérica no padrão brasileiro. */

import type { Maybe } from "./types";

export function moeda(v: Maybe): string {
  if (v === null || v === undefined) return "—";
  return v.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function indice(v: Maybe, casas = 2): string {
  if (v === null || v === undefined) return "—";
  return v.toLocaleString("pt-BR", {
    minimumFractionDigits: casas,
    maximumFractionDigits: casas,
  });
}

export function percentual(v: Maybe, casas = 1): string {
  if (v === null || v === undefined) return "—";
  return (
    (v * 100).toLocaleString("pt-BR", {
      minimumFractionDigits: casas,
      maximumFractionDigits: casas,
    }) + "%"
  );
}

export function dias(v: Maybe): string {
  if (v === null || v === undefined) return "—";
  return `${Math.round(v)} dias`;
}

/** Variação percentual entre dois valores (base → atual). */
export function variacaoPct(base: Maybe, atual: Maybe): Maybe {
  if (base === null || base === undefined || base === 0) return null;
  if (atual === null || atual === undefined) return null;
  return (atual - base) / Math.abs(base);
}
