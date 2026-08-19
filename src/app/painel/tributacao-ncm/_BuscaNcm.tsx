"use client";

import { useState } from "react";

/**
 * Consulta rápida de NCM na base.
 *
 * Digita o NCM, sai o regime, os CSTs, a natureza e o vínculo de crédito —
 * a pergunta que aparece no meio do lançamento, sem ter que abrir cliente,
 * vigência ou planilha.
 */

interface LeituraCst {
  codigo: string;
  descricao: string;
  geraCredito: boolean;
  vinculo: string;
}

interface Resposta {
  ok: boolean;
  ncm: string;
  naBase?: boolean;
  regime?: string;
  codigo?: number;
  descricao?: string;
  cstEntrada?: string;
  cstSaida?: string;
  natureza?: string;
  entrada?: LeituraCst | null;
  saida?: string | null;
  origem?: string;
  atualizadoEm?: string;
  erro?: string;
}

const ROTULO_REGIME: Record<string, string> = {
  normal: "Tributação normal",
  monofasico: "Monofásico",
  aliquota_zero: "Alíquota zero",
  isenta: "Isenta",
  substituicao: "Substituição tributária",
};

const COR_REGIME: Record<string, string> = {
  normal: "bg-slate-100 text-slate-700",
  monofasico: "bg-amber-100 text-amber-900",
  aliquota_zero: "bg-emerald-100 text-emerald-900",
  isenta: "bg-sky-100 text-sky-900",
  substituicao: "bg-violet-100 text-violet-900",
};

export function BuscaNcm() {
  const [termo, setTermo] = useState("");
  const [buscando, setBuscando] = useState(false);
  const [r, setR] = useState<Resposta | null>(null);

  async function buscar() {
    const ncm = termo.replace(/\D/g, "");
    if (ncm.length !== 8) {
      setR({ ok: false, ncm: termo, erro: "Informe um NCM com 8 dígitos." });
      return;
    }
    setBuscando(true);
    try {
      const resp = await fetch(`/api/tributacao-ncm/consultar?ncm=${ncm}`);
      setR(await resp.json());
    } catch (e) {
      setR({ ok: false, ncm, erro: e instanceof Error ? e.message : "Falha na consulta." });
    } finally {
      setBuscando(false);
    }
  }

  return (
    <section className="mb-8">
      <h2 className="mb-3 text-lg font-bold text-slate-800">Consultar NCM</h2>
      <div className="card p-5">
        <div className="flex flex-wrap gap-2">
          <input
            className="input max-w-xs font-mono"
            placeholder="3305.10.00 ou 33051000"
            value={termo}
            onChange={(e) => setTermo(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") buscar();
            }}
            disabled={buscando}
          />
          <button type="button" className="btn btn-primary" onClick={buscar} disabled={buscando}>
            {buscando ? "Consultando..." : "Consultar"}
          </button>
        </div>

        {r && !r.ok && (
          <div className="mt-4 rounded border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            <span className="font-mono font-semibold">{r.ncm}</span> — {r.erro}
          </div>
        )}

        {r && r.ok && (
          <div className="mt-4 rounded border border-slate-200">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 bg-slate-50 px-4 py-3">
              <span className="font-mono text-lg font-semibold text-slate-800">{r.ncm}</span>
              <span
                className={`rounded-full px-3 py-1 text-sm font-semibold ${
                  COR_REGIME[r.regime ?? ""] ?? "bg-slate-100 text-slate-700"
                }`}
              >
                {ROTULO_REGIME[r.regime ?? ""] ?? r.regime}
              </span>
            </div>

            <dl className="grid gap-x-6 gap-y-3 p-4 text-sm md:grid-cols-2">
              <div>
                <dt className="text-xs uppercase tracking-wide text-slate-500">Configuração</dt>
                <dd className="text-slate-800">
                  #{r.codigo} · {r.descricao}
                </dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wide text-slate-500">
                  Natureza da receita
                </dt>
                <dd className="font-mono text-slate-800">{r.natureza || "—"}</dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wide text-slate-500">CST de entrada</dt>
                <dd className="text-slate-800">
                  <span className="font-mono font-semibold">{r.cstEntrada}</span>
                  {r.entrada && <span className="text-slate-600"> — {r.entrada.descricao}</span>}
                </dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wide text-slate-500">CST de saída</dt>
                <dd className="text-slate-800">
                  <span className="font-mono font-semibold">{r.cstSaida}</span>
                  {r.saida && <span className="text-slate-600"> — {r.saida}</span>}
                </dd>
              </div>
            </dl>

            {r.entrada && (
              <div
                className={`mx-4 mb-4 rounded border px-3 py-2 text-sm ${
                  r.entrada.geraCredito
                    ? "border-emerald-200 bg-emerald-50 text-emerald-900"
                    : "border-slate-200 bg-slate-50 text-slate-700"
                }`}
              >
                <p className="font-semibold">{r.entrada.vinculo}</p>
                <p className="mt-1 text-xs">
                  Leitura do CST de entrada — não é o campo <b>Vínculo do crédito</b> do Domínio,
                  que o nosso TXT hoje envia em branco. O aproveitamento efetivo depende do regime
                  da empresa (o não cumulativo credita, o cumulativo não) e da destinação do item.
                </p>
              </div>
            )}

            <p className="px-4 pb-3 text-xs text-slate-400">
              {r.origem === "econet_cache" ? "Confirmado na Econet" : "Base da plataforma"}
              {r.atualizadoEm &&
                ` · atualizado em ${new Date(r.atualizadoEm).toLocaleDateString("pt-BR")}`}
            </p>
          </div>
        )}
      </div>
    </section>
  );
}
