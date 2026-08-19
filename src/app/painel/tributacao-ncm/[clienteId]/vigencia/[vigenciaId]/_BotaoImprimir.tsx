"use client";

/**
 * Botão de impressão do relatório. Client component só por causa do onClick —
 * some no papel porque `.btn` está na lista de elementos ocultos do @media
 * print em globals.css.
 */
export function BotaoImprimir() {
  return (
    <button type="button" className="btn no-print" onClick={() => window.print()}>
      Imprimir relatório
    </button>
  );
}
