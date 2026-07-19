"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

export interface VigenciaItem {
  id: string;
  dataVigencia: string; // ISO
  descricao: string;
  status: string;
  qtdNcms: number;
}

export function ListaVigencias({ clienteId, vigencias }: { clienteId: string; vigencias: VigenciaItem[] }) {
  const router = useRouter();
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [dataEdit, setDataEdit] = useState("");
  const [descricaoEdit, setDescricaoEdit] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [excluindoId, setExcluindoId] = useState<string | null>(null);

  function iniciarEdicao(v: VigenciaItem) {
    setEditandoId(v.id);
    setDataEdit(v.dataVigencia.slice(0, 10));
    setDescricaoEdit(v.descricao);
  }

  async function salvarEdicao(id: string) {
    setSalvando(true);
    try {
      const r = await fetch(`/api/tributacao-ncm/vigencias/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dataVigencia: dataEdit, descricao: descricaoEdit }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.erro ?? "Erro ao salvar");
      setEditandoId(null);
      router.refresh();
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e));
    } finally {
      setSalvando(false);
    }
  }

  async function excluir(id: string, resumo: string) {
    if (!confirm(`Excluir a vigência ${resumo}? Todos os NCMs dela serão removidos.`)) return;
    setExcluindoId(id);
    try {
      const r = await fetch(`/api/tributacao-ncm/vigencias/${id}`, { method: "DELETE" });
      const j = await r.json();
      if (!r.ok) throw new Error(j.erro ?? "Erro ao excluir");
      router.refresh();
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e));
    } finally {
      setExcluindoId(null);
    }
  }

  return (
    <div className="card overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
          <tr>
            <th className="px-4 py-3">Data</th>
            <th className="px-4 py-3">Descrição</th>
            <th className="px-4 py-3">NCMs</th>
            <th className="px-4 py-3">Status</th>
            <th className="px-4 py-3 text-right">Ações</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {vigencias.map((v) => {
            const editando = editandoId === v.id;
            return (
              <tr key={v.id} className={editando ? "bg-amber-50" : "hover:bg-slate-50"}>
                <td className="px-4 py-3">
                  {editando ? (
                    <input
                      type="date"
                      value={dataEdit}
                      onChange={(e) => setDataEdit(e.target.value)}
                      className="rounded border border-slate-300 px-2 py-1 text-sm"
                    />
                  ) : (
                    <span className="font-medium text-slate-800">
                      {new Date(v.dataVigencia).toLocaleDateString("pt-BR")}
                    </span>
                  )}
                </td>
                <td className="px-4 py-3">
                  {editando ? (
                    <input
                      type="text"
                      value={descricaoEdit}
                      onChange={(e) => setDescricaoEdit(e.target.value)}
                      className="w-full rounded border border-slate-300 px-2 py-1 text-sm"
                    />
                  ) : (
                    <span className="text-slate-600">{v.descricao}</span>
                  )}
                </td>
                <td className="px-4 py-3 text-slate-600">{v.qtdNcms}</td>
                <td className="px-4 py-3 text-slate-600">{v.status}</td>
                <td className="px-4 py-3 text-right">
                  {editando ? (
                    <div className="flex justify-end gap-2">
                      <button
                        onClick={() => salvarEdicao(v.id)}
                        disabled={salvando}
                        className="text-xs text-green-700 hover:underline"
                      >
                        {salvando ? "Salvando..." : "Salvar"}
                      </button>
                      <button
                        onClick={() => setEditandoId(null)}
                        className="text-xs text-slate-500 hover:underline"
                      >
                        Cancelar
                      </button>
                    </div>
                  ) : (
                    <div className="flex justify-end gap-3">
                      <Link
                        href={`/painel/tributacao-ncm/${clienteId}/vigencia/${v.id}`}
                        className="text-xs text-[var(--brand)] hover:underline"
                      >
                        Abrir
                      </Link>
                      <button
                        onClick={() => iniciarEdicao(v)}
                        className="text-xs text-slate-600 hover:underline"
                      >
                        Editar
                      </button>
                      <button
                        onClick={() =>
                          excluir(
                            v.id,
                            `${new Date(v.dataVigencia).toLocaleDateString("pt-BR")} — ${v.descricao}`,
                          )
                        }
                        disabled={excluindoId === v.id}
                        className="text-xs text-red-600 hover:underline"
                      >
                        {excluindoId === v.id ? "Excluindo..." : "Excluir"}
                      </button>
                    </div>
                  )}
                </td>
              </tr>
            );
          })}
          {vigencias.length === 0 && (
            <tr>
              <td colSpan={5} className="px-4 py-6 text-center text-slate-400">
                Nenhuma vigência criada. Crie a primeira acima.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
