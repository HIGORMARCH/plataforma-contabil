"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { varrerPastaEcfAction } from "../actions";

/**
 * Varredura de uma fonte de ECF. A pasta vem do CADASTRO do cliente (Pastas do
 * cliente → Fiscal) — a tela só mostra e varre, não se digita caminho aqui.
 */
export function VarrerPastaEcfButton({
  clienteId,
  pasta,
  fonte = "TRANSMITIDO",
  titulo,
  ano,
}: {
  clienteId: string;
  /** Pasta cadastrada para esta fonte; null = não cadastrada. */
  pasta: string | null;
  fonte?: "TRANSMITIDO" | "DOMINIO";
  titulo: string;
  /** Ano em tela — o resultado mostra só os arquivos deste período. */
  ano: number;
}) {
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<{ tipo: "ok" | "erro" | "info"; texto: string } | null>(null);
  const [todosDetalhes, setDetalhes] = useState<Array<{ arquivo: string; ano?: number; acao: string }>>([]);
  const [mostrarDetalhes, setMostrarDetalhes] = useState(false);
  const router = useRouter();

  // Só o período em tela.
  const detalhes = todosDetalhes.filter((d) => d.ano === ano);
  const conta = (teste: (acao: string) => boolean) => detalhes.filter((d) => teste(d.acao)).length;
  const resumoAno =
    todosDetalhes.length > 0
      ? `Ano ${ano}: ${detalhes.length} arquivo(s) · ${conta((a) => a === "importado")} importado(s) · ` +
        `${conta((a) => a === "substituído")} substituído(s) · ${conta((a) => a.startsWith("já importado"))} já importado(s) · ` +
        `${conta((a) => a.startsWith("não importado") || a.startsWith("cópia idêntica"))} não importado(s) · ` +
        `${conta((a) => a.startsWith("FALHA"))} falha(s)`
      : null;

  function varrer() {
    startTransition(async () => {
      setMsg({ tipo: "info", texto: "Varrendo pasta..." });
      const fd = new FormData();
      fd.set("clienteId", clienteId);
      fd.set("fonte", fonte);
      const r = await varrerPastaEcfAction(fd);
      if (r.ok) {
        setMsg(null);
        setDetalhes(r.detalhes);
        if (r.detalhes.some((d) => d.ano === ano && d.acao.startsWith("FALHA"))) setMostrarDetalhes(true);
        router.refresh();
      } else {
        setMsg({ tipo: "erro", texto: r.erro });
        setDetalhes([]);
      }
    });
  }

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3">
      <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">{titulo}</div>
      {pasta ? (
        <p className="mb-2 break-all rounded bg-slate-50 px-2 py-1 font-mono text-[11px] text-slate-600">{pasta}</p>
      ) : (
        <p className="mb-2 text-xs text-amber-700">
          Pasta não cadastrada — preencha em <b>Editar cliente → Pastas do cliente → Fiscal</b>.
        </p>
      )}
      <p className="mb-2 text-[11px] text-slate-500">
        Uma subpasta por ano, <b>um arquivo por ano</b>. Arquivos diferentes do mesmo ano não são
        importados — a varredura aponta quais são.
      </p>
      <button type="button" onClick={varrer} disabled={pending || !pasta} className="btn btn-accent text-sm">
        {pending ? "Varrendo..." : "🔎 Varrer"}
      </button>
      {msg && (
        <p
          className={`mt-2 text-xs ${
            msg.tipo === "erro" ? "text-red-600" : msg.tipo === "ok" ? "text-green-700" : "text-slate-500"
          }`}
        >
          {msg.texto}
        </p>
      )}
      {resumoAno && (
        <p className={`mt-2 text-xs ${detalhes.some((d) => d.acao.startsWith("FALHA")) ? "text-red-600" : "text-green-700"}`}>
          {resumoAno}
        </p>
      )}
      {detalhes.length > 0 && (
        <div className="mt-2">
          <button
            type="button"
            onClick={() => setMostrarDetalhes((v) => !v)}
            className="text-xs text-slate-500 underline"
          >
            {mostrarDetalhes ? "Esconder detalhes" : `Ver detalhes por arquivo (${detalhes.length})`}
          </button>
          {mostrarDetalhes && (
            <ul className="mt-1 max-h-64 overflow-y-auto rounded border border-slate-100 bg-slate-50 p-2 text-[11px]">
              {detalhes.map((d, i) => (
                <li key={i} className={`font-mono ${d.acao.startsWith("FALHA") ? "text-red-700" : ""}`}>
                  <span className="text-slate-500">{d.arquivo}</span>
                  {d.ano ? <span> — {d.ano}</span> : null}
                  <span className="ml-1">→ {d.acao}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
