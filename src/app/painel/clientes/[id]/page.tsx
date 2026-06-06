import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePapel, PAPEIS_INTERNOS } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { carregarExercicios } from "@/lib/service";
import { analisar } from "@/lib/accounting/analyze";
import { ResumoSituacao } from "@/components/Analise";
import { StatusBadge } from "@/components/ui";
import { gerarRelatorioAction } from "./actions";

export default async function ClienteDetalhe({ params }: { params: Promise<{ id: string }> }) {
  const sessao = await requirePapel(PAPEIS_INTERNOS);
  const { id } = await params;

  const cliente = await prisma.cliente.findFirst({
    where: { id, escritorioId: sessao.escritorioId },
    include: {
      exercicios: { orderBy: { ano: "desc" } },
      relatorios: { orderBy: { createdAt: "desc" } },
    },
  });
  if (!cliente) notFound();

  const exercicios = await carregarExercicios(id);
  const analise = exercicios.length ? analisar(exercicios) : null;

  const infos: [string, string | null][] = [
    ["CNPJ", cliente.cnpj],
    ["Nome fantasia", cliente.nomeFantasia],
    ["Regime tributário", cliente.regimeTributario],
    ["Porte", cliente.porte],
    ["Setor", cliente.setorAtividade],
    ["Município/UF", [cliente.municipio, cliente.uf].filter(Boolean).join("/") || null],
    ["CNAE", cliente.cnaePrincipal],
    ["Contador responsável", cliente.contadorResponsavel],
    ["CRC", cliente.crcContador],
  ];

  return (
    <div>
      <div className="mb-6">
        <Link href="/painel/clientes" className="text-sm text-slate-500 hover:underline">
          ← Voltar para clientes
        </Link>
        <div className="mt-1 flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-2xl font-bold text-slate-800">{cliente.razaoSocial}</h1>
          <div className="flex gap-2">
            <Link href={`/painel/clientes/${id}/exercicios`} className="btn btn-accent">
              📄 Adicionar documentos
            </Link>
            {exercicios.length > 0 && (
              <Link href={`/painel/clientes/${id}/analise`} className="btn btn-accent">
                Ver análise
              </Link>
            )}
            {exercicios.length > 0 && (
              <form action={gerarRelatorioAction.bind(null, id)}>
                <button className="btn btn-primary">Gerar relatório</button>
              </form>
            )}
          </div>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <section className="card p-5 lg:col-span-2">
          <h2 className="mb-4 text-sm font-bold uppercase tracking-wide text-slate-500">Dados cadastrais</h2>
          <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm md:grid-cols-3">
            {infos.map(([k, v]) => (
              <div key={k}>
                <dt className="text-xs text-slate-400">{k}</dt>
                <dd className="text-slate-700">{v ?? "—"}</dd>
              </div>
            ))}
          </dl>
        </section>

        <section>
          {analise ? (
            <ResumoSituacao analise={analise} />
          ) : (
            <div className="card p-5 text-center">
              <p className="mb-3 text-sm text-slate-500">
                Nenhum documento enviado ainda. Envie o Balanço, o Balancete e a DRE (PDF, Excel ou
                lançamento manual) para iniciar a análise.
              </p>
              <Link href={`/painel/clientes/${id}/exercicios`} className="btn btn-primary">
                📄 Enviar documentos
              </Link>
            </div>
          )}
        </section>
      </div>

      <section className="mt-6 grid gap-6 lg:grid-cols-2">
        <div>
          <h2 className="mb-3 text-lg font-bold text-slate-800">Exercícios cadastrados</h2>
          <div className="card divide-y divide-slate-100">
            {cliente.exercicios.length === 0 && (
              <p className="p-4 text-sm text-slate-400">Nenhum exercício cadastrado.</p>
            )}
            {cliente.exercicios.map((ex) => {
              const docs: string[] = ex.documentos ? JSON.parse(ex.documentos) : [];
              return (
                <div key={ex.id} className="flex items-center justify-between p-4">
                  <div>
                    <p className="font-semibold text-slate-700">Exercício {ex.ano}</p>
                    <p className="text-xs text-slate-400">
                      {docs.length ? docs.join(", ") : "Lançamento manual"}
                    </p>
                  </div>
                  <Link
                    href={`/painel/clientes/${id}/exercicios?ano=${ex.ano}`}
                    className="text-sm text-[var(--brand)] hover:underline"
                  >
                    Editar
                  </Link>
                </div>
              );
            })}
          </div>
        </div>

        <div>
          <h2 className="mb-3 text-lg font-bold text-slate-800">Relatórios</h2>
          <div className="card divide-y divide-slate-100">
            {cliente.relatorios.length === 0 && (
              <p className="p-4 text-sm text-slate-400">Nenhum relatório gerado.</p>
            )}
            {cliente.relatorios.map((r) => (
              <div key={r.id} className="flex items-center justify-between p-4">
                <div>
                  <Link href={`/painel/relatorios/${r.id}`} className="font-medium text-[var(--brand)] hover:underline">
                    {r.titulo}
                  </Link>
                  <p className="text-xs text-slate-400">Período {r.periodo}</p>
                </div>
                <StatusBadge status={r.status} />
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
