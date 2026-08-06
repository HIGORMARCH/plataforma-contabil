"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

export function SincronizarSimplesButton({
  clienteId,
  anoInicial,
  anoFinal,
}: {
  clienteId: string;
  anoInicial: number;
  anoFinal: number;
}) {
  const [rodando, setRodando] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const router = useRouter();

  async function sincronizar() {
    setRodando(true);
    setMsg(null);
    setErro(null);
    try {
      const res = await fetch("/api/simples-nacional/sincronizar", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ clienteId, anoInicial, anoFinal }),
      });
      const json = await res.json();
      if (!res.ok) {
        setErro(json.erro ?? `HTTP ${res.status}`);
      } else {
        setMsg(
          `✅ ${json.entregasEncontradas} entrega(s) — ${json.novas} nova(s), ${json.substituidas} atualizada(s)`,
        );
        startTransition(() => router.refresh());
      }
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
    } finally {
      setRodando(false);
    }
  }

  return (
    <div>
      <p className="mb-2 text-xs text-slate-500">
        Autentica no Portal do Simples Nacional com o <b>certificado digital</b> cadastrado
        no cliente e puxa as datas de transmissão de PGDAS-D e DEFIS pro range escolhido.
        Substitui entradas manuais anteriores das mesmas competências.
      </p>
      <button
        type="button"
        onClick={sincronizar}
        className="btn btn-primary"
        disabled={rodando}
      >
        {rodando ? "Sincronizando (Playwright leva 1-3 min)..." : "🤖 Sincronizar com Portal Simples"}
      </button>

      {erro && (
        <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">
          <p className="font-semibold">⛔ {erro}</p>
        </div>
      )}
      {msg && (
        <div className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
          <p className="font-semibold">{msg}</p>
        </div>
      )}
    </div>
  );
}
