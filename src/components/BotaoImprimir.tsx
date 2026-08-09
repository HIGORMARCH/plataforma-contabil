"use client";

/**
 * Botão pra disparar window.print(). Compõe com uma folha de estilo
 * `@media print` na página que o hospeda — o botão em si só chama
 * window.print(); a página decide o que esconder/mostrar.
 */
export function BotaoImprimir({ rotulo = "🖨️ Imprimir" }: { rotulo?: string }) {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="rounded-md border border-slate-300 bg-white px-3 py-1 text-xs text-slate-700 transition hover:border-[var(--brand)] hover:text-[var(--brand)]"
    >
      {rotulo}
    </button>
  );
}
