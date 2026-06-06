import Link from "next/link";
import { requirePapel, PAPEIS_INTERNOS } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { StatusBadge } from "@/components/ui";

export default async function RelatoriosPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const sessao = await requirePapel(PAPEIS_INTERNOS);
  const { status } = await searchParams;

  const relatorios = await prisma.relatorio.findMany({
    where: {
      cliente: { escritorioId: sessao.escritorioId },
      ...(status ? { status } : {}),
    },
    include: { cliente: true },
    orderBy: { createdAt: "desc" },
  });

  const filtros = [
    ["", "Todos"],
    ["AGUARDANDO_REVISAO", "Aguardando revisão"],
    ["APROVADO", "Aprovados"],
    ["LIBERADO", "Liberados"],
  ];

  return (
    <div>
      <header className="mb-6">
        <h1 className="text-2xl font-bold text-slate-800">Relatórios</h1>
        <p className="text-sm text-slate-500">{relatorios.length} relatório(s)</p>
      </header>

      <div className="mb-4 flex flex-wrap gap-2">
        {filtros.map(([v, rotulo]) => (
          <Link
            key={v}
            href={v ? `/painel/relatorios?status=${v}` : "/painel/relatorios"}
            className={`rounded-full px-3 py-1 text-sm ${
              (status ?? "") === v ? "bg-[var(--brand)] text-white" : "bg-white text-slate-600 border border-slate-200"
            }`}
          >
            {rotulo}
          </Link>
        ))}
      </div>

      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3">Cliente</th>
              <th className="px-4 py-3">Período</th>
              <th className="px-4 py-3">Criado por</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {relatorios.map((r) => (
              <tr key={r.id} className="hover:bg-slate-50">
                <td className="px-4 py-3 font-medium text-slate-700">{r.cliente.razaoSocial}</td>
                <td className="px-4 py-3 text-slate-600">{r.periodo}</td>
                <td className="px-4 py-3 text-slate-600">{r.criadoPor ?? "—"}</td>
                <td className="px-4 py-3"><StatusBadge status={r.status} /></td>
                <td className="px-4 py-3 text-right">
                  <Link href={`/painel/relatorios/${r.id}`} className="text-[var(--brand)] hover:underline">
                    Abrir
                  </Link>
                </td>
              </tr>
            ))}
            {relatorios.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-slate-400">
                  Nenhum relatório encontrado.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
