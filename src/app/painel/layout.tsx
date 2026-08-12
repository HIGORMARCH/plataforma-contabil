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

        { grupo: "Cadastros", href: "/painel/clientes", rotulo: "Clientes", icone: "👥" },

        { grupo: "Fiscal", href: "/painel/tributacao-ncm", rotulo: "Tributação NCM", icone: "🏷️" },
        {
          grupo: "Fiscal",
          href: "/painel/auditoria-obrigacoes-acessorias",
          rotulo: "Auditoria de Obrigações Acessórias",
          icone: "🧾",
        },
        { grupo: "Fiscal", href: "/painel/sped-fiscal", rotulo: "SPED-Fiscal", icone: "🧾" },
        { grupo: "Fiscal", href: "/painel/pis-cofins", rotulo: "PIS/COFINS", icone: "💰" },
        { grupo: "Fiscal", href: "/painel/irpj-csll", rotulo: "IRPJ/CSLL", icone: "🧮" },

        {
          grupo: "Contábil",
          href: "/painel/auditoria-tributaria",
          rotulo: "Conciliação — Pagamentos de Impostos Federais e Encargos Trabalhistas",
          icone: "🇧🇷",
        },
        {
          grupo: "Contábil",
          href: "/painel/conciliacao-estadual",
          rotulo: "Conciliação — Pagamentos de Impostos Estaduais",
          icone: "🏛️",
        },
        { grupo: "Contábil", href: "/painel/conciliacao-ecd", rotulo: "Conciliação ECD (nível 3)", icone: "🔍" },
        { grupo: "Contábil", href: "/painel/balanco", rotulo: "Balanço Comparado", icone: "📋" },
        { grupo: "Contábil", href: "/painel/balancete", rotulo: "Balancete Comparado", icone: "📊" },
        { grupo: "Contábil", href: "/painel/razao-contrapartida", rotulo: "Razão / Contrapartida", icone: "🔎" },

        {
          grupo: "Auditoria",
          href: "/painel/relatorios",
          rotulo: "Análise das Demonstrações Contábeis",
          icone: "📄",
        },
        { grupo: "Auditoria", href: "/painel/valuation", rotulo: "Valuation", icone: "📈" },

        ...(sessao.papel === "ADMIN"
          ? [
              { grupo: "Administração", href: "/painel/usuarios", rotulo: "Usuários", icone: "🔑" },
              {
                grupo: "Administração",
                href: "/painel/configuracoes",
                rotulo: "Papel timbrado",
                icone: "⚙️",
              },
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
        <div className="mx-auto w-full max-w-none px-4 py-6 lg:px-6">{children}</div>
      </main>
    </div>
  );
}
