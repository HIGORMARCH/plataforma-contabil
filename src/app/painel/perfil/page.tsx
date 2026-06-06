import { requireSessao } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { redirect } from "next/navigation";

export default async function PerfilPage() {
  const sessao = await requireSessao();
  if (!sessao.clienteId) redirect("/painel");
  const cliente = await prisma.cliente.findUnique({ where: { id: sessao.clienteId } });
  if (!cliente) redirect("/painel");

  const infos: [string, string | null][] = [
    ["Razão social", cliente.razaoSocial],
    ["Nome fantasia", cliente.nomeFantasia],
    ["CNPJ", cliente.cnpj],
    ["Regime tributário", cliente.regimeTributario],
    ["Porte", cliente.porte],
    ["Município/UF", [cliente.municipio, cliente.uf].filter(Boolean).join("/") || null],
    ["Contador responsável", cliente.contadorResponsavel],
    ["E-mail", cliente.email],
    ["Telefone", cliente.telefone],
  ];

  return (
    <div>
      <header className="mb-6">
        <h1 className="text-2xl font-bold text-slate-800">Meus dados</h1>
        <p className="text-sm text-slate-500">Dados cadastrais da sua empresa no escritório.</p>
      </header>
      <section className="card p-5">
        <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm md:grid-cols-3">
          {infos.map(([k, v]) => (
            <div key={k}>
              <dt className="text-xs text-slate-400">{k}</dt>
              <dd className="text-slate-700">{v ?? "—"}</dd>
            </div>
          ))}
        </dl>
      </section>
      <p className="mt-3 text-xs text-slate-400">
        Para atualizar seus dados ou enviar documentos complementares, entre em contato com o seu
        contador responsável.
      </p>
    </div>
  );
}
