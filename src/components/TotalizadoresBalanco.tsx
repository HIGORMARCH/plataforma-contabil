"use client";

import { useEffect, useState } from "react";
import { parseNumero } from "@/lib/import";

/**
 * Totais do balanço dentro do próprio formulário: um "Total" embaixo de cada
 * grupo e o total de cada lado no pé da coluna. Recalcula a cada digitação e
 * a cada preenchimento pelo PDF (ExtrairPDF dispara o evento "input").
 */

const CAMPOS = {
  ac: ["ac.caixaEquivalentes", "ac.contasReceber", "ac.estoques", "ac.tributosRecuperar", "ac.outros"],
  anc: ["anc.realizavelLongoPrazo", "anc.investimentos", "anc.imobilizado", "anc.intangivel", "anc.outros"],
  pc: ["pc.fornecedores", "pc.emprestimosFinanciamentos", "pc.obrigacoesTrabalhistas", "pc.obrigacoesTributarias", "pc.outros"],
  pnc: ["pnc.emprestimosFinanciamentos", "pnc.outros"],
  pl: ["pl.capitalSocial", "pl.reservas", "pl.lucrosAcumulados", "pl.resultadoExercicio", "pl.outros"],
} as const;

export type GrupoBalanco = keyof typeof CAMPOS;

function moeda(n: number): string {
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function useTotais(formId: string) {
  const [valores, setValores] = useState<Record<string, number>>({});

  useEffect(() => {
    const form = document.getElementById(formId) as HTMLFormElement | null;
    if (!form) return;
    let raf: number | null = null;
    const ler = () => {
      const novos: Record<string, number> = {};
      form
        .querySelectorAll<HTMLInputElement>("input[name^='ac.'], input[name^='anc.'], input[name^='pc.'], input[name^='pnc.'], input[name^='pl.']")
        .forEach((inp) => {
          novos[inp.name] = parseNumero(inp.value) ?? 0;
        });
      setValores(novos);
    };
    const agendar = () => {
      if (raf !== null) cancelAnimationFrame(raf);
      raf = requestAnimationFrame(ler);
    };
    ler();
    form.addEventListener("input", agendar);
    return () => {
      form.removeEventListener("input", agendar);
      if (raf !== null) cancelAnimationFrame(raf);
    };
  }, [formId]);

  const soma = (chaves: readonly string[]) => chaves.reduce((a, k) => a + (valores[k] ?? 0), 0);
  const ac = soma(CAMPOS.ac);
  const anc = soma(CAMPOS.anc);
  const pc = soma(CAMPOS.pc);
  const pnc = soma(CAMPOS.pnc);
  const pl = soma(CAMPOS.pl) - (valores["pl.prejuizosAcumulados"] ?? 0);
  return { ac, anc, pc, pnc, pl, ativo: ac + anc, passivoMaisPL: pc + pnc + pl };
}

/** Título do grupo com o total à direita: "Ativo Circulante ........ R$ 7.279.075,84". */
export function TotalGrupo({ formId, grupo, titulo }: { formId: string; grupo: GrupoBalanco; titulo: string }) {
  const t = useTotais(formId);
  return (
    <h4 className="mb-2 flex justify-between text-xs font-bold tabular-nums text-slate-600">
      <span>{titulo}</span>
      <span>{moeda(t[grupo])}</span>
    </h4>
  );
}

/** Cabeçalho da coluna com o total à direita: "ATIVO ........ R$ 7.591.838,47". */
export function TotalLado({ formId, lado, titulo }: { formId: string; lado: "ativo" | "passivo"; titulo: string }) {
  const t = useTotais(formId);
  const valor = lado === "ativo" ? t.ativo : t.passivoMaisPL;
  return (
    <h3 className="flex justify-between border-b border-slate-200 pb-1 text-sm font-bold uppercase tracking-wide tabular-nums text-slate-700">
      <span>{titulo}</span>
      <span>{moeda(valor)}</span>
    </h3>
  );
}

/** Uma linha só: fecha ou não fecha, e quanto falta. */
export function ConferenciaBalanco({ formId }: { formId: string }) {
  const t = useTotais(formId);
  const diferenca = t.ativo - t.passivoMaisPL;
  const fecha = Math.abs(diferenca) < 0.01;
  return (
    <div
      className={`mt-4 flex justify-between rounded-lg px-3 py-2 text-sm font-semibold tabular-nums ${
        fecha ? "bg-emerald-50 text-emerald-800" : "bg-red-50 text-red-800"
      }`}
    >
      <span>{fecha ? "Ativo = Passivo + PL" : "Ativo diferente de Passivo + PL"}</span>
      <span>Diferença: {moeda(diferenca)}</span>
    </div>
  );
}

/** Resultado do exercício no PL × resultado da DRE — prova da transferência. */
export function ConferenciaResultado({ formId }: { formId: string }) {
  const [par, setPar] = useState<{ pl: number | null; dre: number | null }>({ pl: null, dre: null });

  useEffect(() => {
    const form = document.getElementById(formId) as HTMLFormElement | null;
    if (!form) return;
    const ler = () => {
      const valor = (nome: string) =>
        parseNumero(form.querySelector<HTMLInputElement>(`input[name='${nome}']`)?.value ?? "");
      setPar({ pl: valor("pl.resultadoExercicio"), dre: valor("dre.resultadoLiquidoInformado") });
    };
    ler();
    form.addEventListener("input", ler);
    return () => form.removeEventListener("input", ler);
  }, [formId]);

  if (par.pl === null || par.dre === null) return null;
  const diferenca = par.pl - par.dre;
  const confere = Math.abs(diferenca) < 0.01;
  return (
    <div
      className={`mt-2 flex justify-between rounded-lg px-3 py-2 text-sm font-semibold tabular-nums ${
        confere ? "bg-emerald-50 text-emerald-800" : "bg-red-50 text-red-800"
      }`}
    >
      <span>
        {confere ? "Resultado da DRE transferido para o PL" : "Resultado no PL diferente da DRE"}: PL {moeda(par.pl)} · DRE{" "}
        {moeda(par.dre)}
      </span>
      <span>Diferença: {moeda(diferenca)}</span>
    </div>
  );
}
