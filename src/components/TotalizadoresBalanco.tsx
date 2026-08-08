"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { parseNumero } from "@/lib/import";

interface Props {
  formId: string;
}

const GRUPOS = {
  ac: {
    titulo: "Ativo Circulante",
    campos: ["ac.caixaEquivalentes", "ac.contasReceber", "ac.estoques", "ac.tributosRecuperar", "ac.outros"],
  },
  anc: {
    titulo: "Ativo Não Circulante",
    campos: ["anc.realizavelLongoPrazo", "anc.investimentos", "anc.imobilizado", "anc.intangivel", "anc.outros"],
  },
  pc: {
    titulo: "Passivo Circulante",
    campos: ["pc.fornecedores", "pc.emprestimosFinanciamentos", "pc.obrigacoesTrabalhistas", "pc.obrigacoesTributarias", "pc.outros"],
  },
  pnc: {
    titulo: "Passivo Não Circulante",
    campos: ["pnc.emprestimosFinanciamentos", "pnc.outros"],
  },
  pl: {
    titulo: "Patrimônio Líquido",
    campos: ["pl.capitalSocial", "pl.reservas", "pl.lucrosAcumulados", "pl.outros"],
  },
} as const;

const CAMPO_PREJUIZO = "pl.prejuizosAcumulados";

function moeda(n: number): string {
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function somarCampos(valores: Record<string, number>, chaves: readonly string[]): number {
  return chaves.reduce((acc, k) => acc + (valores[k] ?? 0), 0);
}

export function TotalizadoresBalanco({ formId }: Props) {
  const [valores, setValores] = useState<Record<string, number>>({});
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    const form = document.getElementById(formId) as HTMLFormElement | null;
    if (!form) return;

    const lerValores = () => {
      const novos: Record<string, number> = {};
      const inputs = form.querySelectorAll<HTMLInputElement>("input[name^='ac.'], input[name^='anc.'], input[name^='pc.'], input[name^='pnc.'], input[name^='pl.']");
      inputs.forEach((inp) => {
        const v = parseNumero(inp.value);
        novos[inp.name] = v ?? 0;
      });
      setValores(novos);
    };

    lerValores();

    const onInput = () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(lerValores);
    };

    form.addEventListener("input", onInput);
    return () => {
      form.removeEventListener("input", onInput);
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, [formId]);

  const totais = useMemo(() => {
    const ac = somarCampos(valores, GRUPOS.ac.campos);
    const anc = somarCampos(valores, GRUPOS.anc.campos);
    const pc = somarCampos(valores, GRUPOS.pc.campos);
    const pnc = somarCampos(valores, GRUPOS.pnc.campos);
    const plBruto = somarCampos(valores, GRUPOS.pl.campos);
    const prejuizo = valores[CAMPO_PREJUIZO] ?? 0;
    const pl = plBruto - prejuizo;
    const ativo = ac + anc;
    const passivoMaisPL = pc + pnc + pl;
    const diferenca = ativo - passivoMaisPL;
    return { ac, anc, pc, pnc, pl, ativo, passivoMaisPL, diferenca };
  }, [valores]);

  const fecha = Math.abs(totais.diferenca) < 0.01;

  return (
    <section className="card mt-6 p-5">
      <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-slate-500">
        Totalizadores (conferência em tempo real)
      </h2>
      <div className="grid gap-4 md:grid-cols-2">
        {/* Coluna ATIVO */}
        <div className="rounded-lg border border-slate-200 p-3">
          <div className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">Ativo</div>
          <dl className="space-y-1 text-sm tabular-nums">
            <div className="flex justify-between text-slate-600">
              <dt>Total {GRUPOS.ac.titulo}</dt>
              <dd>{moeda(totais.ac)}</dd>
            </div>
            <div className="flex justify-between text-slate-600">
              <dt>Total {GRUPOS.anc.titulo}</dt>
              <dd>{moeda(totais.anc)}</dd>
            </div>
            <div className="mt-2 flex justify-between border-t border-slate-300 pt-2 font-bold text-slate-800">
              <dt>TOTAL DO ATIVO</dt>
              <dd>{moeda(totais.ativo)}</dd>
            </div>
          </dl>
        </div>
        {/* Coluna PASSIVO + PL */}
        <div className="rounded-lg border border-slate-200 p-3">
          <div className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">Passivo + Patrimônio Líquido</div>
          <dl className="space-y-1 text-sm tabular-nums">
            <div className="flex justify-between text-slate-600">
              <dt>Total {GRUPOS.pc.titulo}</dt>
              <dd>{moeda(totais.pc)}</dd>
            </div>
            <div className="flex justify-between text-slate-600">
              <dt>Total {GRUPOS.pnc.titulo}</dt>
              <dd>{moeda(totais.pnc)}</dd>
            </div>
            <div className="flex justify-between text-slate-600">
              <dt>Total {GRUPOS.pl.titulo}</dt>
              <dd>{moeda(totais.pl)}</dd>
            </div>
            <div className="mt-2 flex justify-between border-t border-slate-300 pt-2 font-bold text-slate-800">
              <dt>TOTAL PASSIVO + PL</dt>
              <dd>{moeda(totais.passivoMaisPL)}</dd>
            </div>
          </dl>
        </div>
      </div>
      {/* Conferência ATIVO − PASSIVO */}
      <div
        className={`mt-4 flex items-center justify-between rounded-lg border-2 px-4 py-3 text-sm font-bold ${
          fecha
            ? "border-emerald-500 bg-emerald-50 text-emerald-800"
            : "border-red-500 bg-red-50 text-red-800"
        }`}
      >
        <span>
          {fecha ? "✓ CONFERÊNCIA: Ativo = Passivo + PL" : "✗ CONFERÊNCIA: Ativo ≠ Passivo + PL"}
        </span>
        <span className="tabular-nums">Diferença: {moeda(totais.diferenca)}</span>
      </div>
    </section>
  );
}
