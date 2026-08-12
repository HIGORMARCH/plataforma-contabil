"use client";

import { useState, useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";
import { exportarXlsxAction } from "../actions";

interface Props {
  clienteId: string;
  ano: number;
  totalDivergentes: number;
  totalGeral: number;
  filtroAtual: "divergentes" | "todas";
}

export function ToolbarBalancete({
  clienteId,
  ano,
  totalDivergentes,
  totalGeral,
  filtroAtual,
}: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const [pendingExport, startExport] = useTransition();
  const [erroExport, setErroExport] = useState<string | null>(null);

  function trocarFiltro(novo: "divergentes" | "todas") {
    const params = new URLSearchParams();
    params.set("ano", String(ano));
    if (novo === "todas") params.set("incluir", "todas");
    router.push(`${pathname}?${params.toString()}`);
  }

  function imprimir(escopo: "sistema" | "ecd" | "ambos") {
    // Aplica classe temporária no body (CSS @media print esconde o lado
    // fora do escopo) + injeta @page com orientação adequada:
    //   ambos → landscape (12 colunas precisam da largura)
    //   sistema/ecd → portrait (6 colunas cabem melhor em retrato)
    const body = document.body;
    body.classList.add(`print-escopo-${escopo}`);
    const orientacao = escopo === "ambos" ? "landscape" : "portrait";
    const styleTag = document.createElement("style");
    styleTag.setAttribute("data-print-orient", orientacao);
    styleTag.textContent = `@page { size: A4 ${orientacao}; margin: 15mm 12mm 18mm 12mm; }`;
    document.head.appendChild(styleTag);
    // Delay 0 pra garantir que classe + style entraram no DOM antes do print
    setTimeout(() => {
      window.print();
      setTimeout(() => {
        body.classList.remove(`print-escopo-${escopo}`);
        styleTag.remove();
      }, 100);
    }, 0);
  }

  function exportar() {
    setErroExport(null);
    startExport(async () => {
      const fd = new FormData();
      fd.set("clienteId", clienteId);
      fd.set("ano", String(ano));
      fd.set("incluir", filtroAtual);
      const r = await exportarXlsxAction(fd);
      if (!r.ok) {
        setErroExport(r.erro);
        return;
      }
      // Dispara download a partir do base64 devolvido
      const bin = atob(r.base64);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      const blob = new Blob([bytes], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = r.nomeArquivo;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    });
  }

  return (
    <div className="toolbar-balancete no-print">
      <div className="toolbar-group">
        <span className="eyebrow mr-2">Mostrar</span>
        <button
          type="button"
          className="chip-year"
          data-active={filtroAtual === "divergentes"}
          onClick={() => trocarFiltro("divergentes")}
        >
          Só divergentes ({totalDivergentes})
        </button>
        <button
          type="button"
          className="chip-year"
          data-active={filtroAtual === "todas"}
          onClick={() => trocarFiltro("todas")}
        >
          Todas as contas ({totalGeral})
        </button>
      </div>

      <div className="toolbar-group">
        <span className="eyebrow mr-2">Imprimir</span>
        <button
          type="button"
          className="btn btn-ghost"
          onClick={() => imprimir("sistema")}
          title="Imprimir só o balancete do Sistema"
        >
          Sistema
        </button>
        <button
          type="button"
          className="btn btn-ghost"
          onClick={() => imprimir("ecd")}
          title="Imprimir só o balancete da ECD Transmitida"
        >
          ECD
        </button>
        <button
          type="button"
          className="btn btn-ghost"
          onClick={() => imprimir("ambos")}
          title="Imprimir os dois balancetes lado a lado"
        >
          Ambos
        </button>
        <span className="mx-2 text-[11px] text-[var(--ink-soft)]">
          ({filtroAtual === "divergentes" ? "só divergentes" : "completo"})
        </span>
        <button
          type="button"
          className="btn btn-accent"
          onClick={exportar}
          disabled={pendingExport}
        >
          {pendingExport ? "Gerando..." : "Exportar Excel"}
        </button>
      </div>

      {erroExport && (
        <div className="notice mt-2 w-full" data-tone="err">
          {erroExport}
        </div>
      )}

      <style jsx>{`
        .toolbar-balancete {
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          justify-content: space-between;
          gap: 1rem;
          padding: 0.7rem 1rem;
          margin-bottom: 1.25rem;
          background: var(--paper);
          border: 1px solid var(--rule);
          border-radius: 0.35rem;
        }
        .toolbar-group {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          flex-wrap: wrap;
        }
      `}</style>
    </div>
  );
}
