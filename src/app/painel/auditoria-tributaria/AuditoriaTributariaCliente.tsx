"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

type ClienteOpcao = {
  id: string;
  razaoSocial: string;
  nomeFantasia: string | null;
  cnpj: string;
  metodoAcessoEcac: string;
};

/** Rotulo legível do método de acesso e-CAC. */
function rotuloMetodo(metodo: string): string {
  return metodo === "CERTIFICADO_PROPRIO"
    ? "certificado próprio"
    : "procuração eletrônica do escritório";
}

export type StatusGuia = "PAGA" | "PAGA_ATRASO" | "ABERTA" | "NAO_ENCONTRADA_B";
export type SituacaoCadastral = "REGULAR" | "PENDENTE" | "SUSPENSO";
export type CategoriaTributo = "VENDAS_LUCRO" | "FOLHA";

export type Guia = {
  id: string;
  clienteId: string;
  empresa: string;
  cnpj: string;
  competencia: string;
  tributo: string;
  categoria: CategoriaTributo;
  a: { principal: number; encargos: number; codigo: string; chave: string } | null;
  b: { principal: number; encargos: number; codigo: string; autenticacao: string } | null;
  status: StatusGuia;
  situacaoCadastral: SituacaoCadastral;
};

export type UltimaSync = {
  executadoEm: string;
  tipo: string;
  periodoInicial: string;
  periodoFinal: string;
};

const TRIBUTOS = [
  { valor: "TODOS", rotulo: "Todos" },
  { valor: "IRPJ", rotulo: "IRPJ" },
  { valor: "CSLL", rotulo: "CSLL" },
  { valor: "PIS", rotulo: "PIS" },
  { valor: "COFINS", rotulo: "COFINS" },
  { valor: "INSS", rotulo: "INSS (patronal)" },
  { valor: "IRRF", rotulo: "IRRF (folha)" },
  { valor: "FGTS", rotulo: "FGTS" },
];

const CATEGORIAS: Array<{ valor: "TODAS" | CategoriaTributo; rotulo: string }> = [
  { valor: "TODAS", rotulo: "Todas" },
  { valor: "VENDAS_LUCRO", rotulo: "Vendas e Lucro" },
  { valor: "FOLHA", rotulo: "Folha de Pagamento" },
];

const ROTULO_CATEGORIA: Record<CategoriaTributo, string> = {
  VENDAS_LUCRO: "Impostos sobre Vendas e Lucro",
  FOLHA: "Impostos de Folha de Pagamento",
};

const ROTULO_CURTO_CATEGORIA: Record<CategoriaTributo, string> = {
  VENDAS_LUCRO: "Vendas/Lucro",
  FOLHA: "Folha",
};


const BRL = (n: number | null | undefined) =>
  n == null ? "—" : n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const ROTULO_STATUS: Record<StatusGuia, string> = {
  PAGA: "Paga",
  PAGA_ATRASO: "Paga em atraso",
  ABERTA: "Aberta",
  NAO_ENCONTRADA_B: "Não localizada no e-CAC",
};
const BADGE_STATUS: Record<StatusGuia, string> = {
  PAGA: "badge-saudavel",
  PAGA_ATRASO: "badge-atencao",
  ABERTA: "badge-atencao",
  NAO_ENCONTRADA_B: "badge-critico",
};
const ROTULO_CADASTRAL: Record<SituacaoCadastral, string> = {
  REGULAR: "Regular",
  PENDENTE: "Pendente",
  SUSPENSO: "Suspenso",
};
const BADGE_CADASTRAL: Record<SituacaoCadastral, string> = {
  REGULAR: "badge-saudavel",
  PENDENTE: "badge-atencao",
  SUSPENSO: "badge-critico",
};

function classeDelta(v: number | null): string {
  if (v == null) return "text-slate-400";
  if (Math.abs(v) < 0.01) return "text-emerald-700 font-semibold";
  return "text-rose-700 font-semibold";
}

function Linha({
  rotulo,
  valor,
  mono = false,
  muted = false,
  classeValor,
}: {
  rotulo: string;
  valor: string;
  mono?: boolean;
  muted?: boolean;
  classeValor?: string;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-0.5">
      <span className="shrink-0 text-[11px] uppercase tracking-wide text-slate-500">{rotulo}</span>
      <span
        className={[
          "text-right tabular-nums",
          mono ? "font-mono text-[11px]" : "text-sm",
          muted ? "text-slate-500" : "text-slate-800",
          classeValor ?? "",
        ].join(" ")}
      >
        {valor}
      </span>
    </div>
  );
}

function competenciaAtualPadrao(): string {
  const hoje = new Date();
  const mesAnterior = new Date(hoje.getUTCFullYear(), hoje.getUTCMonth() - 1, 1);
  return `${String(mesAnterior.getUTCMonth() + 1).padStart(2, "0")}/${mesAnterior.getUTCFullYear()}`;
}

/** Retorna o mês anterior inteiro como {inicio, fim} em ISO YYYY-MM-DD. */
function defaultRangeDoMesAnterior(): { inicio: string; fim: string } {
  const hoje = new Date();
  const inicio = new Date(Date.UTC(hoje.getUTCFullYear(), hoje.getUTCMonth() - 1, 1));
  const fim = new Date(Date.UTC(hoje.getUTCFullYear(), hoje.getUTCMonth(), 0));
  return { inicio: inicio.toISOString().slice(0, 10), fim: fim.toISOString().slice(0, 10) };
}

export function AuditoriaTributariaCliente({
  clientes: _clientes,
  guias,
  ultimasSyncs,
}: {
  clientes: ClienteOpcao[];
  guias: Guia[];
  ultimasSyncs: Record<string, UltimaSync>;
}) {
  const router = useRouter();
  const [pendente, iniciarTransicao] = useTransition();
  const [msgSync, setMsgSync] = useState<string>("");
  // Filtro por intervalo de competências (mês/ano). Vazio = mostra tudo.
  // Formato interno "YYYY-MM" (compatível com input type="month").
  const [competenciaDe, setCompetenciaDe] = useState<string>("");
  const [competenciaAte, setCompetenciaAte] = useState<string>("");
  const [tributo, setTributo] = useState<string>("TODOS");
  const [categoriaFiltro, setCategoriaFiltro] = useState<"TODAS" | CategoriaTributo>("TODAS");
  const [empresaSelecionada, setEmpresaSelecionada] = useState<string | null>(null);

  // Rola pro topo sempre que trocar entre lista e detalhe (evita ficar "perdido" na tela).
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, [empresaSelecionada]);

  // Datas para sincronização manual (arrecadação no e-CAC). Default = mês anterior.
  const defaultRange = defaultRangeDoMesAnterior();
  const [syncInicio, setSyncInicio] = useState<string>(defaultRange.inicio);
  const [syncFim, setSyncFim] = useState<string>(defaultRange.fim);

  // Clientes marcados para sincronização em lote (checkbox).
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set());
  function alternarSelecao(id: string) {
    setSelecionados((atual) => {
      const novo = new Set(atual);
      if (novo.has(id)) novo.delete(id);
      else novo.add(id);
      return novo;
    });
  }

  // Converte "MM/AAAA" (formato da Guia) para "YYYY-MM" (comparável lexicograficamente).
  const paraChaveOrdenavel = (compMmAaaa: string): string => {
    const m = /^(\d{2})\/(\d{4})$/.exec(compMmAaaa);
    return m ? `${m[2]}-${m[1]}` : compMmAaaa;
  };

  const guiasFiltradas = useMemo(() => {
    return guias.filter((g) => {
      const chave = paraChaveOrdenavel(g.competencia);
      if (competenciaDe && chave < competenciaDe) return false;
      if (competenciaAte && chave > competenciaAte) return false;
      if (tributo !== "TODOS" && g.tributo !== tributo) return false;
      if (categoriaFiltro !== "TODAS" && g.categoria !== categoriaFiltro) return false;
      return true;
    });
  }, [guias, competenciaDe, competenciaAte, tributo, categoriaFiltro]);

  // Agrupa por empresa para o dashboard.
  // Inclui TODOS os clientes cadastrados no escritório (mesmo sem dados sincronizados),
  // pra que o usuário possa iniciar sync sem depender de dados prévios.
  const empresas = useMemo(() => {
    type TotaisCategoria = { pago: number; apurado: number };
    type Empresa = {
      clienteId: string;
      empresa: string;
      cnpj: string;
      totalPago: number;      // soma do declarado (B) — o "impostômetro"
      totalApurado: number;   // soma do apurado (A)
      // Quebras por categoria (Vendas/Lucro × Folha)
      vendas: TotaisCategoria;
      folha: TotaisCategoria;
      guias: number;
      divergentes: number;
      ausentes: number;
      temDados: boolean;
    };
    const criar = (clienteId: string, empresa: string, cnpj: string): Empresa => ({
      clienteId, empresa, cnpj,
      totalPago: 0, totalApurado: 0,
      vendas: { pago: 0, apurado: 0 },
      folha: { pago: 0, apurado: 0 },
      guias: 0, divergentes: 0, ausentes: 0,
      temDados: false,
    });
    const map = new Map<string, Empresa>();
    // Semeia com todos os clientes cadastrados
    for (const c of _clientes) {
      map.set(c.id, criar(c.id, c.nomeFantasia || c.razaoSocial, c.cnpj));
    }
    for (const g of guiasFiltradas) {
      let e = map.get(g.clienteId);
      if (!e) {
        e = criar(g.clienteId, g.empresa, g.cnpj);
        map.set(g.clienteId, e);
      }
      const pago = g.b?.principal ?? 0;
      const apurado = g.a?.principal ?? 0;
      e.guias++;
      e.totalPago += pago;
      e.totalApurado += apurado;
      const bucket = g.categoria === "FOLHA" ? e.folha : e.vendas;
      bucket.pago += pago;
      bucket.apurado += apurado;
      e.temDados = true;
      if (!g.a || !g.b) e.ausentes++;
      else if (Math.abs((g.a.principal - g.b.principal)) >= 0.01 ||
               Math.abs((g.a.encargos - g.b.encargos)) >= 0.01) e.divergentes++;
    }
    return Array.from(map.values()).sort((a, b) => {
      if (a.temDados !== b.temDados) return a.temDados ? -1 : 1;
      return b.totalPago - a.totalPago;
    });
  }, [guiasFiltradas, _clientes]);

  const totalGeral = useMemo(() => empresas.reduce((s, e) => s + e.totalPago, 0), [empresas]);
  const totalVendas = useMemo(() => empresas.reduce((s, e) => s + e.vendas.pago, 0), [empresas]);
  const totalFolha = useMemo(() => empresas.reduce((s, e) => s + e.folha.pago, 0), [empresas]);

  // No detalhe da empresa, mostra TUDO daquele cliente (só aplica filtro de tributo,
  // não de competência — assim o auditor vê o histórico inteiro do que foi sincronizado).
  const guiasDaEmpresa = useMemo(() => {
    if (!empresaSelecionada) return [];
    return guias
      .filter((g) => g.clienteId === empresaSelecionada)
      .filter((g) => tributo === "TODOS" || g.tributo === tributo);
  }, [empresaSelecionada, guias, tributo]);

  const empresaAtual = empresas.find((e) => e.clienteId === empresaSelecionada);

  function validarRange(): { inicio: string; fim: string } | null {
    if (!syncInicio || !syncFim) {
      setMsgSync("Informe a data inicial e a data final.");
      return null;
    }
    const inicioISO = new Date(`${syncInicio}T00:00:00Z`).toISOString();
    const fimISO = new Date(`${syncFim}T23:59:59Z`).toISOString();
    if (isNaN(new Date(inicioISO).getTime()) || isNaN(new Date(fimISO).getTime())) {
      setMsgSync("Datas inválidas.");
      return null;
    }
    if (new Date(inicioISO) > new Date(fimISO)) {
      setMsgSync("Data inicial deve ser antes da data final.");
      return null;
    }
    return { inicio: inicioISO, fim: fimISO };
  }

  async function chamarSyncManual(clienteId: string, inicio: string, fim: string) {
    const res = await fetch("/api/serpro/sync-manual", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clienteId, dataInicial: inicio, dataFinal: fim, forcar: true }),
    });
    return { ok: res.ok, body: await res.json() };
  }

  function formatarRangeBR(inicio: string, fim: string): string {
    const fmt = (iso: string) => new Date(iso).toLocaleDateString("pt-BR", { timeZone: "UTC" });
    return `${fmt(inicio)} a ${fmt(fim)}`;
  }

  function sincronizarEmpresa(clienteId: string, nomeEmpresa: string) {
    const range = validarRange();
    if (!range) return;
    setMsgSync(`Sincronizando ${nomeEmpresa} · ${formatarRangeBR(range.inicio, range.fim)}...`);
    iniciarTransicao(async () => {
      try {
        const { ok, body } = await chamarSyncManual(clienteId, range.inicio, range.fim);
        if (!ok || !body.sucesso) {
          setMsgSync(`✗ ${nomeEmpresa}: ${body.mensagem ?? body.erro ?? "erro desconhecido"}`);
          return;
        }
        setMsgSync(`✓ ${nomeEmpresa}: ${body.mensagem}`);
        router.refresh();
      } catch (e) {
        setMsgSync(`Erro: ${e instanceof Error ? e.message : String(e)}`);
      }
    });
  }

  function sincronizarSelecionados() {
    const range = validarRange();
    if (!range) return;
    const alvos = empresas
      .filter((e) => selecionados.has(e.clienteId))
      .map((e) => ({ id: e.clienteId, nome: e.empresa }));
    if (alvos.length === 0) {
      setMsgSync("Nenhum cliente marcado. Marque com os checkboxes na tabela.");
      return;
    }
    iniciarTransicao(async () => {
      let ok = 0, falha = 0, importados = 0;
      const rangeBR = formatarRangeBR(range.inicio, range.fim);
      for (let i = 0; i < alvos.length; i++) {
        const alvo = alvos[i];
        setMsgSync(`Sincronizando ${i + 1}/${alvos.length}: ${alvo.nome} · ${rangeBR}...`);
        try {
          const { body } = await chamarSyncManual(alvo.id, range.inicio, range.fim);
          if (body.sucesso) { ok++; importados += body.quantidade ?? 0; }
          else falha++;
        } catch { falha++; }
      }
      setMsgSync(
        `Concluído · ${rangeBR}: ${ok} OK, ${falha} falha(s), ${importados} documento(s) importado(s).`,
      );
      router.refresh();
    });
  }

  return (
    <div>
      <header className="mb-6">
        <h1 className="text-2xl font-bold text-slate-800">Auditoria Tributária</h1>
        <p className="text-sm text-slate-500">
          Impostômetro por empresa — total pago no <strong>Portal e-CAC</strong> na competência.
          Clique numa empresa para abrir o detalhe (cruzamento com o sistema contábil, tributo a tributo).
        </p>
      </header>

      {/* Filtro simples: categoria + tributo (intervalo de datas fica no bloco de sync abaixo) */}
      <section className="card mb-6 p-4">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
          <div>
            <label className="label" htmlFor="f-categoria">Filtrar por categoria</label>
            <select
              id="f-categoria"
              className="input"
              value={categoriaFiltro}
              onChange={(e) => setCategoriaFiltro(e.target.value as "TODAS" | CategoriaTributo)}
            >
              {CATEGORIAS.map((c) => (
                <option key={c.valor} value={c.valor}>{c.rotulo}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="f-tributo">Filtrar por tributo (opcional)</label>
            <select
              id="f-tributo"
              className="input"
              value={tributo}
              onChange={(e) => setTributo(e.target.value)}
            >
              {TRIBUTOS.map((t) => (
                <option key={t.valor} value={t.valor}>{t.rotulo}</option>
              ))}
            </select>
          </div>
          <div className="flex items-end md:col-span-2">
            <p className="text-xs text-slate-500">
              A auditoria separa <b>impostos sobre vendas e lucro</b> (PIS, COFINS, IRPJ, CSLL)
              dos <b>impostos de folha</b> (INSS, IRRF folha, FGTS). Use os filtros pra focar em
              uma categoria ou tributo específico. Pra buscar dados novos no e-CAC, use o bloco
              de sincronização abaixo.
            </p>
          </div>
        </div>
      </section>

      {/* Sincronização manual por período */}
      <section className="card mb-6 p-4">
        <div className="mb-3 flex items-center justify-between gap-4">
          <div>
            <h2 className="text-sm font-bold uppercase tracking-wide text-slate-700">
              Sincronizar com o e-CAC
            </h2>
            <p className="text-xs text-slate-500">
              Busca no e-CAC os DARFs pagos por cada cliente no período informado. Sincronizações
              já feitas hoje pro mesmo range são refeitas (forçado).
            </p>
          </div>
        </div>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
          <div>
            <label className="label" htmlFor="sync-inicio">Data inicial</label>
            <input
              id="sync-inicio"
              type="date"
              className="input"
              value={syncInicio}
              onChange={(e) => setSyncInicio(e.target.value)}
            />
          </div>
          <div>
            <label className="label" htmlFor="sync-fim">Data final</label>
            <input
              id="sync-fim"
              type="date"
              className="input"
              value={syncFim}
              onChange={(e) => setSyncFim(e.target.value)}
            />
          </div>
          <div className="flex items-end">
            <button
              type="button"
              onClick={sincronizarSelecionados}
              disabled={pendente || selecionados.size === 0}
              className="btn btn-primary w-full"
              title={selecionados.size === 0 ? "Marque clientes na tabela abaixo primeiro" : ""}
            >
              {pendente
                ? "Processando..."
                : `🔄 Sincronizar selecionados${selecionados.size > 0 ? ` (${selecionados.size})` : ""}`}
            </button>
          </div>
          <div className="flex items-end">
            <button
              type="button"
              onClick={() => {
                const r = defaultRangeDoMesAnterior();
                setSyncInicio(r.inicio);
                setSyncFim(r.fim);
              }}
              disabled={pendente}
              className="btn btn-ghost w-full text-xs"
            >
              Mês anterior
            </button>
          </div>
        </div>
        {msgSync && (
          <p className="mt-3 rounded border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700">
            {msgSync}
          </p>
        )}
      </section>

      {/* KPI resumo geral — Vendas/Lucro × Folha separados */}
      <section className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-4">
        <div className="card p-5 border-l-4 border-l-[var(--brand)]">
          <div className="text-xs uppercase tracking-wide text-slate-500">Vendas e Lucro</div>
          <div className="mt-1 text-2xl font-bold tabular-nums text-[var(--brand)]">{BRL(totalVendas)}</div>
          <div className="mt-0.5 text-[11px] text-slate-500">PIS · COFINS · IRPJ · CSLL</div>
        </div>
        <div className="card p-5 border-l-4 border-l-emerald-600">
          <div className="text-xs uppercase tracking-wide text-slate-500">Folha de Pagamento</div>
          <div className="mt-1 text-2xl font-bold tabular-nums text-emerald-700">{BRL(totalFolha)}</div>
          <div className="mt-0.5 text-[11px] text-slate-500">INSS · IRRF · FGTS</div>
        </div>
        <div className="card p-5">
          <div className="text-xs uppercase tracking-wide text-slate-500">Total pago · Empresas</div>
          <div className="mt-1 flex items-baseline gap-2 text-2xl font-bold tabular-nums">
            <span>{BRL(totalGeral)}</span>
            <span className="text-sm text-slate-400">· {empresas.length}</span>
          </div>
        </div>
        <div className="card p-5">
          <div className="text-xs uppercase tracking-wide text-slate-500">Guias · Divergências · Ausentes</div>
          <div className="mt-1 flex items-baseline gap-2 text-2xl font-bold tabular-nums">
            <span>{guiasFiltradas.length}</span>
            <span className="text-slate-300">·</span>
            <span className="text-rose-700">{empresas.reduce((s, e) => s + e.divergentes, 0)}</span>
            <span className="text-slate-300">·</span>
            <span className="text-amber-700">{empresas.reduce((s, e) => s + e.ausentes, 0)}</span>
          </div>
        </div>
      </section>

      {/* Lista de empresas (nível 1) */}
      {!empresaSelecionada && (
        <section className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-semibold uppercase tracking-[0.1em] text-slate-500">
                  <th className="w-10 px-3 py-3 text-center">
                    <input
                      type="checkbox"
                      aria-label="Selecionar todos"
                      className="h-4 w-4 accent-[var(--brand)]"
                      checked={empresas.length > 0 && selecionados.size === empresas.length}
                      onChange={(ev) => {
                        if (ev.target.checked) {
                          setSelecionados(new Set(empresas.map((e) => e.clienteId)));
                        } else {
                          setSelecionados(new Set());
                        }
                      }}
                    />
                  </th>
                  <th className="px-4 py-3 text-left">Cliente</th>
                  <th className="px-4 py-3 text-right">e-CAC</th>
                  <th className="px-4 py-3 text-right">Sistema Contábil</th>
                  <th className="px-4 py-3 text-center">Status</th>
                </tr>
              </thead>
              <tbody>
                {empresas.length === 0 && (
                  <tr>
                    <td colSpan={5} className="py-10 text-center text-sm text-slate-400">
                      Nenhuma empresa com dados para os filtros selecionados.
                    </td>
                  </tr>
                )}
                {empresas.map((e) => {
                  const status = !e.temDados
                    ? { rotulo: "Sem sync", classe: "badge-inconclusivo" }
                    : e.ausentes > 0
                      ? { rotulo: "Pendente", classe: "badge-critico" }
                      : e.divergentes > 0
                        ? { rotulo: "Divergente", classe: "badge-atencao" }
                        : { rotulo: "OK", classe: "badge-saudavel" };
                  return (
                    <tr
                      key={e.clienteId}
                      onClick={() => setEmpresaSelecionada(e.clienteId)}
                      className="cursor-pointer border-b border-slate-100 last:border-0 hover:bg-slate-50"
                    >
                      <td className="px-3 py-3 text-center" onClick={(ev) => ev.stopPropagation()}>
                        <input
                          type="checkbox"
                          aria-label={`Selecionar ${e.empresa}`}
                          className="h-4 w-4 accent-[var(--brand)]"
                          checked={selecionados.has(e.clienteId)}
                          onChange={() => alternarSelecao(e.clienteId)}
                        />
                      </td>
                      <td className="px-4 py-3">
                        <div className="font-semibold text-slate-800">{e.empresa}</div>
                        <div className="text-xs text-slate-500">{e.cnpj}</div>
                        {ultimasSyncs[e.clienteId] ? (
                          <div className="mt-0.5 text-[11px] text-emerald-700">
                            última sync:{" "}
                            {new Date(ultimasSyncs[e.clienteId].executadoEm).toLocaleString("pt-BR", {
                              dateStyle: "short",
                              timeStyle: "short",
                            })}
                            <span className="text-slate-500">
                              {" "}· período{" "}
                              {new Date(ultimasSyncs[e.clienteId].periodoInicial).toLocaleDateString("pt-BR", { timeZone: "UTC" })}
                              {" a "}
                              {new Date(ultimasSyncs[e.clienteId].periodoFinal).toLocaleDateString("pt-BR", { timeZone: "UTC" })}
                              {" · via "}
                              {rotuloMetodo(_clientes.find((c) => c.id === e.clienteId)?.metodoAcessoEcac ?? "")}
                            </span>
                          </div>
                        ) : (
                          <div className="mt-0.5 text-[11px] text-slate-400">
                            acesso: {rotuloMetodo(_clientes.find((c) => c.id === e.clienteId)?.metodoAcessoEcac ?? "")}
                          </div>
                        )}
                      </td>
                      <td className={`px-4 py-3 text-right tabular-nums ${e.temDados ? "text-slate-800" : "text-slate-300"}`}>
                        {e.temDados ? (
                          <div className="space-y-0.5">
                            <div className="flex items-baseline justify-end gap-2">
                              <span className="text-[10px] uppercase tracking-wide text-[var(--brand)]">V/L</span>
                              <span className="font-semibold">{BRL(e.vendas.pago)}</span>
                            </div>
                            <div className="flex items-baseline justify-end gap-2">
                              <span className="text-[10px] uppercase tracking-wide text-emerald-700">Folha</span>
                              <span className="font-semibold">{BRL(e.folha.pago)}</span>
                            </div>
                          </div>
                        ) : "—"}
                      </td>
                      <td className={`px-4 py-3 text-right tabular-nums ${e.temDados ? "text-slate-800" : "text-slate-300"}`}>
                        {e.temDados ? (
                          <div className="space-y-0.5">
                            <div className="flex items-baseline justify-end gap-2">
                              <span className="text-[10px] uppercase tracking-wide text-[var(--brand)]">V/L</span>
                              <span className="font-semibold">{BRL(e.vendas.apurado)}</span>
                            </div>
                            <div className="flex items-baseline justify-end gap-2">
                              <span className="text-[10px] uppercase tracking-wide text-emerald-700">Folha</span>
                              <span className="font-semibold">{BRL(e.folha.apurado)}</span>
                            </div>
                          </div>
                        ) : "—"}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <div className="flex items-center justify-center gap-2">
                          <span className={`badge ${status.classe}`}>{status.rotulo}</span>
                          <button
                            type="button"
                            disabled={pendente}
                            onClick={(ev) => {
                              ev.stopPropagation();
                              sincronizarEmpresa(e.clienteId, e.empresa);
                            }}
                            className="rounded border border-slate-200 bg-white px-2 py-0.5 text-[11px] font-medium text-slate-600 hover:border-[var(--brand-2)] hover:text-[var(--brand)]"
                            title="Sincronizar essa empresa com o e-CAC"
                          >
                            🔄
                          </button>
                          <button
                            type="button"
                            onClick={(ev) => {
                              ev.stopPropagation();
                              setEmpresaSelecionada(e.clienteId);
                            }}
                            className="rounded border border-[var(--brand-2)] bg-[var(--brand-2-soft)] px-2 py-0.5 text-[11px] font-semibold text-[var(--brand)] hover:bg-[var(--brand-2)] hover:text-white"
                            title="Abrir detalhe dessa empresa (auditoria completa)"
                          >
                            Abrir →
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              {empresas.length > 0 && (
                <tfoot>
                  <tr className="border-t-2 border-slate-200 bg-slate-50 text-xs font-semibold text-slate-700">
                    <td className="px-3 py-3"></td>
                    <td className="px-4 py-3 uppercase tracking-wide text-slate-500">
                      Total ({empresas.length} clientes)
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      <div className="space-y-0.5">
                        <div className="flex items-baseline justify-end gap-2">
                          <span className="text-[10px] uppercase tracking-wide text-[var(--brand)]">V/L</span>
                          <span>{BRL(empresas.reduce((s, e) => s + e.vendas.pago, 0))}</span>
                        </div>
                        <div className="flex items-baseline justify-end gap-2">
                          <span className="text-[10px] uppercase tracking-wide text-emerald-700">Folha</span>
                          <span>{BRL(empresas.reduce((s, e) => s + e.folha.pago, 0))}</span>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      <div className="space-y-0.5">
                        <div className="flex items-baseline justify-end gap-2">
                          <span className="text-[10px] uppercase tracking-wide text-[var(--brand)]">V/L</span>
                          <span>{BRL(empresas.reduce((s, e) => s + e.vendas.apurado, 0))}</span>
                        </div>
                        <div className="flex items-baseline justify-end gap-2">
                          <span className="text-[10px] uppercase tracking-wide text-emerald-700">Folha</span>
                          <span>{BRL(empresas.reduce((s, e) => s + e.folha.apurado, 0))}</span>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3"></td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </section>
      )}

      {/* Detalhe da empresa (nível 2) */}
      {empresaSelecionada && empresaAtual && (
        <section>
          <div className="mb-4 flex items-start justify-between gap-4">
            <div>
              <button
                type="button"
                onClick={() => setEmpresaSelecionada(null)}
                className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--brand)] hover:underline"
              >
                ← Voltar ao dashboard
              </button>
              <h2 className="text-xl font-bold text-slate-800">{empresaAtual.empresa}</h2>
              <p className="text-xs text-slate-500">
                {empresaAtual.cnpj}
                {(competenciaDe || competenciaAte) && (
                  <>
                    {" · Competências "}
                    {competenciaDe ? competenciaDe.split("-").reverse().join("/") : "início"}
                    {" a "}
                    {competenciaAte ? competenciaAte.split("-").reverse().join("/") : "hoje"}
                  </>
                )}
                {ultimasSyncs[empresaAtual.clienteId] && (
                  <>
                    {" · "}
                    <span title={ultimasSyncs[empresaAtual.clienteId].executadoEm}>
                      última sync:{" "}
                      {new Date(ultimasSyncs[empresaAtual.clienteId].executadoEm).toLocaleString("pt-BR", {
                        dateStyle: "short",
                        timeStyle: "short",
                      })}{" "}
                      ({ultimasSyncs[empresaAtual.clienteId].tipo.toLowerCase()}){" "}
                      · período{" "}
                      {new Date(ultimasSyncs[empresaAtual.clienteId].periodoInicial).toLocaleDateString("pt-BR", { timeZone: "UTC" })}
                      {" a "}
                      {new Date(ultimasSyncs[empresaAtual.clienteId].periodoFinal).toLocaleDateString("pt-BR", { timeZone: "UTC" })}
                      {" · via "}
                      {rotuloMetodo(_clientes.find((c) => c.id === empresaAtual.clienteId)?.metodoAcessoEcac ?? "")}
                    </span>
                  </>
                )}
              </p>
            </div>
            <div className="flex flex-col items-end gap-2">
              <div className="text-right">
                <div className="text-[11px] uppercase tracking-wide text-slate-500">Total pago</div>
                <div className="text-2xl font-bold tabular-nums text-[var(--brand)]">{BRL(empresaAtual.totalPago)}</div>
              </div>
              <button
                type="button"
                disabled={pendente}
                onClick={() => sincronizarEmpresa(empresaAtual.clienteId, empresaAtual.empresa)}
                className="btn btn-primary text-xs"
              >
                {pendente ? "Sincronizando..." : "🔄 Sincronizar e-CAC"}
              </button>
              <a
                href={`/api/auditoria-tributaria/exportar?clienteId=${empresaAtual.clienteId}${competenciaDe ? `&de=${competenciaDe}` : ""}${competenciaAte ? `&ate=${competenciaAte}` : ""}`}
                className="btn btn-accent text-xs"
                title="Baixar planilha .xlsx com os documentos sincronizados"
              >
                📥 Baixar planilha
              </a>
            </div>
          </div>

          <div className="mb-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
            <b>{guiasDaEmpresa.length} tributo(s)</b> sincronizado(s) para essa empresa
            {(competenciaDe || competenciaAte || tributo !== "TODOS" || categoriaFiltro !== "TODAS") && (
              <> — filtros aplicados: {competenciaDe && `de ${competenciaDe.split("-").reverse().join("/")}`}
                {competenciaAte && ` até ${competenciaAte.split("-").reverse().join("/")}`}
                {tributo !== "TODOS" && ` · tributo ${tributo}`}
                {categoriaFiltro !== "TODAS" && ` · categoria ${ROTULO_CURTO_CATEGORIA[categoriaFiltro]}`}</>
            )}
            {" "}Você não precisa preencher filtro nenhum — os dados vêm da última sincronização automática.
          </div>

          {guiasDaEmpresa.length === 0 ? (
            <div className="card py-10 text-center text-sm text-slate-400">
              Nenhum tributo sincronizado para essa empresa
              {tributo !== "TODOS" && ` (filtro: ${tributo})`}.
              Use o botão <em>Sincronizar</em> acima pra buscar no e-CAC.
            </div>
          ) : (
            (["VENDAS_LUCRO", "FOLHA"] as const).map((cat) => {
              // Respeita o filtro global de categoria
              if (categoriaFiltro !== "TODAS" && categoriaFiltro !== cat) return null;
              const guiasCat = guiasDaEmpresa.filter((g) => g.categoria === cat);
              if (guiasCat.length === 0) return null;
              const subtotal = {
                pagoP: guiasCat.reduce((s, g) => s + (g.b?.principal ?? 0), 0),
                apuradoP: guiasCat.reduce((s, g) => s + (g.a?.principal ?? 0), 0),
                pagoE: guiasCat.reduce((s, g) => s + (g.b?.encargos ?? 0), 0),
                apuradoE: guiasCat.reduce((s, g) => s + (g.a?.encargos ?? 0), 0),
              };
              const corBarra = cat === "VENDAS_LUCRO" ? "border-l-[var(--brand)]" : "border-l-emerald-600";
              const corTexto = cat === "VENDAS_LUCRO" ? "text-[var(--brand)]" : "text-emerald-700";
              return (
                <div key={cat} className={`card mb-4 overflow-hidden border-l-4 ${corBarra}`}>
                  <div className="flex items-baseline justify-between gap-4 border-b border-slate-100 bg-slate-50/60 px-4 py-2">
                    <h3 className={`text-sm font-bold uppercase tracking-wide ${corTexto}`}>
                      {ROTULO_CATEGORIA[cat]}
                    </h3>
                    <div className="text-xs text-slate-600">
                      {guiasCat.length} tributo(s) · Sistema {BRL(subtotal.apuradoP)} · e-CAC {BRL(subtotal.pagoP)}
                    </div>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-semibold uppercase tracking-[0.1em] text-slate-500">
                          <th className="border-r border-slate-200 px-3 py-2 text-left">Tributo</th>
                          <th className="border-r border-slate-200 px-3 py-2 text-left text-[var(--brand)]">Sistema Contábil (A)</th>
                          <th className="border-r border-slate-200 px-3 py-2 text-left text-[var(--brand)]">Portal e-CAC (B)</th>
                          <th className="px-3 py-2 text-left text-[var(--brand)]">Auditoria (A − B)</th>
                        </tr>
                      </thead>
                      <tbody>
                        {guiasCat.map((g) => {
                          const dp = g.a && g.b ? g.a.principal - g.b.principal : null;
                          const de = g.a && g.b ? g.a.encargos - g.b.encargos : null;
                          return (
                            <tr key={g.id} className="border-b border-slate-100 align-top last:border-0 hover:bg-slate-50/60">
                              <td className="border-r border-slate-100 px-3 py-3 align-top">
                                <div className="font-semibold text-slate-800">{g.tributo}</div>
                                <div className="mt-1 text-xs text-slate-500">Comp. {g.competencia}</div>
                              </td>
                              <td className="border-r border-slate-100 px-3 py-3">
                                <Linha rotulo="Principal apurado" valor={BRL(g.a?.principal)} />
                                <Linha rotulo="Multa/Juros sistema" valor={BRL(g.a?.encargos)} muted />
                                <Linha rotulo="Cód. receita contábil" valor={g.a?.codigo ?? "—"} />
                                <Linha rotulo="Chave da guia" valor={g.a?.chave ?? "—"} mono muted />
                              </td>
                              <td className="border-r border-slate-100 px-3 py-3">
                                <Linha rotulo="Principal declarado" valor={BRL(g.b?.principal)} />
                                <Linha rotulo="Multa/Juros e-CAC" valor={BRL(g.b?.encargos)} muted />
                                <Linha rotulo="Cód. receita e-CAC" valor={g.b?.codigo ?? "—"} />
                                <Linha rotulo="Nº autenticação" valor={g.b?.autenticacao ?? "—"} mono muted />
                              </td>
                              <td className="px-3 py-3">
                                <Linha rotulo="Δ principal" valor={dp == null ? "—" : BRL(dp)} classeValor={classeDelta(dp)} />
                                <Linha rotulo="Δ encargos" valor={de == null ? "—" : BRL(de)} classeValor={classeDelta(de)} />
                                <div className="mt-1 flex items-center justify-between gap-2 py-0.5">
                                  <span className="text-[11px] uppercase tracking-wide text-slate-500">Status</span>
                                  <span className={`badge ${BADGE_STATUS[g.status]}`}>{ROTULO_STATUS[g.status]}</span>
                                </div>
                                <div className="flex items-center justify-between gap-2 py-0.5">
                                  <span className="text-[11px] uppercase tracking-wide text-slate-500">Cadastral</span>
                                  <span className={`badge ${BADGE_CADASTRAL[g.situacaoCadastral]}`}>
                                    {ROTULO_CADASTRAL[g.situacaoCadastral]}
                                  </span>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                      <tfoot>
                        <tr className="border-t-2 border-slate-200 bg-slate-50 text-xs font-semibold text-slate-700">
                          <td className="border-r border-slate-100 px-3 py-2 uppercase tracking-wide text-slate-500">Subtotal</td>
                          <td className="border-r border-slate-100 px-3 py-2 text-right tabular-nums">
                            {BRL(subtotal.apuradoP)}<span className="ml-2 text-slate-400">+ {BRL(subtotal.apuradoE)}</span>
                          </td>
                          <td className="border-r border-slate-100 px-3 py-2 text-right tabular-nums">
                            {BRL(subtotal.pagoP)}<span className="ml-2 text-slate-400">+ {BRL(subtotal.pagoE)}</span>
                          </td>
                          <td className={`px-3 py-2 text-right tabular-nums ${classeDelta(subtotal.apuradoP - subtotal.pagoP)}`}>
                            {BRL(subtotal.apuradoP - subtotal.pagoP)}
                          </td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </div>
              );
            })
          )}
        </section>
      )}
    </div>
  );
}
