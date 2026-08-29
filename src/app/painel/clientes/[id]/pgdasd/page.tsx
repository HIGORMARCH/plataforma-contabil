import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePapel, PAPEIS_INTERNOS } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { ehSimples } from "@/lib/regime";
import { COLUNAS_TRIBUTO, ROTULO_TRIBUTO } from "@/lib/pgdasd/parseDeclaracaoPdf";
import { ConsultarPgdasdButton } from "./_components/ConsultarPgdasdButton";
import { TabelaPgdasd, type LinhaPgdasd } from "./_components/TabelaPgdasd";
import { VarrerPastaSimplesButton } from "./_components/VarrerPastaSimplesButton";

/**
 * PGDAS-D (Simples Nacional) — o que a declaração diz.
 *
 * Uma linha por competência: receita bruta do período (RPA) e o débito por
 * tributo dentro do DAS. O ICMS desta tela é o ICMS DO DAS — não se confunde
 * com a complementação de alíquota / difal que a empresa do Simples recolhe em
 * guia estadual e declara na GIAM. Os dois nunca são somados.
 */

const fmtBrl = new Intl.NumberFormat("pt-BR", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
const fmtDataHora = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "UTC",
});

function labelCompetencia(d: Date): string {
  return `${String(d.getUTCMonth() + 1).padStart(2, "0")}/${d.getUTCFullYear()}`;
}

export default async function PgdasdPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ anoInicial?: string; anoFinal?: string }>;
}) {
  const sessao = await requirePapel(PAPEIS_INTERNOS);
  const { id } = await params;
  const q = await searchParams;

  const anoCorrente = new Date().getUTCFullYear();
  const anoInicial = Number(q.anoInicial) || anoCorrente - 1;
  const anoFinal = Number(q.anoFinal) || anoCorrente;

  const cliente = await prisma.cliente.findFirst({
    where: { id, escritorioId: sessao.escritorioId },
    select: {
      id: true,
      razaoSocial: true,
      nomeFantasia: true,
      cnpj: true,
      regimeTributario: true,
      metodoAcessoEcac: true,
      atendimentoInicio: true,
      atendimentoFim: true,
    },
  });
  if (!cliente) notFound();

  const de = new Date(Date.UTC(anoInicial, 0, 1));
  const ate = new Date(Date.UTC(anoFinal, 11, 1));

  const [declaracoes, ultimaConsulta, guias, pagamentos] = await Promise.all([
    prisma.pgdasdDeclaracao.findMany({
      where: { clienteId: id, periodoApuracao: { gte: de, lte: ate } },
      orderBy: { periodoApuracao: "asc" },
    }),
    prisma.pgdasdSincronizacao.findFirst({
      where: { clienteId: id },
      orderBy: { requisitadoEm: "desc" },
    }),
    prisma.dasSimplesGuia.findMany({
      where: { clienteId: id, periodoApuracao: { gte: de, lte: ate } },
      orderBy: { periodoApuracao: "asc" },
    }),
    // Pagamentos do Simples: só os documentos DAS (tipo 9 na taxonomia do
    // e-CAC). DARF de folha (INSS, IRRF) fica de fora — é outra guia e outra
    // conciliação.
    prisma.ecacPagamento.findMany({
      where: { clienteId: id, tipoCodigo: "9", periodoApuracao: { gte: de, lte: ate } },
      orderBy: { periodoApuracao: "asc" },
    }),
  ]);

  const totalDebito = declaracoes.reduce((s, d) => s + Number(d.totalDebito), 0);
  const comAlerta = declaracoes.filter((d) => d.alertas.length > 0);
  const retificadoras = declaracoes.filter((d) => d.situacao === "RETIFICADORA");

  // --- Confronto declarado × guia × pago, por competência ---
  //
  // Três documentos distintos do mesmo mês: a declaração (PGDAS-D) diz o que foi
  // apurado, a guia (DAS) o que foi cobrado, o comprovante o que foi pago. Eles
  // NÃO se somam — a tabela põe um ao lado do outro e mostra a diferença.
  const chave = (d: Date) => d.getTime();
  const porCompetencia = new Map<
    number,
    { competencia: Date; declarado: number | null; guia: number | null; pago: number | null; pagoEm: Date | null }
  >();
  const garantir = (d: Date) => {
    const k = chave(d);
    if (!porCompetencia.has(k)) {
      porCompetencia.set(k, { competencia: d, declarado: null, guia: null, pago: null, pagoEm: null });
    }
    return porCompetencia.get(k)!;
  };
  for (const d of declaracoes) garantir(d.periodoApuracao).declarado = Number(d.totalDebito);
  for (const g of guias) {
    const linha = garantir(g.periodoApuracao);
    linha.guia = (linha.guia ?? 0) + Number(g.valorTotal);
  }
  for (const p of pagamentos) {
    const linha = garantir(p.periodoApuracao);
    linha.pago = (linha.pago ?? 0) + Number(p.valorTotal);
    if (!linha.pagoEm || p.dataArrecadacao > linha.pagoEm) linha.pagoEm = p.dataArrecadacao;
  }
  const confronto = [...porCompetencia.values()].sort(
    (a, b) => a.competencia.getTime() - b.competencia.getTime(),
  );
  const temConfronto = guias.length > 0 || pagamentos.length > 0;

  const linhas: LinhaPgdasd[] = declaracoes.map((d) => ({
    id: d.id,
    competenciaLabel: labelCompetencia(d.periodoApuracao),
    situacao: d.situacao ?? "DESCONHECIDA",
    numeroDeclaracao: d.numeroDeclaracao,
    numeroRecibo: d.numeroRecibo,
    dataTransmissao: d.dataTransmissao ? fmtDataHora.format(d.dataTransmissao) : null,
    rpaTotal: Number(d.rpaTotal),
    totalDebito: Number(d.totalDebito),
    tributos: COLUNAS_TRIBUTO.map((t) => ({ rotulo: ROTULO_TRIBUTO[t], valor: Number(d[t]) })),
    alertas: d.alertas,
  }));

  return (
    <div>
      <div className="mb-6">
        <Link href={`/painel/clientes/${id}`} className="text-sm text-slate-500 hover:underline">
          ← Voltar para {cliente.nomeFantasia || cliente.razaoSocial}
        </Link>
        <h1 className="mt-1 text-2xl font-bold text-slate-800">
          PGDAS-D — declaração do Simples Nacional
        </h1>
        <p className="text-sm text-slate-500">
          {cliente.razaoSocial} · CNPJ {cliente.cnpj}
          {cliente.regimeTributario && <> · {cliente.regimeTributario}</>} · acesso e-CAC:{" "}
          {cliente.metodoAcessoEcac === "CERTIFICADO_PROPRIO"
            ? "certificado do cliente"
            : "procuração da March"}
        </p>
      </div>

      {cliente.regimeTributario && !ehSimples(cliente.regimeTributario) && (
        <div className="mb-6 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Este cliente está cadastrado como <b>{cliente.regimeTributario}</b>. PGDAS-D só existe pra
          optante do Simples Nacional — a consulta fica bloqueada até o regime ser corrigido no
          cadastro.
        </div>
      )}

      <div className="mb-6 rounded-xl border border-slate-200 bg-white p-4">
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
      </div>

      <section className="mb-6 rounded-xl border border-slate-200 bg-white p-5">
        <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-slate-500">
          Consultar no SERPRO (Integra Contador)
        </h2>
        <ConsultarPgdasdButton clienteId={id} anoInicial={anoInicial} anoFinal={anoFinal} />
        <div className="mt-4 border-t border-slate-100 pt-4">
          <VarrerPastaSimplesButton clienteId={id} />
        </div>
        {ultimaConsulta && (
          <p className="mt-3 border-t border-slate-100 pt-3 text-xs text-slate-500">
            <b>Última consulta:</b> {fmtDataHora.format(ultimaConsulta.requisitadoEm)} ·{" "}
            {ultimaConsulta.declaracoesRetornadas} lida(s), {ultimaConsulta.competenciasSemDeclaracao}{" "}
            sem declaração, {ultimaConsulta.competenciasComErro} com erro
            {ultimaConsulta.mensagem && (
              <>
                {" "}
                — <span className="text-slate-400">{ultimaConsulta.mensagem}</span>
              </>
            )}
          </p>
        )}
      </section>

      {declaracoes.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white px-6 py-10 text-center text-sm text-slate-500">
          Nenhuma declaração PGDAS-D consultada no período {anoInicial}
          {anoFinal !== anoInicial ? `–${anoFinal}` : ""}. Use o botão acima.
        </div>
      ) : (
        <section className="mb-6 overflow-x-auto rounded-xl border border-slate-200 bg-white p-5">
          <div className="mb-3 flex flex-wrap items-baseline justify-between gap-3">
            <h2 className="text-sm font-bold uppercase tracking-wide text-slate-500">
              Declarações lidas
            </h2>
            <p className="text-sm text-slate-500">
              Total do DAS no período:{" "}
              <span className="font-mono text-lg font-semibold text-slate-800">
                {fmtBrl.format(totalDebito)}
              </span>
            </p>
          </div>
          <p className="mb-3 text-xs text-slate-500">
            O valor que interessa é o <b>total do DAS</b> — é uma guia só. A composição por tributo
            fica no botão &quot;ver&quot; de cada competência. O ICMS que aparece lá é o{" "}
            <b>ICMS dentro do DAS</b>: não se soma nem se confronta com a complementação de alíquota
            / difal declarada na GIAM, que é tributo distinto em guia estadual.
          </p>
          <TabelaPgdasd linhas={linhas} />
        </section>
      )}

      {temConfronto && (
        <section className="mb-6 overflow-x-auto rounded-xl border border-slate-200 bg-white p-5">
          <h2 className="mb-1 text-sm font-bold uppercase tracking-wide text-slate-500">
            Declarado × guia × pago
          </h2>
          <p className="mb-3 text-xs text-slate-500">
            Três documentos do mesmo mês, lado a lado — nunca somados. A declaração é o apurado, a
            guia é o cobrado, o comprovante é o que a Receita registra como arrecadado. Diferença
            entre pago e declarado costuma ser multa e juros de recolhimento em atraso.
          </p>
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
                <th className="py-2 text-left font-semibold">Competência</th>
                <th className="text-right font-semibold">Declarado (PGDAS-D)</th>
                <th className="text-right font-semibold">Guia (DAS)</th>
                <th className="text-right font-semibold">Pago</th>
                <th className="text-left font-semibold">Arrecadado em</th>
                <th className="text-right font-semibold">Pago − declarado</th>
              </tr>
            </thead>
            <tbody>
              {confronto.map((l) => {
                const diff =
                  l.pago !== null && l.declarado !== null ? l.pago - l.declarado : null;
                return (
                  <tr key={l.competencia.getTime()} className="border-b border-slate-100">
                    <td className="py-1.5 text-left font-mono">{labelCompetencia(l.competencia)}</td>
                    <td className="text-right font-mono">
                      {l.declarado === null ? (
                        <span className="text-slate-300">—</span>
                      ) : (
                        fmtBrl.format(l.declarado)
                      )}
                    </td>
                    <td className="text-right font-mono text-slate-600">
                      {l.guia === null ? <span className="text-slate-300">—</span> : fmtBrl.format(l.guia)}
                    </td>
                    <td className="text-right font-mono font-semibold">
                      {l.pago === null ? <span className="text-slate-300">—</span> : fmtBrl.format(l.pago)}
                    </td>
                    <td className="text-left text-xs text-slate-500">
                      {l.pagoEm ? fmtDataHora.format(l.pagoEm).slice(0, 10) : "—"}
                    </td>
                    <td
                      className={
                        "text-right font-mono " +
                        (diff === null
                          ? "text-slate-300"
                          : Math.abs(diff) < 0.01
                            ? "text-emerald-700"
                            : "text-amber-700")
                      }
                    >
                      {diff === null
                        ? "—"
                        : Math.abs(diff) < 0.01
                          ? "confere"
                          : fmtBrl.format(diff)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>
      )}

      {retificadoras.length > 0 && (
        <div className="mb-6 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-600">
          <b>{retificadoras.length} competência(s) com declaração retificadora</b> —{" "}
          {retificadoras.map((d) => labelCompetencia(d.periodoApuracao)).join(", ")}. A plataforma
          guarda sempre a <b>última declaração transmitida</b> da competência: uma nova consulta
          depois de retificar substitui os valores anteriores.
        </div>
      )}

      {comAlerta.length > 0 && (
        <section className="mb-6 rounded-xl border border-amber-200 bg-amber-50 p-5">
          <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-amber-800">
            Incoerências na leitura ({comAlerta.length} competência(s))
          </h2>
          <p className="mb-3 text-xs text-amber-800">
            A plataforma gravou exatamente o que a declaração diz. Os pontos abaixo são para o
            contador decidir — nenhum valor foi ajustado.
          </p>
          <ul className="space-y-2 text-xs text-amber-900">
            {comAlerta.map((d) => (
              <li key={d.id}>
                <span className="font-mono font-semibold">
                  {labelCompetencia(d.periodoApuracao)}
                </span>
                <ul className="ml-4 list-disc">
                  {d.alertas.map((a, i) => (
                    <li key={i}>{a}</li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-xs leading-relaxed text-slate-600">
        <p>
          <strong>De onde vem:</strong> SERPRO Integra Contador, sistema PGDASD, serviço
          CONSULTIMADECREC14 (última declaração/recibo da competência). O serviço devolve a
          declaração em PDF; a plataforma extrai receita bruta do período (seção 2.1) e o débito por
          tributo (seção 2.8) e descarta o arquivo — nada de PDF em disco ou no banco.
        </p>
        <p className="mt-2">
          <strong>Para onde vai:</strong> as linhas federais deste PGDAS alimentam o relatório de{" "}
          <Link href={`/painel/clientes/${id}/impostos-declarados`} className="underline">
            Impostos a Pagar
          </Link>
          , e a RPA é o lado &quot;declarado&quot; do confronto com as saídas da GIAM.
        </p>
      </div>
    </div>
  );
}
