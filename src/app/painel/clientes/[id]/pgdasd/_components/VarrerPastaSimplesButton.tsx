"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

interface Resultado {
  pastaLida: string;
  pdfsEncontrados: number;
  guiasGravadas: number;
  pagamentosGravados: number;
  ignorados: Array<{ arquivo: string; motivo: string }>;
  alertas: string[];
}

/**
 * Lê os PDFs que já estão na pasta do cliente: guias DAS e comprovantes de
 * arrecadação. Diferente da consulta ao SERPRO, isto não custa nada — por isso
 * pode rodar quantas vezes quiser.
 */
/** Ano do arquivo pelo caminho organizado ("<ANO>\guia.pdf") ou pelo nome ("DAS-12.2025.pdf"). */
function anoDoArquivo(arquivo: string): number | null {
  const m = /(?:^|[\\/])((?:19|20)\d{2})[\\/]/.exec(arquivo) ?? /(?:^|\D)((?:19|20)\d{2})(?:\D|$)/.exec(arquivo);
  return m ? Number(m[1]) : null;
}

export function VarrerPastaSimplesButton({ clienteId, ano }: { clienteId: string; ano: number }) {
  const [rodando, setRodando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [res, setRes] = useState<Resultado | null>(null);
  const [, startTransition] = useTransition();
  const router = useRouter();

  const ignoradosAno = (res?.ignorados ?? []).filter((x) => anoDoArquivo(x.arquivo) === ano);

  async function varrer() {
    setRodando(true);
    setErro(null);
    setRes(null);
    try {
      const r = await fetch("/api/pgdasd/varrer-pasta", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ clienteId }),
      });
      const json = await r.json();
      if (!r.ok) setErro(json.erro ?? `HTTP ${r.status}`);
      else {
        setRes(json);
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
      <p className="mb-3 text-xs text-slate-500">
        Lê os PDFs de <b>FISCAL\IMPOSTOS\SIMPLES NACIONAL</b> na pasta do cliente: as guias do DAS e
        os comprovantes de arrecadação da Receita (que trazem data de pagamento, banco e a
        composição por código). Sem custo — é arquivo local. Os PDFs não são copiados nem movidos.
      </p>
      <button type="button" onClick={varrer} className="btn btn-accent" disabled={rodando}>
        {rodando ? "Lendo os PDFs..." : "📂 Varrer pasta do cliente"}
      </button>

      {erro && (
        <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">
          <p className="font-semibold">⛔ {erro}</p>
        </div>
      )}

      {res && (
        <div className="mt-3 rounded-lg border border-slate-200 bg-white px-4 py-3 text-xs">
          <p className="text-sm font-semibold text-slate-800">
            {res.pdfsEncontrados} PDF(s) · {res.guiasGravadas} guia(s) DAS ·{" "}
            {res.pagamentosGravados} pagamento(s)
          </p>
          <p className="mt-1 font-mono text-[10px] text-slate-400">{res.pastaLida}</p>
          {res.alertas.map((a, i) => (
            <p key={i} className="mt-2 text-amber-700">
              {a}
            </p>
          ))}
          {ignoradosAno.length > 0 && (
            <details className="mt-2">
              <summary className="cursor-pointer text-slate-500">
                {ignoradosAno.length} arquivo(s) de {ano} não reconhecido(s)
              </summary>
              <ul className="mt-1 space-y-0.5 text-slate-500">
                {ignoradosAno.map((x, i) => (
                  <li key={i}>
                    <span className="font-mono">{x.arquivo}</span> — {x.motivo}
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>
      )}
    </div>
  );
}
