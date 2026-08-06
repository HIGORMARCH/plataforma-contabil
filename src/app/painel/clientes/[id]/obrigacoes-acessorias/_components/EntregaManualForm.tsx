"use client";

import { useState } from "react";
import { registrarEntregaManualAction } from "../actions";

type TipoManual = "PGDAS_D" | "DEFIS" | "MIT";

const ROTULO: Record<TipoManual, string> = {
  PGDAS_D: "PGDAS-D (mensal)",
  DEFIS: "DEFIS (anual)",
  MIT: "MIT (mensal)",
};

export function EntregaManualForm({
  clienteId,
  clienteEhSimples,
  anoInicial,
  anoFinal,
}: {
  clienteId: string;
  clienteEhSimples: boolean;
  anoInicial: number;
  anoFinal: number;
}) {
  const [tipo, setTipo] = useState<TipoManual>(clienteEhSimples ? "PGDAS_D" : "MIT");
  const [enviando, setEnviando] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const anos: number[] = [];
  for (let a = anoInicial; a <= anoFinal; a++) anos.push(a);

  const mensal = tipo !== "DEFIS";
  const tiposPermitidos: TipoManual[] = clienteEhSimples
    ? ["PGDAS_D", "DEFIS", "MIT"]
    : ["MIT"];

  async function submeter(formData: FormData) {
    setEnviando(true);
    setMsg(null);
    try {
      await registrarEntregaManualAction(clienteId, formData);
      setMsg("Entrega registrada.");
    } catch (e) {
      setMsg("Erro: " + (e instanceof Error ? e.message : String(e)));
    } finally {
      setEnviando(false);
    }
  }

  return (
    <form
      action={submeter}
      className="grid grid-cols-1 gap-3 rounded-lg border border-slate-200 bg-white p-4 text-sm md:grid-cols-6"
    >
      <label className="flex flex-col md:col-span-2">
        <span className="mb-1 text-xs text-slate-500">Obrigação</span>
        <select
          name="tipo"
          value={tipo}
          onChange={(e) => setTipo(e.target.value as TipoManual)}
          className="rounded border border-slate-300 px-2 py-1"
        >
          {tiposPermitidos.map((t) => (
            <option key={t} value={t}>
              {ROTULO[t]}
            </option>
          ))}
        </select>
      </label>

      <label className="flex flex-col">
        <span className="mb-1 text-xs text-slate-500">Ano</span>
        <select
          name="ano"
          className="rounded border border-slate-300 px-2 py-1"
          defaultValue={anos[anos.length - 1]}
        >
          {anos.map((a) => (
            <option key={a} value={a}>
              {a}
            </option>
          ))}
        </select>
      </label>

      {mensal && (
        <label className="flex flex-col">
          <span className="mb-1 text-xs text-slate-500">Mês</span>
          <select name="mes" className="rounded border border-slate-300 px-2 py-1" defaultValue="1">
            {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
              <option key={m} value={m}>
                {String(m).padStart(2, "0")}
              </option>
            ))}
          </select>
        </label>
      )}

      <label className="flex flex-col">
        <span className="mb-1 text-xs text-slate-500">Data de entrega</span>
        <input
          type="date"
          name="dataEntrega"
          required
          className="rounded border border-slate-300 px-2 py-1"
        />
      </label>

      <label className="flex flex-col md:col-span-2">
        <span className="mb-1 text-xs text-slate-500">Nº do recibo (opcional)</span>
        <input
          type="text"
          name="numeroRecibo"
          className="rounded border border-slate-300 px-2 py-1"
        />
      </label>

      <div className="md:col-span-6 flex items-center gap-3">
        <button
          type="submit"
          disabled={enviando}
          className="btn btn-primary"
        >
          {enviando ? "Salvando..." : "Registrar entrega"}
        </button>
        {msg && <span className="text-xs text-slate-500">{msg}</span>}
      </div>
    </form>
  );
}
