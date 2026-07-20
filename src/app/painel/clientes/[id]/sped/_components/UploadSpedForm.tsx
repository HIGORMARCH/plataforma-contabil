"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

type Resultado = {
  sucesso: boolean;
  mensagem: string;
  apuracoesGravadas: number;
  apuracoesSubstituidas: number;
  registrosE110: number;
  metadata?: {
    cnpj: string | null;
    ie: string | null;
    uf: string | null;
    nome: string | null;
  };
  erro?: string;
};

export function UploadSpedForm({ clienteId }: { clienteId: string }) {
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [resultado, setResultado] = useState<Resultado | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [, startTransition] = useTransition();
  const router = useRouter();

  async function enviar() {
    if (!arquivo) return;
    setEnviando(true);
    setResultado(null);
    try {
      const fd = new FormData();
      fd.append("clienteId", clienteId);
      fd.append("arquivo", arquivo);
      const res = await fetch("/api/sped/upload", { method: "POST", body: fd });
      const json = (await res.json()) as Resultado;
      setResultado(json);
      if (json.sucesso) {
        setArquivo(null);
        // Revalida a listagem
        startTransition(() => router.refresh());
      }
    } catch (e) {
      setResultado({
        sucesso: false,
        mensagem: "Falha ao enviar arquivo",
        apuracoesGravadas: 0,
        apuracoesSubstituidas: 0,
        registrosE110: 0,
        erro: e instanceof Error ? e.message : String(e),
      });
    } finally {
      setEnviando(false);
    }
  }

  return (
    <section className="card p-5">
      <h2 className="mb-1 text-sm font-bold uppercase tracking-wide text-slate-500">
        Importar SPED-Fiscal
      </h2>
      <p className="mb-4 text-xs text-slate-500">
        Arquivo <code>.txt</code> gerado pelo Domínio (ou por qualquer PVA da EFD ICMS/IPI).
        Reimportar a mesma competência <strong>substitui</strong> a apuração anterior — útil pra
        SPED retificador.
      </p>

      <div className="flex flex-wrap items-center gap-3">
        <input
          type="file"
          accept=".txt,text/plain"
          onChange={(e) => {
            setArquivo(e.target.files?.[0] ?? null);
            setResultado(null);
          }}
          className="text-sm file:mr-3 file:rounded-md file:border-0 file:bg-slate-100 file:px-3 file:py-2 file:text-sm file:font-medium hover:file:bg-slate-200"
          disabled={enviando}
        />
        <button
          type="button"
          onClick={enviar}
          className="btn btn-primary"
          disabled={!arquivo || enviando}
        >
          {enviando ? "Importando..." : "Importar"}
        </button>
        {arquivo && !resultado && (
          <span className="text-xs text-slate-500">
            {arquivo.name} · {(arquivo.size / 1024).toFixed(1)} KB
          </span>
        )}
      </div>

      {resultado && (
        <div
          className={
            "mt-4 rounded-lg border px-4 py-3 text-sm " +
            (resultado.sucesso
              ? "border-emerald-200 bg-emerald-50 text-emerald-900"
              : "border-red-200 bg-red-50 text-red-900")
          }
        >
          <p className="font-semibold">
            {resultado.sucesso ? "✅ Importado" : "⛔ Erro"} — {resultado.mensagem}
          </p>
          {resultado.sucesso && (
            <p className="mt-1 text-xs text-emerald-800">
              {resultado.registrosE110} registro(s) E110 encontrado(s) ·{" "}
              {resultado.apuracoesGravadas} nova(s) ·{" "}
              {resultado.apuracoesSubstituidas} substituída(s)
              {resultado.metadata?.cnpj && ` · CNPJ ${resultado.metadata.cnpj}`}
              {resultado.metadata?.ie && ` · IE ${resultado.metadata.ie}`}
              {resultado.metadata?.uf && ` · ${resultado.metadata.uf}`}
            </p>
          )}
          {resultado.erro && (
            <p className="mt-1 text-xs text-red-800">{resultado.erro}</p>
          )}
        </div>
      )}
    </section>
  );
}
