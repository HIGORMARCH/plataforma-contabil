"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

type DetalheArquivo = {
  arquivo: string;
  status: "novo" | "substituido" | "duplicado" | "ie-nao-bate" | "ignorado" | "erro";
  mensagem?: string;
};

type Relatorio = {
  pasta: string;
  totalArquivos: number;
  arquivosProcessados: number;
  arquivosPulados: number;
  ieNaoBate: number;
  novosImportados: number;
  substituidos: number;
  erros: number;
  detalhes: DetalheArquivo[];
};

export function VarrerPastaGiamButton({
  clienteId,
  pastaGiam,
  pastaFiscal,
}: {
  clienteId: string;
  pastaGiam: string | null;
  pastaFiscal: string | null;
}) {
  const [rodando, setRodando] = useState(false);
  const [relatorio, setRelatorio] = useState<Relatorio | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const router = useRouter();

  const pastaEfetiva = pastaGiam || pastaFiscal;

  async function varrer() {
    setRodando(true);
    setRelatorio(null);
    setErro(null);
    try {
      const res = await fetch("/api/giam/varrer", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ clienteId }),
      });
      const json = await res.json();
      if (!res.ok) setErro(json.erro ?? `HTTP ${res.status}`);
      else {
        setRelatorio(json as Relatorio);
        startTransition(() => router.refresh());
      }
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
    } finally {
      setRodando(false);
    }
  }

  return (
    <section className="card p-5">
      <h2 className="mb-1 text-sm font-bold uppercase tracking-wide text-slate-500">
        Buscar GIAM na pasta
      </h2>
      {pastaEfetiva ? (
        <>
          <p className="mb-3 text-xs text-slate-500">
            Varre{" "}
            <code className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[11px]">
              {pastaEfetiva}
            </code>
            . Filtra pela <strong>Inscrição Estadual dentro do arquivo</strong> (pasta pode ser
            compartilhada entre clientes — pega só as GIAMs deste cliente).
          </p>
          <button
            type="button"
            onClick={varrer}
            className="btn btn-primary"
            disabled={rodando}
          >
            {rodando ? "Varrendo..." : "🔍 Buscar novas GIAMs na pasta"}
          </button>
        </>
      ) : (
        <div className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
          Sem pasta GIAM nem pasta fiscal cadastrada. Configure em <em>Editar cadastro</em>.
        </div>
      )}

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
            {relatorio.novosImportados} nova(s) · {relatorio.substituidos} substituída(s) ·{" "}
            {relatorio.arquivosPulados} pulado(s) · {relatorio.ieNaoBate} de outro cliente ·{" "}
            {relatorio.erros} erro(s)
          </p>
          {relatorio.detalhes.length > 0 && (
            <details className="mt-2 text-xs">
              <summary className="cursor-pointer text-emerald-800">Ver detalhes</summary>
              <ul className="mt-2 space-y-1">
                {relatorio.detalhes.map((d, i) => (
                  <li key={i} className="flex flex-wrap items-center gap-2">
                    <span
                      className={
                        "rounded px-1.5 py-0.5 text-[10px] uppercase " +
                        (d.status === "novo"
                          ? "bg-emerald-200 text-emerald-900"
                          : d.status === "substituido"
                            ? "bg-blue-200 text-blue-900"
                            : d.status === "duplicado"
                              ? "bg-slate-200 text-slate-700"
                              : d.status === "ie-nao-bate"
                                ? "bg-slate-100 text-slate-500"
                                : d.status === "erro"
                                  ? "bg-red-200 text-red-900"
                                  : "bg-amber-200 text-amber-900")
                      }
                    >
                      {d.status}
                    </span>
                    <span className="font-mono">{d.arquivo}</span>
                    {d.mensagem && <span className="text-emerald-800">— {d.mensagem}</span>}
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>
      )}
    </section>
  );
}
