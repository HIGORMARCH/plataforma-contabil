"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  GRUPOS_MODULO,
  modulosPorGrupo,
  type ModuloRelatorio,
} from "@/lib/relatorios/catalogo";

/**
 * Escolha do que entra no dossiê do cliente.
 *
 * Os módulos que ainda não podem entrar aparecem assim mesmo, desmarcáveis e
 * com o motivo à mostra. Esconder daria a impressão de que o dossiê cobre tudo.
 */
export function SelecaoDossie({
  clientes,
}: {
  clientes: { id: string; razaoSocial: string; cnpj: string }[];
}) {
  const router = useRouter();
  const [clienteId, setClienteId] = useState(clientes[0]?.id ?? "");
  const [marcados, setMarcados] = useState<Set<string>>(new Set());

  function alternar(m: ModuloRelatorio) {
    if (!m.integradoAoDossie) return;
    setMarcados((atual) => {
      const novo = new Set(atual);
      if (novo.has(m.id)) novo.delete(m.id);
      else novo.add(m.id);
      return novo;
    });
  }

  function gerar() {
    const modulos = [...marcados].join(",");
    router.push(`/painel/dossie/documento?cliente=${clienteId}&modulos=${modulos}`);
  }

  return (
    <div>
      <section className="card mb-6 p-5">
        <label className="label" htmlFor="cliente">
          Cliente
        </label>
        <select
          id="cliente"
          className="input max-w-xl"
          value={clienteId}
          onChange={(e) => setClienteId(e.target.value)}
        >
          {clientes.map((c) => (
            <option key={c.id} value={c.id}>
              {c.razaoSocial}
            </option>
          ))}
        </select>
      </section>

      {GRUPOS_MODULO.map((grupo) => (
        <section key={grupo} className="mb-5">
          <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-slate-500">{grupo}</h2>
          <div className="card divide-y divide-slate-100 p-0">
            {modulosPorGrupo(grupo).map((m) => {
              const podeEntrar = m.integradoAoDossie;
              return (
                <div
                  key={m.id}
                  className={`flex items-start gap-3 p-4 ${podeEntrar ? "" : "opacity-60"}`}
                >
                  <input
                    type="checkbox"
                    id={`mod-${m.id}`}
                    className="mt-1"
                    checked={marcados.has(m.id)}
                    disabled={!podeEntrar}
                    onChange={() => alternar(m)}
                  />
                  <div className="flex-1">
                    <label htmlFor={`mod-${m.id}`} className="text-sm font-semibold text-slate-800">
                      {m.rotulo}
                    </label>
                    <p className="text-xs text-slate-500">{m.descricao}</p>
                    {!podeEntrar && (
                      <p className="mt-1 text-xs text-amber-700">
                        {m.disponivel
                          ? "Tem relatório na tela do módulo, mas ainda não entra no dossiê consolidado."
                          : "Relatório ainda não implementado neste módulo."}
                        {m.href && (
                          <>
                            {" "}
                            <Link href={m.href} className="underline">
                              abrir módulo
                            </Link>
                          </>
                        )}
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      ))}

      <div className="flex items-center gap-3">
        <button
          type="button"
          className="btn btn-primary"
          onClick={gerar}
          disabled={!clienteId || marcados.size === 0}
        >
          Gerar dossiê
        </button>
        <span className="text-xs text-slate-500">
          {marcados.size === 0
            ? "Marque ao menos um módulo."
            : `${marcados.size} ${marcados.size === 1 ? "módulo selecionado" : "módulos selecionados"}`}
        </span>
      </div>
    </div>
  );
}
