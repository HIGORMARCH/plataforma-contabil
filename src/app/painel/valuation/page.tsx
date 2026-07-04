"use client";

import { useMemo, useState } from "react";
import {
  calcularValuation,
  INPUT_PADRAO,
  brl,
  type ValuationInput,
} from "@/lib/valuation/calc";

const num = (v: string) => {
  const n = parseFloat(v.replace(/\./g, "").replace(",", "."));
  return isNaN(n) ? 0 : n;
};

export default function ValuationPage() {
  const [inp, setInp] = useState<ValuationInput>(INPUT_PADRAO);
  const [gerando, setGerando] = useState(false);
  const [parecer, setParecer] = useState<string | null>(null);
  const r = useMemo(() => calcularValuation(inp), [inp]);

  const set = (k: keyof ValuationInput, v: number | string) =>
    setInp((s) => ({ ...s, [k]: v }));

  // posição na barra football-field (min tecnico -> max cenario segurar)
  const lo = r.cenarios.pressao.min;
  const hi = r.cenarios.segurar.max;
  const pct = (v: number) => Math.max(0, Math.min(100, ((v - lo) / (hi - lo)) * 100));

  async function gerarParecer() {
    setGerando(true);
    setParecer(null);
    try {
      const resp = await fetch("/api/valuation/parecer", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ input: inp, resultado: r }),
      });
      const data = await resp.json();
      const texto = data.texto || data.erro || "Sem retorno.";
      setParecer(texto);
      // guarda o pacote e abre o documento March (parecer premium p/ imprimir/PDF)
      try {
        sessionStorage.setItem(
          "valuation:documento",
          JSON.stringify({ input: inp, resultado: r, parecer: texto, geradoEm: new Date().toISOString() }),
        );
        window.open("/painel/valuation/documento", "_blank");
      } catch {}
    } catch (e) {
      setParecer("Falha ao gerar o parecer: " + (e as Error).message);
    } finally {
      setGerando(false);
    }
  }

  const Campo = ({
    label,
    k,
    prefix,
    suffix,
    step,
  }: {
    label: string;
    k: keyof ValuationInput;
    prefix?: string;
    suffix?: string;
    step?: string;
  }) => (
    <label className="block">
      <span className="text-xs font-medium text-neutral-500">{label}</span>
      <div className="mt-1 flex items-center rounded-lg border border-neutral-300 bg-white focus-within:border-amber-500">
        {prefix && <span className="pl-3 text-sm text-neutral-400">{prefix}</span>}
        <input
          type="number"
          step={step || "any"}
          defaultValue={(inp[k] as number) || ""}
          onChange={(e) => set(k, num(e.target.value))}
          className="w-full bg-transparent px-3 py-2 text-sm outline-none"
        />
        {suffix && <span className="pr-3 text-sm text-neutral-400">{suffix}</span>}
      </div>
    </label>
  );

  return (
    <div>
      <div className="mb-6 flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-bold text-neutral-900">Valuation</h1>
          <p className="text-sm text-neutral-500">
            Avaliação por múltiplos de mercado · dados inseridos manualmente
          </p>
        </div>
        <button
          onClick={gerarParecer}
          disabled={gerando}
          className="rounded-lg bg-neutral-900 px-4 py-2 text-sm font-semibold text-amber-300 hover:bg-neutral-800 disabled:opacity-60"
        >
          {gerando ? "Gerando parecer…" : "🤖 Gerar parecer (IA)"}
        </button>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,360px)_1fr]">
        {/* ---------- FORM ---------- */}
        <div className="space-y-4 rounded-xl border border-neutral-200 bg-neutral-50 p-4">
          <div className="grid grid-cols-1 gap-3">
            <label className="block">
              <span className="text-xs font-medium text-neutral-500">Razão social</span>
              <input
                className="mt-1 w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-amber-500"
                defaultValue={inp.razaoSocial}
                onChange={(e) => set("razaoSocial", e.target.value)}
              />
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label className="block">
                <span className="text-xs font-medium text-neutral-500">CNPJ</span>
                <input
                  className="mt-1 w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-amber-500"
                  defaultValue={inp.cnpj}
                  onChange={(e) => set("cnpj", e.target.value)}
                />
              </label>
              <label className="block">
                <span className="text-xs font-medium text-neutral-500">Setor</span>
                <input
                  className="mt-1 w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-amber-500"
                  defaultValue={inp.setor}
                  onChange={(e) => set("setor", e.target.value)}
                />
              </label>
            </div>
          </div>

          <div className="border-t border-neutral-200 pt-3">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-amber-700">
              Receita
            </p>
            <div className="grid grid-cols-2 gap-3">
              <Campo label="Faturamento fiscal (Simples)" k="faturamentoFiscal" prefix="R$" />
              <Campo label="Comissão / outras receitas" k="comissao" prefix="R$" />
              <Campo label="Lucratividade líquida" k="margemPct" suffix="%" />
              <Campo label="Dívida líquida" k="dividaLiquida" prefix="R$" />
            </div>
          </div>

          <div className="border-t border-neutral-200 pt-3">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-amber-700">
              Ativos e prêmio
            </p>
            <div className="grid grid-cols-2 gap-3">
              <Campo label="Imobilizado (piso)" k="imobilizado" prefix="R$" />
              <Campo label="Prêmio intangíveis" k="premioPct" suffix="%" />
              <Campo label="Anos de mercado" k="anosMercado" />
              <Campo label="Funcionários" k="funcionarios" />
            </div>
          </div>

          <div className="border-t border-neutral-200 pt-3">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-amber-700">
              Múltiplos
            </p>
            <div className="grid grid-cols-2 gap-3">
              <Campo label="Múlt. lucro (mín)" k="multLucroMin" suffix="x" step="0.1" />
              <Campo label="Múlt. lucro (máx)" k="multLucroMax" suffix="x" step="0.1" />
              <Campo label="EV/Receita (mín)" k="multReceitaMin" suffix="x" step="0.1" />
              <Campo label="EV/Receita (máx)" k="multReceitaMax" suffix="x" step="0.1" />
            </div>
          </div>
        </div>

        {/* ---------- DASHBOARD ---------- */}
        <div className="space-y-5">
          {/* valor de referência */}
          <div className="rounded-xl bg-neutral-900 p-6 text-white">
            <div className="text-[11px] uppercase tracking-[0.2em] text-amber-300">
              Valor de referência estimado
            </div>
            <div className="mt-1 text-4xl font-bold">
              {brl(r.valor.min)} <span className="text-amber-300">–</span> {brl(r.valor.max)}
            </div>
            <div className="mt-1 text-sm text-neutral-400">
              Ponto médio ~ {brl(r.valor.medio)} · receita total {brl(r.receitaTotal)} · lucro
              estimado {brl(r.lucroEstimado)}
            </div>
          </div>

          {/* metodos */}
          <div className="overflow-hidden rounded-xl border border-neutral-200">
            <table className="w-full text-sm">
              <tbody>
                <Row
                  a="Múltiplo sobre o lucro"
                  b={`${brl(r.metodoLucro.min)} – ${brl(r.metodoLucro.max)}`}
                  c={`${inp.multLucroMin}x a ${inp.multLucroMax}x`}
                />
                <Row
                  a="EV / Receita"
                  b={`${brl(r.metodoReceita.min)} – ${brl(r.metodoReceita.max)}`}
                  c={`${inp.multReceitaMin}x a ${inp.multReceitaMax}x`}
                />
                <Row a="Piso (imobilizado)" b={brl(r.piso)} c="valor mínimo dos bens" />
                <Row
                  a="Prêmio por intangíveis"
                  b={`+${inp.premioPct}%`}
                  c="licenças, longevidade, carteira"
                  gold
                />
              </tbody>
            </table>
          </div>

          {/* cenário decisório */}
          <div>
            <p className="mb-2 text-sm font-semibold text-neutral-700">
              Cenário decisório — vender agora ou segurar
            </p>
            <div className="overflow-hidden rounded-xl border border-neutral-200 text-sm">
              <Cenario cor="bad" tag="Venda sob pressão" faixa={r.cenarios.pressao} desc="Comprador percebe urgência e comprime o múltiplo." />
              <Cenario cor="mid" tag="Valor justo hoje" faixa={r.cenarios.justo} desc="Avaliação técnica + intangíveis." />
              <Cenario cor="good" tag="Segurar 24–36 meses" faixa={r.cenarios.segurar} desc="Normalização rumo à capacidade comprovada." />
            </div>
            {/* barra football-field */}
            <div className="relative mt-4 h-10">
              <div className="absolute inset-x-0 top-4 h-2 rounded-full bg-gradient-to-r from-red-200 via-amber-200 to-emerald-300" />
              <Marca left={pct(r.valor.medio)} label={brl(r.valor.medio)} />
            </div>
          </div>

          {parecer && (
            <div className="whitespace-pre-wrap rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-neutral-800">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-amber-700">
                Parecer gerado pela IA
              </p>
              {parecer}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Row({ a, b, c, gold }: { a: string; b: string; c: string; gold?: boolean }) {
  return (
    <tr className="border-b border-neutral-100 last:border-0">
      <td className={`px-4 py-2.5 ${gold ? "font-semibold text-amber-800" : "text-neutral-700"}`}>{a}</td>
      <td className="px-4 py-2.5 text-right font-medium tabular-nums">{b}</td>
      <td className="px-4 py-2.5 text-xs text-neutral-400">{c}</td>
    </tr>
  );
}

function Cenario({
  cor,
  tag,
  faixa,
  desc,
}: {
  cor: "bad" | "mid" | "good";
  tag: string;
  faixa: { min: number; max: number };
  desc: string;
}) {
  const bg = cor === "bad" ? "bg-red-50" : cor === "good" ? "bg-emerald-50" : "bg-white";
  const cv = cor === "bad" ? "text-red-700" : cor === "good" ? "text-emerald-700" : "text-neutral-900";
  return (
    <div className={`grid grid-cols-[1.4fr_2fr_1.4fr] items-center border-b border-neutral-100 last:border-0 ${bg}`}>
      <div className="px-4 py-3 font-semibold">{tag}</div>
      <div className="px-4 py-3 text-xs text-neutral-500">{desc}</div>
      <div className={`px-4 py-3 text-right font-bold tabular-nums ${cv}`}>
        {brl(faixa.min)} – {brl(faixa.max)}
      </div>
    </div>
  );
}

function Marca({ left, label }: { left: number; label: string }) {
  return (
    <div className="absolute top-0 -translate-x-1/2 text-center" style={{ left: `${left}%` }}>
      <div className="text-xs font-bold text-neutral-800">{label}</div>
      <div className="mx-auto mt-0.5 h-5 w-0.5 bg-neutral-800" />
    </div>
  );
}
