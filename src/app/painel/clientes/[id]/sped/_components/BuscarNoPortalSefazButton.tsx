"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

/**
 * Dispara o robô que raspa o portal giam.sefaz.to.gov.br para trazer as
 * apurações efetivamente recepcionadas pela SEFAZ. Botão + input de ano.
 * Longa duração (2s-30s por competência × 10-12 meses) — mostra spinner.
 */
export function BuscarNoPortalSefazButton({
  clienteId,
  ano: anoDefault,
}: {
  clienteId: string;
  ano: number;
}) {
  const router = useRouter();
  const [ano, setAno] = useState(anoDefault);
  const [rodando, setRodando] = useState(false);
  const [resultado, setResultado] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  async function rodar() {
    setRodando(true);
    setResultado(null);
    setErro(null);
    try {
      const r = await fetch("/api/giam-sefaz/sincronizar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clienteId, ano }),
      });
      const j = await r.json();
      if (!r.ok || j.sucesso === false) {
        setErro(j.mensagem || j.erro || "Falha na sincronização.");
      } else {
        setResultado(j.mensagem || "Sincronizado.");
        router.refresh();
      }
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
    } finally {
      setRodando(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-2">
      <div className="flex items-center gap-2">
        <label className="text-xs text-slate-500">Ano</label>
        <input
          type="number"
          value={ano}
          min={2009}
          max={2100}
          onChange={(e) => setAno(Number(e.target.value))}
          disabled={rodando}
          className="w-20 rounded border border-slate-300 px-2 py-1 text-sm"
        />
        <button
          type="button"
          onClick={rodar}
          disabled={rodando}
          className="rounded-lg bg-slate-800 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50"
        >
          {rodando ? "Buscando no portal..." : "Buscar no portal SEFAZ"}
        </button>
      </div>
      {resultado && (
        <p className="rounded bg-emerald-50 px-2 py-1 text-xs text-emerald-700">
          {resultado}
        </p>
      )}
      {erro && (
        <p className="max-w-md rounded bg-red-50 px-2 py-1 text-xs text-red-700">
          {erro}
        </p>
      )}
    </div>
  );
}
