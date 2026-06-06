import Link from "next/link";
import { requirePapel, PAPEIS_INTERNOS } from "@/lib/auth";
import { resumoClientes } from "@/lib/service";
import { ROTULO_SITUACAO } from "@/lib/accounting/analyze";

const CORES: Record<string, string> = {
  favoravel: "text-green-700",
  regular_com_atencao: "text-amber-700",
  critica: "text-red-700",
  inconclusiva: "text-slate-600",
  sem_dados: "text-slate-400",
};

export default async function ClientesPage({
  searchParams,
}: {
  searchParams: Promise<{ regime?: string; setor?: string; q?: string }>;
}) {
  const sessao = await requirePapel(PAPEIS_INTERNOS);
  const { regime, setor, q } = await searchParams;
  let clientes = await resumoClientes(sessao.escritorioId);

  if (regime) clientes = clientes.filter((c) => c.regimeTributario === regime);
  if (setor) clientes = clientes.filter((c) => c.setorAtividade === setor);
  if (q)
    clientes = clientes.filter((c) =>
      c.razaoSocial.toLowerCase().includes(q.toLowerCase()),
    );

  const regimes = ["Simples Nacional", "Lucro Presumido", "Lucro Real", "MEI"];
  const setores = ["comercio", "industria", "servico", "rural", "holding", "construcao", "outro"];

  return (
    <div>
      <header className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Clientes</h1>
          <p className="text-sm text-slate-500">{clientes.length} cliente(s)</p>
        </div>
        <Link href="/painel/clientes/novo" className="btn btn-accent">
          + Novo cliente
        </Link>
      </header>

      <form className="card mb-4 flex flex-wrap items-end gap-3 p-4">
        <div className="min-w-48 flex-1">
          <label className="label">Buscar por razão social</label>
          <input name="q" defaultValue={q} className="input" placeholder="Digite o nome..." />
        </div>
        <div>
          <label className="label">Regime</label>
          <select name="regime" defaultValue={regime ?? ""} className="input">
            <option value="">Todos</option>
            {regimes.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">Setor</label>
          <select name="setor" defaultValue={setor ?? ""} className="input capitalize">
            <option value="">Todos</option>
            {setores.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>
        <button className="btn btn-ghost">Filtrar</button>
      </form>

      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3">Cliente</th>
              <th className="px-4 py-3">CNPJ / Contador</th>
              <th className="px-4 py-3">Regime</th>
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
                <td className="px-4 py-3 text-slate-600">{c.contadorResponsavel ?? "—"}</td>
                <td className="px-4 py-3 text-slate-600">{c.regimeTributario ?? "—"}</td>
                <td className="px-4 py-3 text-slate-600">{c.anos.length ? c.anos.join(", ") : "—"}</td>
                <td className={`px-4 py-3 font-medium ${CORES[c.situacao]}`}>
                  {c.situacao === "sem_dados"
                    ? "Sem dados"
                    : ROTULO_SITUACAO[c.situacao as keyof typeof ROTULO_SITUACAO]}
                </td>
              </tr>
            ))}
            {clientes.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-slate-400">
                  Nenhum cliente encontrado.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
