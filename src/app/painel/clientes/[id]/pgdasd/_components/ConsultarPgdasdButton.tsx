"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

interface Competencia {
  label: string;
  status: "ok" | "vazio" | "erro";
  detalhe: string;
}

/**
 * Dispara a consulta do PGDAS-D no SERPRO.
 *
 * O aviso de custo é deliberado: cada competência do intervalo é uma chamada
 * paga. A consulta externa nunca acontece sozinha — só por este botão.
 */
export function ConsultarPgdasdButton({
  clienteId,
  anoInicial,
  anoFinal,
}: {
  clienteId: string;
  anoInicial: number;
  anoFinal: number;
}) {
  const [rodando, setRodando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [resumo, setResumo] = useState<string | null>(null);
  const [competencias, setCompetencias] = useState<Competencia[]>([]);
  const [, startTransition] = useTransition();
  const router = useRouter();

  const meses = (anoFinal - anoInicial + 1) * 12;

  async function consultar() {
    setRodando(true);
    setErro(null);
    setResumo(null);
    setCompetencias([]);
    try {
      const res = await fetch("/api/pgdasd/consultar", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ clienteId, anoInicial, anoFinal }),
      });
      const json = await res.json();
      if (!res.ok) {
        setErro(json.erro ?? `HTTP ${res.status}`);
      } else {
        setResumo(
          `${json.declaracoes} declaração(ões) lida(s) · ${json.semDeclaracao} sem declaração · ${json.comErro} com erro`,
        );
        setCompetencias(json.competencias ?? []);
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
        Consulta a <b>última declaração transmitida</b> de cada competência no SERPRO Integra
        Contador (PGDASD · CONSULTIMADECREC14). O serviço devolve a declaração em PDF; a
        plataforma lê os valores em memória e <b>não guarda o arquivo</b>.
      </p>
      <p className="mb-3 text-xs text-amber-700">
        ⚠️ Cada competência é uma chamada paga — o intervalo atual pede até {meses} chamada(s),
        já recortadas pelo período de atendimento do cliente.
      </p>
      <button type="button" onClick={consultar} className="btn btn-primary" disabled={rodando}>
        {rodando
          ? "Consultando o SERPRO..."
          : `🔎 Consultar PGDAS-D ${anoInicial}${anoFinal !== anoInicial ? `–${anoFinal}` : ""}`}
      </button>

      {erro && (
        <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">
          <p className="font-semibold">⛔ {erro}</p>
        </div>
      )}

      {resumo && (
        <div className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
          <p className="font-semibold">{resumo}</p>
        </div>
      )}

      {competencias.length > 0 && (
        <ul className="mt-3 max-h-64 overflow-y-auto rounded-lg border border-slate-200 bg-white text-xs">
          {competencias.map((c) => (
            <li
              key={c.label}
              className="flex gap-2 border-b border-slate-100 px-3 py-1.5 last:border-b-0"
            >
              <span className="w-16 shrink-0 font-mono text-slate-500">{c.label}</span>
              <span
                className={
                  "w-14 shrink-0 font-semibold " +
                  (c.status === "ok"
                    ? "text-emerald-700"
                    : c.status === "erro"
                      ? "text-red-700"
                      : "text-slate-500")
                }
              >
                {c.status}
              </span>
              <span className="text-slate-600">{c.detalhe}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
