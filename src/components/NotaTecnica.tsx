"use client";

import { useState } from "react";
import { salvarNotaTecnicaAction } from "@/app/painel/relatorios/actions";

interface Props {
  relatorioId: string;
  empresa?: string;
  cnpj?: string;
  exercicio?: string;
  contador?: string;
  crc?: string;
  // Valores atuais (carregados do BD — vêm do relatório persistido).
  textoInicial?: string | null;
  contextoInicial?: string | null;
  origemInicial?: string | null;
}

interface RespostaGerar {
  texto: string;
  origem: "ia" | "deterministico";
  modelo?: string | null;
  observacao?: string | null;
}

const EXEMPLOS = [
  "Primeiro exercício da empresa — ano de constituição, com investimento inicial significativo em estoque e imobilizado.",
  "Ano de expansão — abertura de nova filial e reforço de capital de giro.",
  "Ano de retração — perda de contrato principal (~40% do faturamento) e reestruturação em curso.",
  "Ano de transição societária — mudança no quadro de sócios e capitalização parcial dos mútuos.",
];

export function NotaTecnica({
  relatorioId, empresa, cnpj, exercicio, contador, crc,
  textoInicial, contextoInicial, origemInicial,
}: Props) {
  const [contexto, setContexto] = useState(contextoInicial ?? "");
  const [anexosTexto, setAnexosTexto] = useState("");
  const [texto, setTexto] = useState(textoInicial ?? "");
  const [origem, setOrigem] = useState<string | null>(origemInicial ?? null);
  const [observacao, setObservacao] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [baixando, setBaixando] = useState(false);
  const [msg, setMsg] = useState("");
  const [erro, setErro] = useState("");

  async function gerar() {
    setCarregando(true); setErro(""); setMsg(""); setObservacao(null);
    try {
      const anexos = anexosTexto.split("\n").map((s) => s.trim()).filter(Boolean);
      const r = await fetch("/api/nota-tecnica", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ relatorioId, contexto, anexos }),
      });
      if (!r.ok) {
        const d = await r.json().catch(() => ({ erro: "Falha" }));
        setErro(d.erro ?? `HTTP ${r.status}`);
        return;
      }
      const d = (await r.json()) as RespostaGerar;
      setTexto(d.texto);
      setOrigem(d.origem);
      setObservacao(d.observacao ?? null);
      setMsg("Nota técnica gerada e salva. Aparece anexa ao relatório abaixo.");
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setCarregando(false);
    }
  }

  async function salvarEdicao() {
    setSalvando(true); setErro(""); setMsg("");
    try {
      const r = await salvarNotaTecnicaAction(relatorioId, {
        contexto, texto, origem: (origem as "ia" | "deterministico") ?? "deterministico",
      });
      if (!r.ok) setErro(r.erro ?? "Falha ao salvar");
      else setMsg("Alterações salvas. A nota anexa ao relatório foi atualizada.");
    } finally { setSalvando(false); }
  }

  async function baixar() {
    if (!texto.trim()) return;
    setBaixando(true);
    try {
      const r = await fetch("/api/nota-tecnica/docx", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          texto, titulo: "NOTA TÉCNICA CONTEXTUAL",
          empresa, cnpj, exercicio, contador, crc,
        }),
      });
      if (!r.ok) { setErro("Falha ao gerar Word"); return; }
      const blob = await r.blob();
      const cd = r.headers.get("Content-Disposition") ?? "";
      const m = cd.match(/filename="([^"]+)"/);
      const nome = m?.[1] ?? "nota-tecnica.doc";
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = nome; a.click();
      URL.revokeObjectURL(url);
    } finally { setBaixando(false); }
  }

  return (
    <section className="card mb-6 border-l-4 border-l-[var(--brand)] p-5">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <h2 className="text-sm font-bold uppercase tracking-wide text-slate-500">
            Nota Técnica Contextual
          </h2>
          <p className="mt-1 text-xs text-slate-400">
            {texto
              ? "Anexa automaticamente ao relatório principal. Ajuste o contexto e regere quando quiser."
              : "Ainda não gerada. Ao gerar, fica anexa ao relatório."}
          </p>
        </div>
        {origem && (
          <span className={`rounded px-2 py-0.5 text-xs font-medium ${origem === "ia" ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"}`}>
            {origem === "ia" ? "Gerada por IA" : "Esboço determinístico"}
          </span>
        )}
      </div>

      <label className="label mt-2">Contexto do exercício</label>
      <div className="mb-2 flex flex-wrap gap-1">
        {EXEMPLOS.map((ex, i) => (
          <button key={i} type="button"
            onClick={() => setContexto(ex)}
            className="rounded border border-slate-200 bg-slate-50 px-2 py-0.5 text-xs text-slate-600 hover:bg-slate-100">
            exemplo {i + 1}
          </button>
        ))}
      </div>
      <textarea
        className="input mb-3"
        rows={3}
        placeholder="Ex.: Primeiro exercício. Investimento inicial em estoque (R$ 353 mil) e imobilizado (R$ 179 mil). Aporte do sócio via mútuo (R$ 425 mil)..."
        value={contexto}
        onChange={(e) => setContexto(e.target.value)}
      />

      <label className="label">Documentos e cruzamentos que acompanham a nota (um por linha)</label>
      <textarea
        className="input mb-3"
        rows={3}
        placeholder={"Ex.:\nRelação de obrigações acessórias entregues em 2022 (PGDAS, DCTFWeb, DEFIS)\nComprovantes de recolhimento de DAS/DCTFWeb do exercício\nExtrato bancário comprovando os aportes do sócio"}
        value={anexosTexto}
        onChange={(e) => setAnexosTexto(e.target.value)}
      />

      <div className="mb-3 flex flex-wrap gap-2">
        <button className="btn btn-primary" onClick={gerar} disabled={carregando}>
          {carregando ? "Gerando..." : (texto ? "Gerar novamente" : "Gerar nota técnica")}
        </button>
        {texto && (
          <>
            <button className="btn btn-ghost" onClick={salvarEdicao} disabled={salvando}>
              {salvando ? "Salvando..." : "Salvar edição"}
            </button>
            <button className="btn btn-accent" onClick={baixar} disabled={baixando}>
              {baixando ? "Baixando..." : "Baixar em Word (.doc)"}
            </button>
          </>
        )}
      </div>

      {erro && <div className="mb-3 rounded bg-red-50 px-3 py-2 text-sm text-red-700">{erro}</div>}
      {msg && !erro && <div className="mb-3 rounded bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{msg}</div>}
      {observacao && !erro && (
        <div className="mb-3 rounded bg-amber-50 px-3 py-2 text-xs text-amber-800">{observacao}</div>
      )}

      {texto && (
        <>
          <label className="label">Texto da nota (editável — clique em "Salvar edição" para persistir)</label>
          <textarea
            className="input font-mono text-xs"
            rows={20}
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
          />
        </>
      )}
    </section>
  );
}
