import { requireSessao, ROTULO_PAPEL, PAPEIS_INTERNOS } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { Sidebar, type ItemMenu } from "@/components/Sidebar";

export default async function PainelLayout({ children }: { children: React.ReactNode }) {
  const sessao = await requireSessao();
  const escritorio = await prisma.escritorio.findUnique({ where: { id: sessao.escritorioId } });
  const interno = PAPEIS_INTERNOS.includes(sessao.papel);

  const itens: ItemMenu[] = interno
    ? [
        { href: "/painel", rotulo: "Painel", icone: "▣" },
        { href: "/painel/clientes", rotulo: "Clientes", icone: "👥" },
        { href: "/painel/relatorios", rotulo: "Relatórios", icone: "📄" },
        ...(sessao.papel === "ADMIN"
          ? [
              { href: "/painel/usuarios", rotulo: "Usuários", icone: "🔑" },
              { href: "/painel/configuracoes", rotulo: "Papel timbrado", icone: "⚙️" },
            ]
          : []),
      ]
    : [
        { href: "/painel", rotulo: "Meus relatórios", icone: "📄" },
        { href: "/painel/perfil", rotulo: "Meus dados", icone: "🏢" },
      ];

  return (
    <div className="flex min-h-screen flex-1">
      <Sidebar
        itens={itens}
        nome={sessao.nome}
        papelRotulo={ROTULO_PAPEL[sessao.papel]}
        escritorio={escritorio?.nomeFantasia ?? escritorio?.razaoSocial ?? "Escritório"}
      />
      <main className="flex-1 overflow-x-hidden">
        <div className="mx-auto max-w-6xl px-6 py-8">{children}</div>
      </main>
    </div>
  );
}
