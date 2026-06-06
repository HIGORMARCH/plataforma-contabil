import Link from "next/link";
import { requireSessao, PAPEIS_INTERNOS } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { resumoClientes } from "@/lib/service";
import { ROTULO_SITUACAO } from "@/lib/accounting/analyze";
import { StatCard } from "@/components/ui";
import { PainelCliente } from "./_components/PainelCliente";

const CORES_SITUACAO: Record<string, string> = {
  favoravel: "text-green-700",
  regular_com_atencao: "text-amber-700",
  critica: "text-red-700",
  inconclusiva: "text-slate-600",
  sem_dados: "text-slate-400",
};

export default async function PainelHome() {
  const sessao = await requireSessao();

  if (!PAPEIS_INTERNOS.includes(sessao.papel)) {
    return <PainelCliente clienteId={sessao.clienteId!} nome={sessao.nome} />;
  }

  const clientes = await resumoClientes(sessao.escritorioId);
  const relatorios = await prisma.relatorio.findMany({
    where: { cliente: { escritorioId: sessao.escritorioId } },
  });

  const conta = (st: string) => relatorios.filter((r) => r.status === st).length;
  const comCriticos = clientes.filter((c) => c.criticos > 0 || c.situacao === "critica");
  const comInconsistencia = clientes.filter((c) => c.bloqueado);

  return (
    <div>
      <header className="mb-6">
        <h1 className="text-2xl font-bold text-slate-800">Painel do Escritório</h1>
        <p className="text-sm text-slate-500">Visão geral dos clientes e relatórios.</p>
      </header>

      <section className="mb-8 grid grid-cols-2 gap-4 md:grid-cols-4">
        <StatCard rotulo="Clientes" valor={clientes.length} />
        <StatCard rotulo="Em elaboração" valor={conta("EM_ANALISE")} cor="text-slate-700" />
        <StatCard rotulo="Aguardando aprovação" valor={conta("AGUARDANDO_REVISAO")} cor="text-amber-700" />
        <StatCard rotulo="Liberados" valor={conta("LIBERADO")} cor="text-green-700" />
      </section>

      <section className="mb-8 grid gap-4 md:grid-cols-2">
        <div className="card p-5">
          <h2 className="mb-1 text-sm font-semibold text-red-700">⚠ Clientes com indicadores críticos</h2>
          {comCriticos.length === 0 ? (
            <p className="text-sm text-slate-500">Nenhum cliente em situação crítica.</p>
          ) : (
            <ul className="mt-2 space-y-1 text-sm">
              {comCriticos.map((c) => (
                <li key={c.id}>
                  <Link href={`/painel/clientes/${c.id}`} className="text-[var(--brand)] hover:underline">
                    {c.razaoSocial}
                  </Link>{" "}
                  <span className="text-slate-500">({c.criticos} indicadores críticos)</span>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="card p-5">
          <h2 className="mb-1 text-sm font-semibold text-amber-700">⛔ Clientes com inconsistências contábeis</h2>
          {comInconsistencia.length === 0 ? (
            <p className="text-sm text-slate-500">Nenhuma inconsistência bloqueante detectada.</p>
          ) : (
            <ul className="mt-2 space-y-1 text-sm">
              {comInconsistencia.map((c) => (
                <li key={c.id}>
                  <Link href={`/painel/clientes/${c.id}`} className="text-[var(--brand)] hover:underline">
                    {c.razaoSocial}
                  </Link>{" "}
                  <span className="text-slate-500">— emissão bloqueada até revisão</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-bold text-slate-800">Clientes</h2>
          <Link href="/painel/clientes/novo" className="btn btn-accent">
            + Novo cliente
          </Link>
        </div>
        <div className="card overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">Cliente</th>
                <th className="px-4 py-3">Regime</th>
                <th className="px-4 py-3">Setor</th>
                <th className="px-4 py-3">Exercícios</th>
                <th className="px-4 py-3">Situação</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {clientes.map((c) => (
                <tr key={c.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3">
                    <Link href={`/painel/clientes/${c.id}`} className="font-medium text-[var(--brand)] hover:underline">
                      {c.razaoSocial}
                    </Link>
                    {c.nomeFantasia && <div className="text-xs text-slate-400">{c.nomeFantasia}</div>}
                  </td>
                  <td className="px-4 py-3 text-slate-600">{c.regimeTributario ?? "—"}</td>
                  <td className="px-4 py-3 capitalize text-slate-600">{c.setorAtividade ?? "—"}</td>
                  <td className="px-4 py-3 text-slate-600">
                    {c.anos.length > 0 ? c.anos.join(", ") : "—"}
                  </td>
                  <td className={`px-4 py-3 font-medium ${CORES_SITUACAO[c.situacao]}`}>
                    {c.situacao === "sem_dados"
                      ? "Sem dados"
                      : ROTULO_SITUACAO[c.situacao as keyof typeof ROTULO_SITUACAO]}
                  </td>
                </tr>
              ))}
              {clientes.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-6 text-center text-slate-400">
                    Nenhum cliente cadastrado. Comece criando um novo cliente.
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
