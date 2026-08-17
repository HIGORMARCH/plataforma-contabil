"use client";

/**
 * Dispara a impressão do relatório. Ganha `.no-print` e `.btn` — as duas classes
 * já são escondidas pelo @media print do globals.css, então o botão nunca sai
 * no papel.
 */
export function BotaoImprimir() {
  return (
    <button type="button" className="btn no-print" onClick={() => window.print()}>
      Imprimir para conferência
    </button>
  );
}
