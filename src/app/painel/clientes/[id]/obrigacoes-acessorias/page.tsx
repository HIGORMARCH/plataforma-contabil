import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePapel, PAPEIS_INTERNOS } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { consolidarObrigacoes, type CelulaObrigacao, type StatusEntrega } from "@/lib/obrigacoes-acessorias/consolidar";
import { frequencia, ROTULOS_OBRIGACAO, type TipoObrigacao } from "@/lib/obrigacoes-acessorias/tipos";
import { alternarIncluirNoRelatorioAction } from "./actions";
import { VarrerPastaObrigacoesButton } from "./_components/VarrerPastaObrigacoesButton";
import { EntregaManualForm } from "./_components/EntregaManualForm";
import { SincronizarSimplesButton } from "./_components/SincronizarSimplesButton";

const fmtData = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  timeZone: "UTC",
});

const SIMPLES_LABELS = ["Simples Nacional", "SIMPLES", "Simples", "MEI"];
function ehSimples(regime: string | null | undefined): boolean {
  if (!regime) return false;
  return SIMPLES_LABELS.some((l) => regime.toLowerCase().includes(l.toLowerCase()));
}

export default async function ObrigacoesAcessoriasPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ anoInicial?: string; anoFinal?: string }>;
}) {
  const sessao = await requirePapel(PAPEIS_INTERNOS);
  const { id } = await params;
  const q = await searchParams;

  // Range default: 5 anos atrás até ano corrente.
  const agora = new Date();
  const anoCorrente = agora.getUTCFullYear();
  const anoInicial = Number(q.anoInicial) || anoCorrente - 4;
  const anoFinal = Number(q.anoFinal) || anoCorrente;

  const cliente = await prisma.cliente.findFirst({
    where: { id, escritorioId: sessao.escritorioId },
    select: {
      id: true,
      razaoSocial: true,
      nomeFantasia: true,
      pastaFiscal: true,
      regimeTributario: true,
    },
  });
  if (!cliente) notFound();

  const grade = await consolidarObrigacoes({ clienteId: id, anoInicial, anoFinal });

  const tiposComCelulas = Array.from(
    new Set(grade.celulas.map((c) => c.tipo)),
  ) as TipoObrigacao[];

  const anos: number[] = [];
  for (let a = anoInicial; a <= anoFinal; a++) anos.push(a);

  return (
    <div>
      <div className="mb-6">
        <Link href={`/painel/clientes/${id}`} className="text-sm text-slate-500 hover:underline">
          ← Voltar para {cliente.nomeFantasia || cliente.razaoSocial}
        </Link>
        <h1 className="mt-1 text-2xl font-bold text-slate-800">
          Obrigações Acessórias — Cumprimento de Prazo
        </h1>
        <p className="text-sm text-slate-500">
          Demonstrativo do que foi entregue no prazo, em atraso ou não localizado. Base: arquivos
          catalogados na pasta do cliente + entregas registradas (SERPRO DCTFWeb e manual pra
          PGDAS/DEFIS/MIT).
        </p>
      </div>


      <div className="mb-6 flex flex-wrap items-end gap-3 rounded-xl border border-slate-200 bg-white p-4">
        <form className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col text-sm">
            <span className="mb-1 text-xs text-slate-500">Ano inicial</span>
            <input
              type="number"
              name="anoInicial"
              defaultValue={anoInicial}
              min={2010}
              max={anoCorrente}
              className="w-28 rounded border border-slate-300 px-2 py-1"
            />
          </label>
          <label className="flex flex-col text-sm">
            <span className="mb-1 text-xs text-slate-500">Ano final</span>
            <input
              type="number"
              name="anoFinal"
              defaultValue={anoFinal}
              min={2010}
              max={anoCorrente + 1}
              className="w-28 rounded border border-slate-300 px-2 py-1"
            />
          </label>
          <button type="submit" className="btn btn-primary">
            Atualizar período
          </button>
        </form>
        <form action={alternarIncluirNoRelatorioAction.bind(null, id)} className="ml-auto">
          <input
            type="hidden"
            name="incluir"
            value={grade.cliente.incluirNoRelatorio ? "0" : "1"}
          />
          <button
            type="submit"
            className={
              "rounded-lg border px-3 py-2 text-sm " +
              (grade.cliente.incluirNoRelatorio
                ? "border-emerald-300 bg-emerald-50 text-emerald-800 hover:bg-emerald-100"
                : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50")
            }
          >
            {grade.cliente.incluirNoRelatorio
              ? "☑ Incluído no relatório final"
              : "☐ Incluir no relatório final"}
          </button>
        </form>
      </div>

      <section className="mb-6 rounded-xl border border-slate-200 bg-white p-5">
        <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-slate-500">
          Varredura da pasta do cliente
        </h2>
        <VarrerPastaObrigacoesButton clienteId={id} pastaFiscal={cliente.pastaFiscal} />
      </section>

      {ehSimples(cliente.regimeTributario) && (
        <section className="mb-6 rounded-xl border border-slate-200 bg-white p-5">
          <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-slate-500">
            Portal Simples Nacional (PGDAS-D · DEFIS)
          </h2>
          <SincronizarSimplesButton
            clienteId={id}
            anoInicial={anoInicial}
            anoFinal={anoFinal}
          />
        </section>
      )}

      <section className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <CardResumo rotulo="Esperadas" valor={grade.totais.esperadas} />
        <CardResumo rotulo="No prazo" valor={grade.totais.noPrazo} cor="emerald" />
        <CardResumo rotulo="Em atraso" valor={grade.totais.emAtraso} cor="amber" />
        <CardResumo
          rotulo="Não localizadas"
          valor={grade.totais.naoLocalizadas}
          cor="slate"
        />
      </section>

      {tiposComCelulas.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white px-6 py-10 text-center text-sm text-slate-500">
          Nenhuma obrigação esperada neste período — verifique se o range escolhido é válido.
        </div>
      ) : (
        tiposComCelulas.map((tipo) => {
          const doTipo = grade.celulas.filter((c) => c.tipo === tipo);
          return (
            <section key={tipo} className="mb-6 rounded-xl border border-slate-200 bg-white p-5">
              <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-slate-500">
                {ROTULOS_OBRIGACAO[tipo]}
              </h2>
              {frequencia(tipo) === "MENSAL" ? (
                <HeatmapMensal celulas={doTipo} anos={anos} />
              ) : (
                <ListaAnual celulas={doTipo} />
              )}
            </section>
          );
        })
      )}

      <section className="mb-6 rounded-xl border border-slate-200 bg-white p-5">
        <h2 className="mb-1 text-sm font-bold uppercase tracking-wide text-slate-500">
          Registrar entrega manual — PGDAS-D · DEFIS · MIT
        </h2>
        <p className="mb-3 text-xs text-slate-500">
          Essas obrigações não geram arquivo em pasta. Enquanto não temos o robô do Portal Simples
          Nacional (PGDAS/DEFIS) nem o serviço SERPRO MIT ativado, registre à mão a data de
          entrega. Uma vez registrada, entra automaticamente na grade acima.
        </p>
        <EntregaManualForm
          clienteId={id}
          clienteEhSimples={ehSimples(cliente.regimeTributario)}
          anoInicial={anoInicial}
          anoFinal={anoFinal}
        />
      </section>

      <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-xs leading-relaxed text-slate-600">
        <p>
          <strong>Como o status é calculado:</strong> a data de entrega vem do mtime do arquivo em
          pasta (ECD, ECF, EFD-Contribuições, DCTF antiga), da consulta SERPRO (DCTFWeb) ou do
          registro manual (PGDAS/DEFIS/MIT). Se essa data for ≤ ao prazo legal, fica{" "}
          <span className="font-semibold text-emerald-700">no prazo</span>. Se for maior, fica{" "}
          <span className="font-semibold text-amber-700">em atraso</span> com os dias corridos de
          atraso. Sem dado, fica <span className="font-semibold text-slate-600">não localizada</span>.
        </p>
        <p className="mt-2">
          Prazos: ECD → último dia útil de maio (ano+1) · ECF → último dia útil de julho (ano+1) ·
          EFD-Contribuições → 10º dia útil do 2º mês subsequente · DCTF antiga → 15º dia útil do 2º
          mês subsequente · DCTFWeb/MIT → dia 15 do mês seguinte (antecipa se cair em não-útil) ·
          PGDAS-D → dia 20 do mês seguinte · DEFIS → 31 de março (ano+1).
        </p>
      </div>
    </div>
  );
}

function CardResumo({
  rotulo,
  valor,
  cor,
}: {
  rotulo: string;
  valor: number;
  cor?: "emerald" | "amber" | "slate";
}) {
  const paleta = {
    emerald: "border-emerald-200 bg-emerald-50 text-emerald-800",
    amber: "border-amber-200 bg-amber-50 text-amber-800",
    slate: "border-slate-200 bg-slate-50 text-slate-700",
  };
  const cls = cor ? paleta[cor] : "border-slate-200 bg-white text-slate-800";
  return (
    <div className={`rounded-xl border px-4 py-3 ${cls}`}>
      <div className="text-3xl font-bold tabular-nums">{valor}</div>
      <div className="mt-0.5 text-xs">{rotulo}</div>
    </div>
  );
}

/**
 * Heatmap mensal — linhas = anos, colunas = meses (01..12). Cada célula é
 * clicável (tooltip com prazo e data de entrega).
 */
function HeatmapMensal({ celulas, anos }: { celulas: CelulaObrigacao[]; anos: number[] }) {
  const mapa = new Map<string, CelulaObrigacao>();
  for (const c of celulas) mapa.set(`${c.ano}-${c.mes}`, c);

  return (
    <div className="overflow-x-auto">
      <table className="min-w-[560px] text-sm">
        <thead>
          <tr className="text-xs uppercase text-slate-500">
            <th className="pb-2 pr-3 text-left font-medium">Ano</th>
            {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
              <th key={m} className="pb-2 pr-1 text-center font-medium">
                {String(m).padStart(2, "0")}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {anos.map((ano) => (
            <tr key={ano}>
              <td className="py-1 pr-3 text-xs font-semibold text-slate-600">{ano}</td>
              {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => {
                const c = mapa.get(`${ano}-${m}`);
                if (!c) {
                  return (
                    <td key={m} className="p-0.5">
                      <div className="h-8 w-full rounded bg-slate-100" title="fora de vigência" />
                    </td>
                  );
                }
                return (
                  <td key={m} className="p-0.5">
                    <ChipStatus celula={c} compacto />
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ListaAnual({ celulas }: { celulas: CelulaObrigacao[] }) {
  const ordenadas = [...celulas].sort((a, b) => a.ano - b.ano);
  return (
    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {ordenadas.map((c) => (
        <ChipStatus key={`${c.tipo}-${c.ano}`} celula={c} />
      ))}
    </div>
  );
}

function ChipStatus({ celula, compacto = false }: { celula: CelulaObrigacao; compacto?: boolean }) {
  const cls = corPorStatus(celula.status);
  const titulo =
    `Prazo: ${fmtData.format(celula.prazoLegal)}\n` +
    (celula.dataEntrega ? `Entrega: ${fmtData.format(celula.dataEntrega)}` : "Sem entrega") +
    (celula.status === "EM_ATRASO" ? `\nAtraso: ${celula.diasAtraso} dia(s)` : "") +
    (celula.referenciaExterna ? `\nRef: ${celula.referenciaExterna}` : "");

  if (compacto) {
    return (
      <div
        title={titulo}
        className={`h-8 w-full rounded border ${cls.bg} ${cls.border} flex items-center justify-center text-[10px] font-semibold ${cls.text}`}
      >
        {celula.status === "NO_PRAZO"
          ? "OK"
          : celula.status === "EM_ATRASO"
            ? `+${celula.diasAtraso}d`
            : "—"}
      </div>
    );
  }

  return (
    <div
      title={titulo}
      className={`rounded-lg border px-3 py-2 text-sm ${cls.bg} ${cls.border}`}
    >
      <div className={`text-xs font-semibold uppercase ${cls.text}`}>
        {celula.mes === null ? celula.ano : `${String(celula.mes).padStart(2, "0")}/${celula.ano}`}
      </div>
      <div className="mt-1 text-xs text-slate-600">
        Prazo: <span className="font-mono">{fmtData.format(celula.prazoLegal)}</span>
      </div>
      {celula.dataEntrega ? (
        <div className="text-xs text-slate-600">
          Entrega: <span className="font-mono">{fmtData.format(celula.dataEntrega)}</span>
          {celula.status === "EM_ATRASO" && (
            <span className="ml-1 rounded bg-amber-100 px-1 py-0.5 text-[10px] font-semibold text-amber-800">
              +{celula.diasAtraso}d
            </span>
          )}
        </div>
      ) : (
        <div className="text-xs text-slate-400">não localizada</div>
      )}
    </div>
  );
}

function corPorStatus(status: StatusEntrega): {
  bg: string;
  border: string;
  text: string;
} {
  switch (status) {
    case "NO_PRAZO":
      return { bg: "bg-emerald-50", border: "border-emerald-200", text: "text-emerald-800" };
    case "EM_ATRASO":
      return { bg: "bg-amber-50", border: "border-amber-200", text: "text-amber-800" };
    case "NAO_LOCALIZADA":
      return { bg: "bg-slate-50", border: "border-slate-200", text: "text-slate-500" };
  }
}
