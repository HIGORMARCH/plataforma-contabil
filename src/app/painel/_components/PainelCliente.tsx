import Link from "next/link";
import { prisma } from "@/lib/db";
import { StatusBadge } from "@/components/ui";

export async function PainelCliente({ clienteId, nome }: { clienteId: string; nome: string }) {
  const cliente = await prisma.cliente.findUnique({
    where: { id: clienteId },
    include: { relatorios: { orderBy: { createdAt: "desc" } } },
  });

  // O cliente só enxerga relatórios já LIBERADOS.
  const liberados = (cliente?.relatorios ?? []).filter((r) => r.status === "LIBERADO");

  return (
    <div>
      <header className="mb-6">
        <h1 className="text-2xl font-bold text-slate-800">Olá, {nome.split(" ")[0]}</h1>
        <p className="text-sm text-slate-500">
          {cliente?.razaoSocial} — aqui estão seus relatórios disponíveis.
        </p>
      </header>

      {liberados.length === 0 ? (
        <div className="card p-8 text-center text-slate-500">
          Você ainda não possui relatórios liberados. Assim que seu contador concluir e aprovar uma
          análise, ela aparecerá aqui.
        </div>
      ) : (
        <div className="space-y-3">
          {liberados.map((r) => (
            <div key={r.id} className="card flex items-center justify-between p-5">
              <div>
                <p className="font-semibold text-slate-800">{r.titulo}</p>
                <p className="text-sm text-slate-500">Período: {r.periodo}</p>
                <div className="mt-1">
                  <StatusBadge status={r.status} />
                </div>
              </div>
              <div className="flex gap-2">
                <Link href={`/painel/relatorios/${r.id}`} className="btn btn-ghost">
                  Visualizar
                </Link>
                <a href={`/api/relatorios/${r.id}/pdf`} className="btn btn-primary">
                  Baixar PDF
                </a>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
