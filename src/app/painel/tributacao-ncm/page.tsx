import Link from "next/link";
import { requireSessao, PAPEIS_INTERNOS } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { redirect } from "next/navigation";
import { ROTULO_ATIVIDADE_TRIBUTARIA, type AtividadeTributaria } from "@/lib/atividade-tributaria";

export default async function TributacaoNcmHome() {
  const sessao = await requireSessao();
  if (!PAPEIS_INTERNOS.includes(sessao.papel)) redirect("/painel");

  const clientes = await prisma.cliente.findMany({
    where: { escritorioId: sessao.escritorioId },
    orderBy: { razaoSocial: "asc" },
    include: {
      _count: { select: { vigenciasNcm: true } },
    },
  });

  // Base seed carregada?
  const totalConfigs = await prisma.configuracaoNcm.count();
  const totalNcmsBase = await prisma.ncmBase.count();

  return (
    <div>
      <header className="mb-6">
        <h1 className="text-2xl font-bold text-slate-800">Tributação NCM · PIS/COFINS</h1>
        <p className="text-sm text-slate-500">
          Gera o TXT de configuração de NCM para importar no Domínio, cruzando o estoque do cliente com nossa base local
          e consultas automáticas à Econet para NCMs faltantes.
        </p>
      </header>

      <section className="mb-8 grid grid-cols-2 gap-4 md:grid-cols-4">
        <div className="card p-4">
          <div className="text-xs uppercase tracking-wide text-slate-500">Configurações na base</div>
          <div className="mt-1 text-2xl font-bold">{totalConfigs}</div>
        </div>
        <div className="card p-4">
          <div className="text-xs uppercase tracking-wide text-slate-500">NCMs classificados</div>
          <div className="mt-1 text-2xl font-bold">{totalNcmsBase}</div>
        </div>
        <div className="card p-4">
          <div className="text-xs uppercase tracking-wide text-slate-500">Clientes</div>
          <div className="mt-1 text-2xl font-bold">{clientes.length}</div>
        </div>
        <div className="card p-4">
          <div className="text-xs uppercase tracking-wide text-slate-500">Vigências geradas</div>
          <div className="mt-1 text-2xl font-bold">
            {clientes.reduce((soma, c) => soma + c._count.vigenciasNcm, 0)}
          </div>
        </div>
      </section>

      {totalConfigs === 0 && (
        <div className="mb-8 rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
          ⚠ <b>Base semente ainda não carregada.</b> Rode uma vez o seed pra popular as 54 configurações do arquivo pai da
          Autmais + os NCMs conhecidos:
          <pre className="mt-2 rounded bg-amber-100 p-2 text-xs">
            cd C:\Dev\plataforma-contabil{"\n"}
            npx tsx prisma/seed-tributacao-ncm.ts
          </pre>
        </div>
      )}

      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-bold text-slate-800">Clientes</h2>
        </div>
        <div className="card overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">Cliente</th>
                <th className="px-4 py-3">CNPJ</th>
                <th className="px-4 py-3">CNAE principal</th>
                <th className="px-4 py-3">Atividade tributária</th>
                <th className="px-4 py-3">Vigências</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {clientes.map((c) => (
                <tr key={c.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3">
                    <div className="font-medium text-slate-800">{c.razaoSocial}</div>
                    {c.nomeFantasia && <div className="text-xs text-slate-400">{c.nomeFantasia}</div>}
                  </td>
                  <td className="px-4 py-3 text-slate-600">{c.cnpj}</td>
                  <td className="px-4 py-3 text-slate-600">{c.cnaePrincipal ?? "—"}</td>
                  <td className="px-4 py-3 text-slate-600">
                    {c.atividadeTributaria
                      ? ROTULO_ATIVIDADE_TRIBUTARIA[c.atividadeTributaria as AtividadeTributaria] ?? c.atividadeTributaria
                      : "—"}
                  </td>
                  <td className="px-4 py-3 text-slate-600">{c._count.vigenciasNcm}</td>
                  <td className="px-4 py-3 text-right">
                    <Link
                      href={`/painel/tributacao-ncm/${c.id}`}
                      className="text-sm text-[var(--brand)] hover:underline"
                    >
                      Abrir →
                    </Link>
                  </td>
                </tr>
              ))}
              {clientes.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-6 text-center text-slate-400">
                    Nenhum cliente cadastrado. Cadastre em Clientes para começar.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
