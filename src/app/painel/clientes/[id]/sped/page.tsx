import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePapel, PAPEIS_INTERNOS } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { UploadSpedForm } from "./_components/UploadSpedForm";
import { VarrerPastaButton } from "./_components/VarrerPastaButton";
import { VarrerPastaGiamButton } from "./_components/VarrerPastaGiamButton";

const fmtBrl = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

const fmtMesAno = new Intl.DateTimeFormat("pt-BR", {
  month: "2-digit",
  year: "numeric",
  timeZone: "UTC",
});

const fmtDataHora = new Intl.DateTimeFormat("pt-BR", {
  dateStyle: "short",
  timeStyle: "short",
});

export default async function SpedCliente({ params }: { params: Promise<{ id: string }> }) {
  const sessao = await requirePapel(PAPEIS_INTERNOS);
  const { id } = await params;

  const cliente = await prisma.cliente.findFirst({
    where: { id, escritorioId: sessao.escritorioId },
    include: {
      spedApuracoes: { orderBy: { periodoApuracao: "desc" } },
      spedImportacoes: { orderBy: { importadoEm: "desc" }, take: 10 },
      giamApuracoes: {
        orderBy: [{ periodoApuracao: "desc" }, { retificacao: "desc" }],
        include: { icmsARecolher: true },
      },
      giamImportacoes: { orderBy: { importadoEm: "desc" }, take: 10 },
    },
  });
  if (!cliente) notFound();

  return (
    <div>
      <div className="mb-6">
        <Link href={`/painel/clientes/${id}`} className="text-sm text-slate-500 hover:underline">
          ← Voltar para {cliente.nomeFantasia || cliente.razaoSocial}
        </Link>
        <h1 className="mt-1 text-2xl font-bold text-slate-800">
          Auditoria ICMS — SPED-Fiscal + GIAM
        </h1>
        <p className="text-sm text-slate-500">
          Apuração declarada à Receita Federal (SPED) e à SEFAZ-TO (GIAM). Ambas devem bater —
          divergência entre elas indica que declararam valores diferentes aos dois fiscos.
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <VarrerPastaButton clienteId={id} pastaFiscal={cliente.pastaFiscal} />
        <UploadSpedForm clienteId={id} />
      </div>

      <div className="mt-6">
        <VarrerPastaGiamButton
          clienteId={id}
          pastaGiam={cliente.pastaGiam}
          pastaFiscal={cliente.pastaFiscal}
        />
      </div>

      <section className="card mt-6 p-5">
        <h2 className="mb-4 text-sm font-bold uppercase tracking-wide text-slate-500">
          Apurações importadas — {cliente.spedApuracoes.length}
        </h2>
        {cliente.spedApuracoes.length === 0 ? (
          <p className="text-sm text-slate-500">
            Nenhuma apuração ainda. Faça upload de um arquivo SPED-Fiscal (.txt) acima.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-slate-200 text-left text-xs uppercase text-slate-500">
                <tr>
                  <th className="pb-2 pr-3">Competência</th>
                  <th className="pb-2 pr-3 text-right">Total compras</th>
                  <th className="pb-2 pr-3 text-right">Total vendas</th>
                  <th className="pb-2 pr-3 text-right">ICMS créditos</th>
                  <th className="pb-2 pr-3 text-right">ICMS débitos</th>
                  <th className="pb-2 pr-3 text-right">Saldo apurado</th>
                  <th className="pb-2 pr-3 text-right">ICMS a recolher</th>
                  <th className="pb-2 pr-3 text-right">Saldo credor →</th>
                </tr>
              </thead>
              <tbody>
                {cliente.spedApuracoes.map((a) => (
                  <tr key={a.id} className="border-b border-slate-100">
                    <td className="py-2 pr-3 font-medium text-slate-700">
                      {fmtMesAno.format(a.periodoApuracao)}
                    </td>
                    <td className="py-2 pr-3 text-right text-slate-700">
                      {fmtBrl.format(Number(a.totalCompras))}
                    </td>
                    <td className="py-2 pr-3 text-right text-slate-700">
                      {fmtBrl.format(Number(a.totalVendas))}
                    </td>
                    <td className="py-2 pr-3 text-right text-slate-700">
                      {fmtBrl.format(Number(a.totalCreditos))}
                    </td>
                    <td className="py-2 pr-3 text-right text-slate-700">
                      {fmtBrl.format(Number(a.totalDebitos))}
                    </td>
                    <td className="py-2 pr-3 text-right text-slate-700">
                      {fmtBrl.format(Number(a.saldoDevedorApurado))}
                    </td>
                    <td className="py-2 pr-3 text-right font-semibold text-slate-800">
                      {fmtBrl.format(Number(a.icmsARecolher))}
                    </td>
                    <td className="py-2 pr-3 text-right text-slate-500">
                      {Number(a.saldoCredorTransp) > 0
                        ? fmtBrl.format(Number(a.saldoCredorTransp))
                        : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="card mt-6 p-5">
        <h2 className="mb-4 text-sm font-bold uppercase tracking-wide text-slate-500">
          Apurações GIAM importadas — {cliente.giamApuracoes.length}
        </h2>
        {cliente.giamApuracoes.length === 0 ? (
          <p className="text-sm text-slate-500">
            Nenhuma GIAM ainda. Clique em &quot;Buscar novas GIAMs na pasta&quot; acima.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-slate-200 text-left text-xs uppercase text-slate-500">
                <tr>
                  <th className="pb-2 pr-3">Competência</th>
                  <th className="pb-2 pr-3">Rev.</th>
                  <th className="pb-2 pr-3 text-right">Débito saídas</th>
                  <th className="pb-2 pr-3 text-right">Crédito entradas</th>
                  <th className="pb-2 pr-3 text-right">Sld. credor ant.</th>
                  <th className="pb-2 pr-3 text-right">Deduções</th>
                  <th className="pb-2 pr-3 text-right">ICMS a recolher</th>
                </tr>
              </thead>
              <tbody>
                {cliente.giamApuracoes.map((a) => (
                  <tr key={a.id} className="border-b border-slate-100">
                    <td className="py-2 pr-3 font-medium text-slate-700">
                      {fmtMesAno.format(a.periodoApuracao)}
                    </td>
                    <td className="py-2 pr-3 text-xs text-slate-500">R{a.retificacao}</td>
                    <td className="py-2 pr-3 text-right text-slate-700">
                      {fmtBrl.format(Number(a.debitoSaidas))}
                    </td>
                    <td className="py-2 pr-3 text-right text-slate-700">
                      {fmtBrl.format(Number(a.creditoEntradas))}
                    </td>
                    <td className="py-2 pr-3 text-right text-slate-500">
                      {Number(a.saldoCredorAnterior) > 0
                        ? fmtBrl.format(Number(a.saldoCredorAnterior))
                        : "—"}
                    </td>
                    <td className="py-2 pr-3 text-right text-slate-500">
                      {Number(a.deducoes) > 0 ? fmtBrl.format(Number(a.deducoes)) : "—"}
                    </td>
                    <td className="py-2 pr-3 text-right font-semibold text-slate-800">
                      {fmtBrl.format(Number(a.icmsARecolherTotal))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {(cliente.spedImportacoes.length > 0 || cliente.giamImportacoes.length > 0) && (
        <section className="card mt-6 p-5">
          <h2 className="mb-4 text-sm font-bold uppercase tracking-wide text-slate-500">
            Últimas importações
          </h2>
          <div className="space-y-2 text-sm">
            {cliente.spedImportacoes.map((imp) => (
              <div
                key={`sped-${imp.id}`}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-100 px-3 py-2"
              >
                <div>
                  <p className="font-medium text-slate-700">
                    <span className="mr-2 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] uppercase text-slate-600">
                      SPED
                    </span>
                    {imp.nomeArquivo}
                  </p>
                  <p className="text-xs text-slate-500">
                    {fmtDataHora.format(imp.importadoEm)} · {imp.registrosE110} apuração(ões)
                    {imp.cnpjArquivo && ` · CNPJ ${imp.cnpjArquivo}`}
                    {imp.uf && ` · ${imp.uf}`}
                  </p>
                </div>
                <span
                  className={
                    "rounded-full px-2 py-0.5 text-xs " +
                    (imp.sucesso ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700")
                  }
                >
                  {imp.sucesso ? imp.mensagem ?? "importado" : "erro"}
                </span>
              </div>
            ))}
            {cliente.giamImportacoes.map((imp) => (
              <div
                key={`giam-${imp.id}`}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-100 px-3 py-2"
              >
                <div>
                  <p className="font-medium text-slate-700">
                    <span className="mr-2 rounded bg-indigo-100 px-1.5 py-0.5 text-[10px] uppercase text-indigo-700">
                      GIAM
                    </span>
                    {imp.nomeArquivo}
                  </p>
                  <p className="text-xs text-slate-500">
                    {fmtDataHora.format(imp.importadoEm)}
                    {imp.periodoArquivo && ` · ${imp.periodoArquivo}`}
                    {imp.retificacaoArquivo && ` · R${imp.retificacaoArquivo}`}
                    {imp.ieArquivo && ` · IE ${imp.ieArquivo}`}
                  </p>
                </div>
                <span
                  className={
                    "rounded-full px-2 py-0.5 text-xs " +
                    (imp.sucesso ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700")
                  }
                >
                  {imp.sucesso ? imp.mensagem ?? "importado" : "erro"}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
