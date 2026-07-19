import Link from "next/link";
import { requireSessao, PAPEIS_INTERNOS } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { redirect, notFound } from "next/navigation";
import { ROTULO_ATIVIDADE_TRIBUTARIA, type AtividadeTributaria, atividadeTributariaFromCnae } from "@/lib/atividade-tributaria";
import { NovaVigenciaForm } from "./_NovaVigenciaForm";
import { ListaVigencias } from "./_ListaVigencias";

export default async function TributacaoClientePage(props: { params: Promise<{ clienteId: string }> }) {
  const { clienteId } = await props.params;
  const sessao = await requireSessao();
  if (!PAPEIS_INTERNOS.includes(sessao.papel)) redirect("/painel");

  const cliente = await prisma.cliente.findUnique({
    where: { id: clienteId, escritorioId: sessao.escritorioId },
    include: {
      vigenciasNcm: {
        orderBy: { dataVigencia: "desc" },
        include: { _count: { select: { ncms: true } } },
      },
    },
  });
  if (!cliente) notFound();

  const atividadeSugerida =
    (cliente.atividadeTributaria as AtividadeTributaria) ?? atividadeTributariaFromCnae(cliente.cnaePrincipal);

  return (
    <div>
      <div className="mb-4 text-sm">
        <Link href="/painel/tributacao-ncm" className="text-[var(--brand)] hover:underline">
          ← Tributação NCM
        </Link>
      </div>

      <header className="mb-6">
        <h1 className="text-2xl font-bold text-slate-800">{cliente.razaoSocial}</h1>
        <p className="text-sm text-slate-500">
          {cliente.cnpj} · {cliente.cnaePrincipal ?? "sem CNAE"}
        </p>
      </header>

      <section className="mb-8 grid gap-4 md:grid-cols-3">
        <div className="card p-4">
          <div className="text-xs uppercase tracking-wide text-slate-500">Atividade tributária</div>
          <div className="mt-1 font-medium text-slate-800">
            {atividadeSugerida
              ? ROTULO_ATIVIDADE_TRIBUTARIA[atividadeSugerida] ?? atividadeSugerida
              : "Não definida"}
          </div>
          {!cliente.atividadeTributaria && atividadeSugerida && (
            <div className="mt-1 text-xs text-amber-700">Inferida do CNAE — edite no cadastro se necessário.</div>
          )}
        </div>
        <div className="card p-4">
          <div className="text-xs uppercase tracking-wide text-slate-500">Regime tributário</div>
          <div className="mt-1 font-medium text-slate-800">{cliente.regimeTributario ?? "—"}</div>
        </div>
        <div className="card p-4">
          <div className="text-xs uppercase tracking-wide text-slate-500">Vigências</div>
          <div className="mt-1 text-2xl font-bold text-slate-800">{cliente.vigenciasNcm.length}</div>
        </div>
      </section>

      <section className="mb-8">
        <h2 className="mb-3 text-lg font-bold text-slate-800">Nova vigência</h2>
        <NovaVigenciaForm clienteId={cliente.id} />
      </section>

      <section>
        <h2 className="mb-3 text-lg font-bold text-slate-800">Vigências existentes</h2>
        <ListaVigencias
          clienteId={cliente.id}
          vigencias={cliente.vigenciasNcm.map((v) => ({
            id: v.id,
            dataVigencia: v.dataVigencia.toISOString(),
            descricao: v.descricao,
            status: v.status,
            qtdNcms: v._count.ncms,
          }))}
        />
      </section>
    </div>
  );
}
