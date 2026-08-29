import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePapel, PAPEIS_INTERNOS } from "@/lib/auth";
import { prisma } from "@/lib/db";
import {
  levantarImpostosDeclarados,
  totaisPorOrigem,
  conflitos,
  ROTULO_ORIGEM,
  type ItemAPagar,
} from "@/lib/impostos/declarados";
import { PrintHeaderImpostos } from "./_components/PrintHeaderImpostos";
import { BotaoImprimir } from "./_components/BotaoImprimir";

/**
 * Relatório — Impostos a Pagar (declarados).
 *
 * O lado "declaração" isolado da Conciliação Estadual: o que a GIAM e as demais
 * declarações apontam como a pagar, sem confrontar com o Razão.
 *
 * Deliberadamente NÃO existe um "total geral" somando todas as origens: o mesmo
 * tributo pode ser declarado em duas fontes na mesma competência (a DCTFWeb
 * confessa o que a ECF apurou) e um total único mentiria. Ver o cabeçalho de
 * `src/lib/impostos/declarados.ts`.
 */

const fmtBrl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

export default async function ImpostosDeclaradosPage({
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
  const anoInicial = Number(q.anoInicial) || anoCorrente - 4;
  const anoFinal = Number(q.anoFinal) || anoCorrente;

  const cliente = await prisma.cliente.findFirst({
    where: { id, escritorioId: sessao.escritorioId },
    select: {
      id: true,
      razaoSocial: true,
      nomeFantasia: true,
      cnpj: true,
      inscricaoEstadual: true,
      regimeTributario: true,
    },
  });
  if (!cliente) notFound();

  // Timbre do escritório — só usado no @media print.
  const escritorio = await prisma.escritorio.findUnique({
    where: { id: sessao.escritorioId },
    select: {
      razaoSocial: true,
      nomeFantasia: true,
      cnpj: true,
      crc: true,
      endereco: true,
      telefone: true,
      email: true,
      site: true,
      logoDataUrl: true,
    },
  });

  const itens = await levantarImpostosDeclarados({ clienteId: id, anoInicial, anoFinal });
  const totais = totaisPorOrigem(itens);
  const listaConflitos = conflitos(itens);

  return (
    <div className="impostos-declarados">
      <PrintHeaderImpostos
        cliente={cliente.razaoSocial}
        cnpj={cliente.cnpj}
        inscricaoEstadual={cliente.inscricaoEstadual}
        regime={cliente.regimeTributario}
        anoInicial={anoInicial}
        anoFinal={anoFinal}
        escritorio={escritorio}
      />

      <div className="mb-6 no-print">
        <Link href={`/painel/clientes/${id}`} className="text-sm text-slate-500 hover:underline">
          ← Voltar para {cliente.nomeFantasia || cliente.razaoSocial}
        </Link>
        <div className="mt-1 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-slate-800">
              Impostos a Pagar — o que as declarações apontam
            </h1>
            <p className="text-sm text-slate-500">
              {cliente.razaoSocial} · CNPJ {cliente.cnpj}
              {cliente.inscricaoEstadual && <> · IE {cliente.inscricaoEstadual}</>}
              {cliente.regimeTributario && <> · {cliente.regimeTributario}</>}
            </p>
          </div>
          {itens.length > 0 && <BotaoImprimir />}
        </div>
      </div>

      <div className="mb-6 rounded-xl border border-slate-200 bg-white p-4 no-print">
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

      {itens.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white px-6 py-10 text-center">
          <p className="font-semibold text-slate-700">
            Nenhuma declaração com valor a pagar no período
          </p>
          <p className="mx-auto mt-2 max-w-xl text-sm text-slate-500">
            O relatório lê o que já está importado: GIAM, SPED-Fiscal, DCTFWeb e ECF. Importe as
            declarações do cliente ou amplie o intervalo de anos acima.
          </p>
        </div>
      ) : (
        <>
          {/* Totais por origem — nunca um total único somando tudo. */}
          <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {totais.map((t) => (
              <div key={t.origem} className="rounded-xl border border-slate-200 bg-white px-4 py-3">
                <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                  {t.esfera === "ESTADUAL" ? "Estadual" : "Federal"}
                </div>
                <div className="mt-0.5 text-sm font-semibold text-slate-700">
                  {ROTULO_ORIGEM[t.origem]}
                </div>
                <div className="mt-1 text-xl font-bold tabular-nums text-slate-800">
                  {fmtBrl.format(t.total)}
                </div>
                <div className="text-xs text-slate-500">
                  {t.itens} lançamento{t.itens > 1 ? "s" : ""}
                </div>
              </div>
            ))}
          </div>

          {listaConflitos.length > 0 && (
            <div className="mb-6 rounded-xl border border-amber-200 bg-amber-50 px-5 py-4 text-sm text-amber-900">
              <p className="font-semibold">
                Mesmo tributo declarado em mais de uma fonte — não some as origens
              </p>
              <p className="mt-1 text-amber-800">
                Nem sempre é erro: a DCTFWeb confessa o que a ECF apurou. Mas somar as duas conta o
                tributo duas vezes. Confira caso a caso:
              </p>
              <ul className="mt-2 space-y-0.5">
                {listaConflitos.map((c) => (
                  <li key={`${c.competenciaLabel}-${c.tributo}`} className="font-mono text-xs">
                    {c.competenciaLabel} · {c.tributo} → {c.origens.map((o) => ROTULO_ORIGEM[o]).join(" + ")}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
            <table className="impostos-tabela w-full min-w-[900px] text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                  <th className="px-4 py-3 font-semibold">Competência</th>
                  <th className="px-4 py-3 font-semibold">Esfera</th>
                  <th className="px-4 py-3 font-semibold">Declaração</th>
                  <th className="px-4 py-3 font-semibold">Tributo</th>
                  <th className="px-4 py-3 font-semibold">Detalhe</th>
                  <th className="px-4 py-3 font-semibold">Vencimento</th>
                  <th className="px-4 py-3 text-right font-semibold">Valor</th>
                  {/* Só no papel: espaço pra marcar o que foi localizado no extrato. */}
                  <th className="print-only px-4 py-3 text-center font-semibold">Conferido</th>
                </tr>
              </thead>
              <tbody>
                {itens.map((i, idx) => (
                  <LinhaItem key={`${i.origem}-${i.competenciaLabel}-${i.tributo}-${idx}`} item={i} />
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-xs leading-relaxed text-slate-600 no-print">
            <p>
              <strong>ICMS</strong> vem da GIAM, quebrado por tipo do Segmento E (normal, difal,
              complementação, ST, fundo de pobreza) — é a única fonte que traz vencimento por linha.
              O SPED-Fiscal declara o mesmo ICMS, então só entra nas competências que não têm GIAM
              importada, pra não duplicar.
            </p>
            <p className="mt-1.5">
              <strong>Federais</strong> vêm da DCTFWeb, uma linha por código de receita, usando o
              saldo a pagar quando a declaração o informa. <strong>IRPJ e CSLL</strong> da ECF são
              trimestrais — por isso aparecem com competência de trimestre, não de mês.
            </p>
            <p className="mt-1.5">
              Este relatório mostra o <strong>declarado</strong>. Para confrontar com a contabilidade,
              use{" "}
              <Link href="/painel/conciliacao-estadual" className="underline">
                Conciliação — Pagamentos de Impostos Estaduais
              </Link>{" "}
              (GIAM × Razão) ou{" "}
              <Link href="/painel/auditoria-tributaria" className="underline">
                Conciliação — Impostos Federais
              </Link>{" "}
              (apurado × pago).
            </p>
          </div>
        </>
      )}
    </div>
  );
}

function LinhaItem({ item }: { item: ItemAPagar }) {
  return (
    <tr className="border-b border-slate-100 last:border-0">
      <td className="px-4 py-2.5 font-mono text-xs text-slate-700">{item.competenciaLabel}</td>
      <td className="px-4 py-2.5">
        <span
          className={
            "rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide " +
            (item.esfera === "ESTADUAL"
              ? "bg-sky-100 text-sky-800"
              : "bg-violet-100 text-violet-800")
          }
        >
          {item.esfera === "ESTADUAL" ? "Estadual" : "Federal"}
        </span>
      </td>
      <td className="px-4 py-2.5 text-slate-600">{ROTULO_ORIGEM[item.origem]}</td>
      <td className="px-4 py-2.5 font-semibold text-slate-800">{item.tributo}</td>
      <td className="px-4 py-2.5 text-slate-500">
        {item.detalhe}
        {/* Obrigação paga unificada (DAS): a composição aparece como nota da
            linha, nunca como linhas próprias — somar as partes e o total
            contaria o mesmo tributo duas vezes. */}
        {item.composicao && item.composicao.length > 0 && (
          <span className="mt-0.5 block text-[10px] text-slate-400">
            {item.composicao
              .map((c) => `${c.tributo} ${fmtBrl.format(c.valor)}`)
              .join(" · ")}
          </span>
        )}
      </td>
      <td className="px-4 py-2.5 text-slate-600">
        {item.vencimento
          ? item.vencimento.toLocaleDateString("pt-BR", { timeZone: "UTC" })
          : <span className="text-slate-300">—</span>}
      </td>
      <td className="px-4 py-2.5 text-right font-medium tabular-nums text-slate-800">
        {fmtBrl.format(item.valor)}
      </td>
      <td className="print-only px-4 py-2.5 text-center">
        <span className="caixa-conferido" aria-hidden />
      </td>
    </tr>
  );
}
