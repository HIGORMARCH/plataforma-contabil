"use client";

export function BotaoImprimirDossie() {
  return (
    <button type="button" className="btn btn-primary no-print" onClick={() => window.print()}>
      Imprimir dossiê
    </button>
  );
}
