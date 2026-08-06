"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

type DetalheArquivo = {
  arquivo: string;
  status: "novo" | "atualizado" | "inalterado" | "ignorado" | "erro";
  tipo?: string;
  competencia?: string;
  mensagem?: string;
};

type Relatorio = {
  pasta: string;
  totalArquivos: number;
  catalogados: number;
  ignorados: number;
  erros: number;
  detalhes: DetalheArquivo[];
};

export function VarrerPastaObrigacoesButton({
  clienteId,
  pastaFiscal,
}: {
  clienteId: string;
  pastaFiscal: string | null;
}) {
  const [rodando, setRodando] = useState(false);
  const [relatorio, setRelatorio] = useState<Relatorio | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const router = useRouter();

  async function varrer() {
    setRodando(true);
    setRelatorio(null);
    setErro(null);
    try {
      const res = await fetch("/api/obrigacoes-acessorias/varrer", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ clienteId }),
      });
      const json = await res.json();
      if (!res.ok) {
        setErro(json.erro ?? `HTTP ${res.status}`);
      } else {
        setRelatorio(json as Relatorio);
        startTransition(() => router.refresh());
      }
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
    } finally {
      setRodando(false);
    }
  }

  if (!pastaFiscal) {
    return (
      <div className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
        Cliente sem <strong>Pasta de arquivos fiscais</strong> cadastrada. Configure em{" "}
        <em>Editar cadastro</em> pra habilitar a varredura.
      </div>
    );
  }

  return (
    <div>
      <p className="mb-2 text-xs text-slate-500">
        Varre{" "}
        <code className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[11px]">
          {pastaFiscal}
        </code>{" "}
        e cataloga arquivos ECD, ECF, EFD-Contribuições e DCTF antiga. Cada arquivo é
        registrado com seu <b>mtime</b> — data do arquivo em disco — usado como proxy da
        data de transmissão à Receita.
      </p>
      <button
        type="button"
        onClick={varrer}
        className="btn btn-primary"
        disabled={rodando}
      >
        {rodando ? "Varrendo..." : "🔍 Varrer pasta e catalogar entregas"}
      </button>

      {erro && (
        <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">
          <p className="font-semibold">⛔ {erro}</p>
        </div>
      )}

      {relatorio && (
        <div className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
          <p className="font-semibold">
            ✅ Varredura concluída — {relatorio.totalArquivos} arquivo(s) na pasta
          </p>
          <p className="mt-1 text-xs">
            {relatorio.catalogados} catalogado(s) · {relatorio.ignorados} não identificado(s) ·{" "}
            {relatorio.erros} erro(s)
          </p>

          {/* Sumário por tipo detectado */}
          {relatorio.catalogados > 0 && (
            <div className="mt-2 flex flex-wrap gap-2 text-xs">
              {Object.entries(
                relatorio.detalhes.reduce<Record<string, number>>((acc, d) => {
                  if (d.tipo) acc[d.tipo] = (acc[d.tipo] ?? 0) + 1;
                  return acc;
                }, {}),
              )
                .sort(([a], [b]) => a.localeCompare(b))
                .map(([tipo, qtd]) => (
                  <span
                    key={tipo}
                    className="rounded-full bg-white px-2 py-0.5 font-semibold text-slate-700"
                  >
                    {tipo}: {qtd}
                  </span>
                ))}
            </div>
          )}

          {relatorio.detalhes.length > 0 && (
            <details className="mt-3 text-xs" open>
              <summary className="cursor-pointer text-emerald-800">
                Detalhes por arquivo ({relatorio.detalhes.length})
              </summary>

              {/* Ignorados destacados primeiro (é o que geralmente causa dúvida) */}
              {relatorio.detalhes.some((d) => d.status === "ignorado") && (
                <div className="mt-2 rounded border border-amber-200 bg-amber-50 p-2">
                  <p className="mb-1 font-semibold text-amber-900">
                    Não identificados —{" "}
                    {relatorio.detalhes.filter((d) => d.status === "ignorado").length} arquivo(s)
                    da pasta que não são ECD, ECF, EFD-Contrib nem DCTF antiga
                  </p>
                  <ul className="space-y-0.5">
                    {relatorio.detalhes
                      .filter((d) => d.status === "ignorado")
                      .map((d, i) => (
                        <li key={i} className="font-mono text-[11px] text-amber-800">
                          {d.arquivo}
                          {d.mensagem && (
                            <span className="ml-1 text-amber-700">— {d.mensagem}</span>
                          )}
                        </li>
                      ))}
                  </ul>
                </div>
              )}

              <table className="mt-2 w-full text-[11px]">
                <thead>
                  <tr className="text-left text-slate-500">
                    <th className="pb-1 pr-2">Status</th>
                    <th className="pb-1 pr-2">Tipo</th>
                    <th className="pb-1 pr-2">Competência</th>
                    <th className="pb-1">Arquivo</th>
                  </tr>
                </thead>
                <tbody>
                  {relatorio.detalhes
                    .filter((d) => d.status !== "ignorado")
                    .map((d, i) => (
                      <tr key={i} className="border-t border-emerald-100">
                        <td className="py-1 pr-2">
                          <span
                            className={
                              "rounded px-1.5 py-0.5 text-[10px] uppercase " +
                              (d.status === "novo"
                                ? "bg-emerald-200 text-emerald-900"
                                : d.status === "atualizado"
                                  ? "bg-sky-200 text-sky-900"
                                  : d.status === "inalterado"
                                    ? "bg-slate-200 text-slate-700"
                                    : "bg-red-200 text-red-900")
                            }
                          >
                            {d.status}
                          </span>
                        </td>
                        <td className="py-1 pr-2">
                          {d.tipo && (
                            <span className="rounded bg-white px-1.5 py-0.5 text-[10px] font-semibold text-slate-700">
                              {d.tipo}
                            </span>
                          )}
                        </td>
                        <td className="py-1 pr-2 font-mono">{d.competencia}</td>
                        <td className="py-1 font-mono">{d.arquivo}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </details>
          )}
        </div>
      )}
    </div>
  );
}
