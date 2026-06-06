"use client";

import { useState } from "react";

export function CopiarLink({ url }: { url: string }) {
  const [copiado, setCopiado] = useState(false);
  return (
    <div className="flex items-center gap-2">
      <input readOnly value={url} className="input flex-1 text-xs" onFocus={(e) => e.currentTarget.select()} />
      <button
        type="button"
        className="btn btn-accent whitespace-nowrap"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(url);
          } catch {
            /* fallback: o usuário pode copiar manualmente */
          }
          setCopiado(true);
          setTimeout(() => setCopiado(false), 2000);
        }}
      >
        {copiado ? "✓ Copiado" : "Copiar link"}
      </button>
    </div>
  );
}
