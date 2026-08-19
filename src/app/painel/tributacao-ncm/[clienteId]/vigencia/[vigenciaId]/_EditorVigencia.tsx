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
  /**
   * true = a linha aponta pra uma ConfiguracaoNcm nossa (numeração global).
   * false = veio da tabela legada do cliente, e o código é o DELE, do Domínio.
   */
  temConfigNossa: boolean;
}

// Códigos <= CODIGO_ULTIMO_PAI já vieram da semente Autmais (o Higor já cadastrou
// os parâmetros PIS-MP66/COFINS-N no Domínio). Códigos acima são configurações
// NOVAS descobertas pelo sistema — Higor precisa cadastrar manualmente antes
// de importar o TXT.
const CODIGO_ULTIMO_PAI = 57;

interface ResultadoEconetItem {
  ncm: string;
  ok: boolean;
  tipo?: string;
  codigo?: number;
  descricao?: string;
  erro?: string;
  diagnostico?: string;
  /** "base" = já estava na nossa tabela; "econet" = foi consultado agora. */
  fonte?: "base" | "econet";
}

/**
 * Falha que derrubou o lote inteiro (sessão vencida, rede fora, sem sessão
 * cadastrada). Sem isto, a tela mostrava só a linha do primeiro NCM e dava a
 * impressão de que os outros tinham sido consultados e passado — que é
 * exatamente o tipo de silêncio que fez 70 consultas erradas passarem em julho.
 */
interface AvisoEconet {
  diagnostico: string;
  erro: string;
  naoTentados: number;
}

interface ResultadoDePara {
  ok: boolean;
  aplicado: boolean;
  totalNaVigencia: number;
  jaVinculados: number;
  casados: number;
  semCorrespondencia: number;
  ncmsParaEconet: string[];
  preview: {
    ncm: string;
    codigoCliente: number | null;
    descricaoCliente: string | null;
    nossoCodigo: number;
    nossaDescricao: string;
    tipo: string;
  }[];
}

interface ResultadoTabelaLegada {
  ok: boolean;
  incluidos: number;
  ignorados: number;
  codigos: number;
  ncmsUnicos: number;
  proximoCodigoCliente: number;
  avisos: string[];
  /** De-para automático feito na importação. */
  vinculadosNaBase?: number;
  semCorrespondencia?: number;
  ncmsParaEconet?: string[];
}

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

const ROTULO_REGIME: Record<string, string> = {
  normal: "Tributação normal",
  monofasico: "Monofásico",
  aliquota_zero: "Alíquota zero",
  isenta: "Isenta",
  substituicao: "Substituição tributária",
  legado: "Sem classificação",
};

/**
 * Lista os NCMs da vigência por REGIME, com a contagem à frente.
 *
 * A vigência espelha a base inteira — são milhares de NCMs. Renderizar tudo
 * aberto trava o navegador, então cada regime abre só quando clicado, e dentro
 * dele as configurações (que trazem CST e natureza) abrem uma a uma.
 */
function ListaPorRegime({ grupos }: { grupos: [number, { config: NcmItem; ncms: NcmItem[] }][] }) {
  const [regimeAberto, setRegimeAberto] = useState<string | null>(null);
  const [configAberta, setConfigAberta] = useState<number | null>(null);

  // Regime → configurações daquele regime
  const porRegime = new Map<string, [number, { config: NcmItem; ncms: NcmItem[] }][]>();
  for (const g of grupos) {
    const tipo = g[1].config.tipo || "legado";
    const arr = porRegime.get(tipo) ?? [];
    arr.push(g);
    porRegime.set(tipo, arr);
  }

  const regimes = [...porRegime.entries()]
    .map(([tipo, gs]) => ({
      tipo,
      configs: gs,
      total: gs.reduce((s, [, g]) => s + g.ncms.length, 0),
    }))
    .sort((a, b) => b.total - a.total);

  return (
    <div className="space-y-2">
      {regimes.map((r) => {
        const aberto = regimeAberto === r.tipo;
        return (
          <div key={r.tipo} className="card overflow-hidden">
            <button
              type="button"
              className="flex w-full items-center justify-between px-4 py-3 text-left hover:bg-slate-50"
              onClick={() => {
                setRegimeAberto(aberto ? null : r.tipo);
                setConfigAberta(null);
              }}
            >
              <span className="flex items-center gap-2 font-semibold text-slate-800">
                <span className="text-slate-400">{aberto ? "▾" : "▸"}</span>
                {ROTULO_REGIME[r.tipo] ?? r.tipo}
              </span>
              <span className="text-sm text-slate-500">
                <b className="text-slate-800">{r.total.toLocaleString("pt-BR")}</b> NCM
                {r.total !== 1 ? "s" : ""} · {r.configs.length} configuraç
                {r.configs.length !== 1 ? "ões" : "ão"}
              </span>
            </button>

            {aberto && (
              <div className="border-t border-slate-100">
                {r.configs
                  .sort(([a], [b]) => a - b)
                  .map(([codigo, g]) => {
                    const abertaEssa = configAberta === codigo;
                    return (
                      <div key={codigo} className="border-b border-slate-100 last:border-b-0">
                        <button
                          type="button"
                          className="flex w-full items-center justify-between px-4 py-2 text-left text-sm hover:bg-slate-50"
                          onClick={() => setConfigAberta(abertaEssa ? null : codigo)}
                        >
                          <span className="flex items-center gap-2">
                            <span className="text-slate-400">{abertaEssa ? "▾" : "▸"}</span>
                            <span className="font-mono text-slate-500">#{codigo}</span>
                            <span className="text-slate-700">{g.config.descricaoConfig}</span>
                          </span>
                          <span className="text-xs text-slate-500">
                            CST {g.config.cstEntrada}/{g.config.cstSaida} · Natureza{" "}
                            {g.config.natureza} · {g.ncms.length} NCM{g.ncms.length !== 1 ? "s" : ""}
                          </span>
                        </button>
                        {abertaEssa && (
                          <div className="grid grid-cols-4 gap-x-4 gap-y-1 bg-slate-50 px-4 py-3 font-mono text-xs text-slate-600 md:grid-cols-8">
                            {g.ncms.map((n) => (
                              <div key={n.id}>{n.ncm}</div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
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
  const [importandoLegado, setImportandoLegado] = useState(false);
  const [resultadoLegado, setResultadoLegado] = useState<ResultadoTabelaLegada | null>(null);
  const [ncmsBusca, setNcmsBusca] = useState("");
  const [consultando, setConsultando] = useState(false);
  const [resultadoEconet, setResultadoEconet] = useState<ResultadoEconetItem[] | null>(null);
  const [avisoEconet, setAvisoEconet] = useState<AvisoEconet | null>(null);
  const [resumoEconet, setResumoEconet] = useState<{
    resolvidosNaBase: number;
    consultadosNaEconet: number;
  } | null>(null);
  const [deParando, setDeParando] = useState(false);
  const [dePara, setDePara] = useState<ResultadoDePara | null>(null);

  async function rodarDePara(aplicar: boolean) {
    setDeParando(true);
    setErro(null);
    try {
      const r = await fetch(`/api/tributacao-ncm/vigencias/${vigenciaId}/de-para-base`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ aplicar }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.erro ?? "Erro no de-para");
      setDePara(j);
      // Os que sobraram já entram no campo de consulta — é o passo seguinte.
      if (j.ncmsParaEconet?.length) setNcmsBusca(j.ncmsParaEconet.join(" "));
      if (aplicar) router.refresh();
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
    } finally {
      setDeParando(false);
    }
  }

  async function consultarEconet() {
    const ncms = ncmsBusca
      .split(/[\s,;]+/)
      .map((s) => s.replace(/\D/g, ""))
      .filter((s) => s.length === 8);
    if (ncms.length === 0) {
      setErro("Informe ao menos um NCM com 8 dígitos.");
      return;
    }
    setConsultando(true);
    setErro(null);
    setResultadoEconet(null);
    setAvisoEconet(null);
    setResumoEconet(null);
    try {
      const r = await fetch(`/api/tributacao-ncm/vigencias/${vigenciaId}/consultar-econet`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ncms }),
      });
      const j = await r.json();

      // Sem sessão cadastrada a API responde 409 com diagnóstico — é aviso pro
      // contador ("renove a sessão"), não erro técnico numa faixa vermelha.
      if (r.status === 409 && j.diagnostico) {
        setAvisoEconet({ diagnostico: j.diagnostico, erro: j.erro, naoTentados: ncms.length });
        return;
      }
      if (!r.ok) throw new Error(j.erro ?? "Erro na consulta");

      setResultadoEconet(j.resultados ?? []);
      setResumoEconet({
        resolvidosNaBase: j.resolvidosNaBase ?? 0,
        consultadosNaEconet: j.consultadosNaEconet ?? 0,
      });
      // Lote abortado no meio: a API devolve 200 com ok:false e diz quantos
      // NCMs nem chegaram a ser tentados.
      if (j.diagnostico) {
        setAvisoEconet({
          diagnostico: j.diagnostico,
          erro: j.erro ?? "",
          naoTentados: j.naoTentados ?? 0,
        });
      }
      router.refresh();
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
    } finally {
      setConsultando(false);
    }
  }

  async function enviarTabelaLegada(f: File) {
    setImportandoLegado(true);
    setErro(null);
    setResultadoLegado(null);
    try {
      const fd = new FormData();
      fd.append("arquivo", f);
      const r = await fetch(
        `/api/tributacao-ncm/vigencias/${vigenciaId}/importar-tabela-legada`,
        { method: "POST", body: fd },
      );
      const j = await r.json();
      if (!r.ok) throw new Error(j.erro ?? "Erro ao importar a tabela do cliente");
      setResultadoLegado(j);
      // O que a base não cobriu já vai pro campo de consulta — é o passo seguinte.
      if (j.ncmsParaEconet?.length) setNcmsBusca(j.ncmsParaEconet.join(" "));
      router.refresh();
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
    } finally {
      setImportandoLegado(false);
    }
  }

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
  // Só configuração NOSSA acima do limite da semente é "nova pra cadastrar no
  // Domínio". Linha da tabela legada do cliente já existe no Domínio dele —
  // incluí-la aqui mandava o contador cadastrar de novo o que já estava lá.
  const configsNovas = grupos.filter(
    ([codigo, g]) => g.config.temConfigNossa && codigo > CODIGO_ULTIMO_PAI,
  );

  const totalLegado = ncmsIniciais.filter((n) => n.origem === "cliente_legado").length;

  return (
    <div>
      {/* PASSO 1 — cruzar a tabela do cliente com a nossa base antes de
          pensar em Econet. A nossa base é muito maior que a dele; consultar o
          site pra NCM que já temos classificado é ida desnecessária. */}
      <section className="mb-6">
        <h2 className="mb-3 text-lg font-bold text-slate-800">
          De-para com a nossa base
        </h2>
        <div className="card p-4">
          <p className="mb-3 text-sm text-slate-600">
            Cruza os NCMs da tabela do cliente com a nossa base pelo código NCM. O que já temos
            classificado é vinculado aqui mesmo; só o que sobrar precisa ir à Econet. Linhas já
            vinculadas não são alteradas.
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="btn"
              onClick={() => rodarDePara(false)}
              disabled={deParando}
            >
              {deParando ? "Cruzando..." : "Simular de-para"}
            </button>
            {dePara && !dePara.aplicado && dePara.casados > 0 && (
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => rodarDePara(true)}
                disabled={deParando}
              >
                Aplicar em {dePara.casados} NCMs
              </button>
            )}
          </div>

          {dePara && (
            <div className="mt-4">
              <div
                className={`rounded border px-3 py-2 text-sm ${
                  dePara.aplicado
                    ? "border-green-200 bg-green-50 text-green-900"
                    : "border-slate-200 bg-slate-50 text-slate-700"
                }`}
              >
                <p>
                  {dePara.aplicado ? "✔ Aplicado: " : "Prévia: "}
                  <b>{dePara.casados}</b> NCMs do cliente {dePara.aplicado ? "foram" : "seriam"}{" "}
                  classificados pela nossa base
                  {dePara.jaVinculados > 0 && <> · {dePara.jaVinculados} já estavam vinculados</>}
                  {" · "}
                  <b>{dePara.semCorrespondencia}</b> não estão na nossa base
                </p>
                {dePara.semCorrespondencia > 0 && (
                  <p className="mt-1">
                    Os {dePara.semCorrespondencia} que faltam já foram jogados no campo de consulta
                    da Econet abaixo.
                  </p>
                )}
              </div>

              {dePara.preview.length > 0 && (
                <div className="mt-3 max-h-80 overflow-auto rounded border border-slate-200">
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 bg-slate-50 text-left text-xs uppercase text-slate-500">
                      <tr>
                        <th className="px-3 py-2">NCM</th>
                        <th className="px-3 py-2">Na tabela do cliente</th>
                        <th className="px-3 py-2">Na nossa base</th>
                      </tr>
                    </thead>
                    <tbody>
                      {dePara.preview.map((p) => (
                        <tr key={p.ncm} className="border-t border-slate-100">
                          <td className="px-3 py-2 font-mono">{p.ncm}</td>
                          <td className="px-3 py-2 text-slate-600">
                            #{p.codigoCliente ?? "—"} {p.descricaoCliente}
                          </td>
                          <td className="px-3 py-2 text-emerald-700">
                            #{p.nossoCodigo} {p.nossaDescricao}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>
      </section>

      {/* PASSO 2 — só o que o de-para não resolveu. Sem script, sem depender
          de lembrar que existe um .py no Z:. */}
      <section className="mb-6">
        <h2 className="mb-3 text-lg font-bold text-slate-800">Consultar NCM na Econet</h2>
        <div className="card p-4">
          <p className="mb-3 text-sm text-slate-600">
            Digite um ou mais NCMs (separados por vírgula, espaço ou linha). A classificação vem da
            Econet e é gravada nesta vigência e na base padrão. NCM que já está na vigência não é
            reclassificado.
          </p>
          <textarea
            rows={2}
            className="input mb-3 font-mono text-sm"
            placeholder="33051000, 96190000"
            value={ncmsBusca}
            onChange={(e) => setNcmsBusca(e.target.value)}
            disabled={consultando}
          />
          <button
            type="button"
            className="btn btn-primary"
            onClick={consultarEconet}
            disabled={consultando || !ncmsBusca.trim()}
          >
            {consultando ? "Consultando..." : "Consultar Econet"}
          </button>
          <p className="mt-2 text-xs text-slate-400">
            Credencial e status da sessão ficam em Administração → Configurações.
          </p>

          {avisoEconet && (
            <div
              className={`mt-3 rounded border px-3 py-2 text-sm ${
                avisoEconet.diagnostico === "LAYOUT_MUDOU"
                  ? "border-red-200 bg-red-50 text-red-900"
                  : "border-amber-200 bg-amber-50 text-amber-900"
              }`}
            >
              <p className="font-semibold">
                {avisoEconet.diagnostico === "SESSAO_AUSENTE" && "Nenhuma sessão da Econet cadastrada"}
                {avisoEconet.diagnostico === "SESSAO_EXPIRADA" && "A sessão da Econet venceu"}
                {avisoEconet.diagnostico === "ERRO_REDE" && "Não foi possível falar com a Econet"}
                {avisoEconet.diagnostico === "LAYOUT_MUDOU" && "A Econet respondeu num formato inesperado"}
              </p>
              <p className="mt-1">{avisoEconet.erro}</p>
              {avisoEconet.naoTentados > 0 && (
                <p className="mt-1 font-semibold">
                  A consulta parou aqui: {avisoEconet.naoTentados}{" "}
                  {avisoEconet.naoTentados === 1 ? "NCM não foi consultado" : "NCMs não foram consultados"}.
                  Resolva o aviso acima e consulte de novo.
                </p>
              )}
            </div>
          )}

          {resumoEconet && (resumoEconet.resolvidosNaBase > 0 || resumoEconet.consultadosNaEconet > 0) && (
            <p className="mt-3 text-sm text-slate-600">
              <b>{resumoEconet.resolvidosNaBase}</b> resolvidos pela nossa tabela (sem ir à Econet)
              {resumoEconet.consultadosNaEconet > 0 && (
                <> · <b>{resumoEconet.consultadosNaEconet}</b> consultados na Econet</>
              )}
            </p>
          )}

          {resultadoEconet && (
            <div className="mt-3 overflow-x-auto rounded border border-slate-200">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
                  <tr>
                    <th className="px-3 py-2">NCM</th>
                    <th className="px-3 py-2">Origem</th>
                    <th className="px-3 py-2">Resultado</th>
                  </tr>
                </thead>
                <tbody>
                  {resultadoEconet.map((r) => (
                    <tr key={r.ncm} className="border-t border-slate-100">
                      <td className="px-3 py-2 font-mono">{r.ncm}</td>
                      <td className="px-3 py-2 text-xs">
                        {r.fonte === "base" && <span className="text-slate-500">tabela local</span>}
                        {r.fonte === "econet" && <span className="text-slate-500">Econet</span>}
                        {!r.fonte && <span className="text-slate-400">—</span>}
                      </td>
                      <td className="px-3 py-2">
                        {r.ok ? (
                          <span className="text-emerald-700">
                            {r.tipo} — {r.descricao} (código {r.codigo})
                          </span>
                        ) : (
                          <span className="text-amber-800">{r.erro}</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>
      {/* Tabela que o cliente já tem no Domínio */}
      <section className="mb-6">
        <h2 className="mb-3 text-lg font-bold text-slate-800">
          Tabela atual do cliente (Domínio)
        </h2>
        <div className="card p-4">
          {totalLegado > 0 ? (
            <p className="text-sm text-slate-600">
              ✔ <b>{totalLegado} NCMs</b> importados da tabela que o cliente já usa. Eles ficam{" "}
              <b>intocáveis</b>: as próximas planilhas só acrescentam o que faltar, nunca
              reclassificam o que já está aqui.
            </p>
          ) : (
            <>
              <p className="mb-3 text-sm text-slate-600">
                Se o cliente <b>já tem</b> tabela de tributação no Domínio, importe-a primeiro. Sem
                isso, o sistema montaria a vigência do zero pela nossa base e atropelaria a
                classificação que ele já usa.
              </p>
              <p className="mb-3 text-xs text-slate-500">
                Formato esperado: <code>código|descrição|NCM</code>, uma linha por NCM — o extrato
                que o Domínio gera. Arquivo em Latin-1, geralmente sem extensão.
              </p>
              <input
                type="file"
                className="block w-full text-sm text-slate-600 file:mr-3 file:rounded file:border-0 file:bg-slate-100 file:px-3 file:py-2 file:text-sm file:font-medium hover:file:bg-slate-200"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) enviarTabelaLegada(f);
                }}
                disabled={uploadando || importandoLegado}
              />
              {importandoLegado && (
                <div className="mt-3 text-sm text-blue-600">Importando tabela do cliente...</div>
              )}
            </>
          )}
          {resultadoLegado && (
            <div className="mt-3 rounded border border-green-300 bg-green-50 p-3 text-sm text-green-900">
              <div>
                ✔ {resultadoLegado.incluidos} NCMs incluídos em {resultadoLegado.codigos} códigos
                {resultadoLegado.ignorados > 0 && ` · ${resultadoLegado.ignorados} já existiam`}
              </div>
              <div className="mt-1 text-xs">
                Os NCMs novos serão numerados a partir do código{" "}
                <b>{resultadoLegado.proximoCodigoCliente}</b>.
              </div>
              {resultadoLegado.vinculadosNaBase !== undefined && (
                <div className="mt-2 border-t border-green-200 pt-2 text-sm">
                  De-para com a nossa base: <b>{resultadoLegado.vinculadosNaBase}</b> já
                  classificados na hora
                  {(resultadoLegado.semCorrespondencia ?? 0) > 0 ? (
                    <>
                      {" · "}
                      <b>{resultadoLegado.semCorrespondencia}</b> não estão na base e foram jogados
                      no campo de consulta da Econet.
                    </>
                  ) : (
                    <> · nenhum precisou da Econet.</>
                  )}
                </div>
              )}
              {resultadoLegado.avisos.length > 0 && (
                <ul className="mt-2 list-disc pl-5 text-xs text-amber-800">
                  {resultadoLegado.avisos.map((a, i) => (
                    <li key={i}>{a}</li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      </section>

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
            {/* "configuração" + "ões" saía "configuraçãoões" — o plural troca o
                radical inteiro, não acrescenta sufixo. */}
            ⚠ {configsNovas.length} {configsNovas.length > 1 ? "configurações novas" : "configuração nova"}
            {" "}— cadastre no Domínio antes de importar
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
          <ListaPorRegime grupos={grupos} />
        )}
      </section>
    </div>
  );
}
