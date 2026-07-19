"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function NovaVigenciaForm({ clienteId }: { clienteId: string }) {
  const router = useRouter();
  const [data, setData] = useState(() => {
    const d = new Date();
    d.setDate(1); // primeiro dia do mês corrente
    return d.toISOString().slice(0, 10);
  });
  const [descricao, setDescricao] = useState("TRIBUTAÇÃO");
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function submeter(e: React.FormEvent) {
    e.preventDefault();
    setSalvando(true);
    setErro(null);
    try {
      const r = await fetch(`/api/tributacao-ncm/vigencias`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clienteId, dataVigencia: data, descricao }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.erro ?? "Erro ao criar vigência");
      router.push(`/painel/tributacao-ncm/${clienteId}/vigencia/${j.vigencia.id}`);
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
      setSalvando(false);
    }
  }

  return (
    <form onSubmit={submeter} className="card p-4">
      <div className="grid gap-3 md:grid-cols-3">
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-600">Data de vigência</label>
          <input
            type="date"
            value={data}
            onChange={(e) => setData(e.target.value)}
            className="w-full rounded border border-slate-300 px-3 py-2 text-sm"
            required
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-600">Descrição</label>
          <input
            type="text"
            value={descricao}
            onChange={(e) => setDescricao(e.target.value)}
            className="w-full rounded border border-slate-300 px-3 py-2 text-sm"
            required
          />
        </div>
        <div className="flex items-end">
          <button
            type="submit"
            disabled={salvando}
            className="btn btn-accent w-full"
          >
            {salvando ? "Criando..." : "+ Criar vigência"}
          </button>
        </div>
      </div>
      {erro && <div className="mt-3 text-sm text-red-600">{erro}</div>}
    </form>
  );
}
