import { requireSessao, ROTULO_PAPEL, type Papel } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { redirect } from "next/navigation";

export default async function UsuariosPage() {
  const sessao = await requireSessao();
  if (sessao.papel !== "ADMIN") redirect("/painel");

  const usuarios = await prisma.usuario.findMany({
    where: { escritorioId: sessao.escritorioId },
    include: { cliente: true },
    orderBy: { nome: "asc" },
  });

  return (
    <div>
      <header className="mb-6">
        <h1 className="text-2xl font-bold text-slate-800">Usuários</h1>
        <p className="text-sm text-slate-500">Usuários internos e acessos de clientes do escritório.</p>
      </header>

      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3">Nome</th>
              <th className="px-4 py-3">E-mail</th>
              <th className="px-4 py-3">Perfil</th>
              <th className="px-4 py-3">Vínculo</th>
              <th className="px-4 py-3">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {usuarios.map((u) => (
              <tr key={u.id} className="hover:bg-slate-50">
                <td className="px-4 py-3 font-medium text-slate-700">{u.nome}</td>
                <td className="px-4 py-3 text-slate-600">{u.email}</td>
                <td className="px-4 py-3 text-slate-600">{ROTULO_PAPEL[u.papel as Papel]}</td>
                <td className="px-4 py-3 text-slate-600">{u.cliente?.razaoSocial ?? "Escritório"}</td>
                <td className="px-4 py-3">
                  <span className={`badge ${u.ativo ? "badge-saudavel" : "badge-critico"}`}>
                    {u.ativo ? "Ativo" : "Inativo"}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-xs text-slate-400">
        O cadastro completo de novos usuários e a definição de permissões fazem parte do módulo
        administrativo (próxima fase).
      </p>
    </div>
  );
}
