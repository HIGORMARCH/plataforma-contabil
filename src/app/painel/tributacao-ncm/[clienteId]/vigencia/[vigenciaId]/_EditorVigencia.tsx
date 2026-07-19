"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";

interface NcmItem {
  id: string;
  ncm: string;
  origem: string;
  codigoConfig: number;
  descricaoConfig: string;
  cstEntrada: string;
  cstSaida: string;
  natureza: string;
  tipo: string;
}

// Códigos <= CODIGO_ULTIMO_PAI já vieram da semente Autmais (o Higor já cadastrou
// os parâmetros PIS-MP66/COFINS-N no Domínio). Códigos acima são configurações
// NOVAS descobertas pelo sistema — Higor precisa cadastrar manualmente antes
// de importar o TXT.
const CODIGO_ULTIMO_PAI = 57;

interface ResultadoUpload {
  ok: boolean;
  ncmsProcessados: number;
  ncmsCadastradosDaBase: number;
  ncmsResolvidosViaEconet: number;
  ncmsFaltantes: string[];
  econetFalhas?: { ncm: string; erro: string }[];
  arquivoSalvoEm?: string | null;
  parserUsado?: string;
  totalProdutos?: number;
  linhasIgnoradas?: number;
  erro?: string;
}

export function EditorVigencia({
  vigenciaId,
  clienteId,
  ncmsIniciais,
}: {
  vigenciaId: string;
  clienteId: string;
  ncmsIniciais: NcmItem[];
}) {
  const router = useRouter();
  const [uploadando, setUploadando] = useState(false);
  const [resultado, setResultado] = useState<ResultadoUpload | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  async function enviarArquivo(f: File) {
    setUploadando(true);
    setErro(null);
    setResultado(null);
    try {
      const fd = new FormData();
      fd.append("arquivo", f);
      const r = await fetch(`/api/tributacao-ncm/vigencias/${vigenciaId}/upload-estoque`, {
        method: "POST",
        body: fd,
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.erro ?? "Erro no upload");
      setResultado(j);
      router.refresh();
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
    } finally {
      setUploadando(false);
    }
  }

  async function baixarTxt() {
    window.location.href = `/api/tributacao-ncm/vigencias/${vigenciaId}/exportar-txt`;
  }

  // Agrupa NCMs por configuração
  const agrupado = new Map<number, { config: NcmItem; ncms: NcmItem[] }>();
  for (const n of ncmsIniciais) {
    if (!agrupado.has(n.codigoConfig)) agrupado.set(n.codigoConfig, { config: n, ncms: [] });
    agrupado.get(n.codigoConfig)!.ncms.push(n);
  }
  const grupos = [...agrupado.entries()].sort(([a], [b]) => a - b);
  const configsNovas = grupos.filter(([codigo]) => codigo > CODIGO_ULTIMO_PAI);

  return (
    <div>
      {/* Upload */}
      <section className="mb-6">
        <h2 className="mb-3 text-lg font-bold text-slate-800">Importar estoque do cliente</h2>
        <div className="card p-4">
          <p className="mb-3 text-sm text-slate-600">
            Suba a planilha do Domínio (<b>RELAÇÃO DE PRODUTOS.xls</b>). O sistema extrai os NCMs únicos, cruza
            com a base local e — pros NCMs desconhecidos — consulta a Econet automaticamente.
          </p>
          <input
            ref={inputRef}
            type="file"
            accept=".xls,.xlsx,.csv"
            className="block w-full text-sm text-slate-600 file:mr-3 file:rounded file:border-0 file:bg-slate-100 file:px-3 file:py-2 file:text-sm file:font-medium hover:file:bg-slate-200"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) enviarArquivo(f);
            }}
            disabled={uploadando}
          />
          {uploadando && <div className="mt-3 text-sm text-blue-600">Processando planilha...</div>}
          {resultado && resultado.ok && (
            <div className="mt-3 rounded border border-green-300 bg-green-50 p-3 text-sm text-green-900">
              <div>
                ✔ {resultado.ncmsProcessados} NCMs distintos extraídos
                {resultado.totalProdutos ? ` (de ${resultado.totalProdutos} produtos)` : ""}
              </div>
              <ul className="mt-1 space-y-1 pl-4 text-sm">
                <li>
                  <b>{resultado.ncmsCadastradosDaBase}</b> resolvidos direto pela base pai
                </li>
                <li>
                  <b>{resultado.ncmsResolvidosViaEconet}</b> resolvidos automaticamente via Econet
                </li>
                {resultado.ncmsFaltantes.length > 0 && (
                  <li className="text-amber-800">
                    <b>{resultado.ncmsFaltantes.length}</b> NCMs faltantes — precisa revisão manual
                    {resultado.econetFalhas && resultado.econetFalhas.length > 0 && (
                      <span> (falha Econet)</span>
                    )}
                  </li>
                )}
              </ul>
              {resultado.arquivoSalvoEm && (
                <div className="mt-2 break-all text-xs text-slate-600">
                  📁 Arquivo salvo em: <code>{resultado.arquivoSalvoEm}</code>
                </div>
              )}
              {resultado.parserUsado && (
                <div className="text-xs text-slate-500">Parser: {resultado.parserUsado}</div>
              )}
              {resultado.econetFalhas && resultado.econetFalhas.length > 0 && (
                <details className="mt-2 text-xs text-slate-600">
                  <summary className="cursor-pointer">Ver falhas Econet ({resultado.econetFalhas.length})</summary>
                  <ul className="mt-1 space-y-0.5 pl-4 font-mono">
                    {resultado.econetFalhas.slice(0, 20).map((f) => (
                      <li key={f.ncm}>
                        {f.ncm}: {f.erro.slice(0, 80)}
                      </li>
                    ))}
                  </ul>
                </details>
              )}
            </div>
          )}
          {erro && <div className="mt-3 text-sm text-red-600">{erro}</div>}
        </div>
      </section>

      {/* Aviso de configurações NOVAS que precisam cadastro manual no Domínio */}
      {configsNovas.length > 0 && (
        <section className="mb-6 rounded border-l-4 border-amber-500 bg-amber-50 p-4">
          <h3 className="mb-2 text-sm font-bold text-amber-900">
            ⚠ {configsNovas.length} configuração{configsNovas.length > 1 ? "ões" : ""} nova
            {configsNovas.length > 1 ? "s" : ""} — cadastre no Domínio antes de importar
          </h3>
          <p className="mb-3 text-sm text-amber-800">
            Estas configurações têm código &gt; {CODIGO_ULTIMO_PAI} e ainda não existem no Domínio. Antes de importar o
            TXT, cadastre cada uma na tela <b>Configurar Dados de Impostos por NCM/CEST</b>, incluindo os parâmetros{" "}
            <b>PIS-MP66</b> e <b>COFINS-N</b> em Saídas — senão o Domínio recusa a importação.
          </p>
          <ul className="space-y-1 text-sm text-amber-900">
            {configsNovas.map(([codigo, g]) => (
              <li key={codigo} className="font-mono">
                <b>#{codigo}</b> — {g.config.descricaoConfig} (CST {g.config.cstEntrada}/{g.config.cstSaida} · Natureza{" "}
                {g.config.natureza})
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Configurações e NCMs */}
      <section className="mb-6">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-bold text-slate-800">Configurações desta vigência ({grupos.length})</h2>
          {grupos.length > 0 && (
            <button onClick={baixarTxt} className="btn btn-accent">
              ⬇ Baixar TXT pro Domínio
            </button>
          )}
        </div>

        {grupos.length === 0 ? (
          <div className="card p-6 text-center text-sm text-slate-400">
            Nenhum NCM cadastrado ainda. Suba a planilha do estoque acima pra começar.
          </div>
        ) : (
          <div className="space-y-4">
            {grupos.map(([codigo, g]) => {
              const eNova = codigo > CODIGO_ULTIMO_PAI;
              return (
                <div
                  key={codigo}
                  className={`card overflow-hidden ${eNova ? "border-l-4 border-l-amber-500" : ""}`}
                >
                  <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50 px-4 py-3">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-mono text-slate-500">#{codigo}</span>
                      <span className="font-semibold text-slate-800">{g.config.descricaoConfig}</span>
                      {eNova ? (
                        <span className="rounded-full bg-amber-200 px-2 py-0.5 text-xs font-medium text-amber-900">
                          NOVA
                        </span>
                      ) : (
                        <span className="rounded-full bg-slate-200 px-2 py-0.5 text-xs text-slate-600">Pai</span>
                      )}
                    </div>
                    <div className="text-xs text-slate-500">
                      CST {g.config.cstEntrada}/{g.config.cstSaida} · Natureza {g.config.natureza} · {g.ncms.length} NCM
                      {g.ncms.length !== 1 ? "s" : ""}
                    </div>
                  </div>
                  <div className="grid grid-cols-4 gap-x-4 gap-y-1 p-4 font-mono text-xs text-slate-600 md:grid-cols-6">
                    {g.ncms.map((n) => (
                      <div key={n.id}>{n.ncm}</div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
