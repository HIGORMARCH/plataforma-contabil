"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

interface Item {
  origem: string;
  nomeArquivo: string;
  status: string;
  tipo: string | null;
  cliente: string | null;
  destino: string | null;
  acao: string | null;
  detalhe: string;
}

interface Relatorio {
  simulado: boolean;
  origens: string[];
  arquivosVistos: number;
  arquivados: number;
  jaNoLugar: number;
  jaExistia: number;
  conflitos: number;
  quarentena: number;
  erros: number;
  itens: Item[];
}

const CORES: Record<string, string> = {
  ARQUIVADO: "text-emerald-700",
  JA_NO_LUGAR: "text-slate-500",
  JA_EXISTIA: "text-slate-400",
  CONFLITO: "text-amber-700",
  QUARENTENA: "text-amber-700",
  ERRO: "text-red-700",
};

/**
 * Simular vem primeiro, e é o botão em destaque. O robô move e renomeia arquivo
 * — ensaiar antes não é preciosismo, é o mínimo.
 */
export function ExecutarRoboButton({ temOrigem }: { temOrigem: boolean }) {
  const [rodando, setRodando] = useState<"simular" | "valer" | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [rel, setRel] = useState<Relatorio | null>(null);
  const [filtro, setFiltro] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const router = useRouter();

  async function executar(simular: boolean) {
    if (!simular) {
      const totalMexer = rel ? rel.arquivados : 0;
      if (
        !confirm(
          `O robô vai mexer em ${totalMexer} arquivo(s): mover e renomear os que estão dentro de C:\\PlataformaContabil e copiar os que vierem de fora. Nada é apagado nem sobrescrito. Confirma?`,
        )
      ) {
        return;
      }
    }
    setRodando(simular ? "simular" : "valer");
    setErro(null);
    try {
      const r = await fetch("/api/organizador/executar", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ simular }),
      });
      const json = await r.json();
      if (!r.ok) setErro(json.erro ?? `HTTP ${r.status}`);
      else {
        setRel(json);
        setFiltro(null);
        if (!simular) startTransition(() => router.refresh());
      }
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
    } finally {
      setRodando(null);
    }
  }

  const itens = rel?.itens.filter((i) => !filtro || i.status === filtro) ?? [];

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => executar(true)}
          disabled={!temOrigem || rodando !== null}
          className="btn btn-primary"
        >
          {rodando === "simular" ? "Analisando os arquivos..." : "🔍 Simular (não mexe em nada)"}
        </button>
        <button
          type="button"
          onClick={() => executar(false)}
          disabled={!temOrigem || rodando !== null || !rel}
          className="btn btn-accent"
          title={!rel ? "Simule primeiro" : "Executa de verdade"}
        >
          {rodando === "valer" ? "Organizando..." : "▶ Organizar de verdade"}
        </button>
        {!temOrigem && (
          <span className="text-xs text-amber-700">Cadastre um endereço antes.</span>
        )}
      </div>

      {erro && (
        <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">
          ⛔ {erro}
        </div>
      )}

      {rel && (
        <div className="mt-4">
          <div
            className={
              "rounded-lg border px-4 py-3 text-sm " +
              (rel.simulado
                ? "border-slate-200 bg-slate-50 text-slate-700"
                : "border-emerald-200 bg-emerald-50 text-emerald-900")
            }
          >
            <p className="font-semibold">
              {rel.simulado ? "Simulação — nada foi alterado" : "Execução concluída"}
            </p>
            <p className="mt-1 text-xs">
              {rel.arquivosVistos} arquivo(s) analisado(s) em {rel.origens.length} endereço(s)
            </p>
          </div>

          <div className="mt-3 grid gap-2 sm:grid-cols-3 lg:grid-cols-6">
            {[
              ["ARQUIVADO", rel.simulado ? "A arquivar" : "Arquivados", rel.arquivados],
              ["JA_NO_LUGAR", "Já no lugar", rel.jaNoLugar],
              ["JA_EXISTIA", "Já existia", rel.jaExistia],
              ["QUARENTENA", "Quarentena", rel.quarentena],
              ["CONFLITO", "Conflitos", rel.conflitos],
              ["ERRO", "Erros", rel.erros],
            ].map(([status, rotulo, valor]) => (
              <button
                key={String(status)}
                type="button"
                onClick={() => setFiltro(filtro === status ? null : String(status))}
                className={
                  "rounded-lg border px-3 py-2 text-left transition " +
                  (filtro === status
                    ? "border-slate-400 bg-slate-100"
                    : "border-slate-200 bg-white hover:bg-slate-50")
                }
              >
                <div className="text-[11px] uppercase tracking-wide text-slate-500">{rotulo}</div>
                <div className="font-mono text-lg font-semibold text-slate-800">
                  {String(valor)}
                </div>
              </button>
            ))}
          </div>

          {itens.length > 0 && (
            <div className="mt-3 max-h-[28rem] overflow-auto rounded-lg border border-slate-200">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-slate-50">
                  <tr className="text-left text-slate-500">
                    <th className="px-3 py-2 font-semibold">Arquivo</th>
                    <th className="px-3 font-semibold">Tipo</th>
                    <th className="px-3 font-semibold">Cliente</th>
                    <th className="px-3 font-semibold">Situação</th>
                    <th className="px-3 font-semibold">Destino / motivo</th>
                  </tr>
                </thead>
                <tbody>
                  {itens.slice(0, 400).map((i, n) => (
                    <tr key={n} className="border-t border-slate-100 align-top">
                      <td className="px-3 py-1.5 font-mono">{i.nomeArquivo}</td>
                      <td className="px-3 text-slate-600">{i.tipo ?? "—"}</td>
                      <td className="px-3 text-slate-600">{i.cliente ?? "—"}</td>
                      <td className={"px-3 font-semibold " + (CORES[i.status] ?? "")}>
                        {i.status}
                      </td>
                      <td className="px-3 text-slate-500">
                        {i.destino ? (
                          <span className="font-mono text-[10px]">{i.destino}</span>
                        ) : (
                          i.detalhe
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {itens.length > 400 && (
                <p className="border-t border-slate-100 px-3 py-2 text-slate-500">
                  mostrando 400 de {itens.length}
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
