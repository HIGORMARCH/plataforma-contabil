"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export interface ItemMenu {
  href: string;
  rotulo: string;
  icone: string;
}

export function Sidebar({
  itens,
  nome,
  papelRotulo,
  escritorio,
}: {
  itens: ItemMenu[];
  nome: string;
  papelRotulo: string;
  escritorio: string;
}) {
  const path = usePathname();
  return (
    <aside className="flex w-64 shrink-0 flex-col bg-[var(--brand)] text-white">
      <div className="flex items-center gap-2 px-5 py-5">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/15 text-lg font-bold">
          ◇
        </div>
        <div className="leading-tight">
          <p className="text-sm font-bold">{escritorio}</p>
          <p className="text-[11px] text-white/60">Plataforma Contábil</p>
        </div>
      </div>

      <nav className="flex-1 space-y-1 px-3 py-2">
        {itens.map((it) => {
          const ativo = path === it.href || (it.href !== "/painel" && path.startsWith(it.href));
          return (
            <Link
              key={it.href}
              href={it.href}
              className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                ativo ? "bg-white/15 text-white" : "text-white/75 hover:bg-white/10"
              }`}
            >
              <span className="w-5 text-center">{it.icone}</span>
              {it.rotulo}
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-white/10 px-4 py-4">
        <p className="text-sm font-semibold">{nome}</p>
        <p className="text-[11px] text-white/60">{papelRotulo}</p>
        <form action="/api/logout" method="post" className="mt-3">
          <button className="w-full rounded-lg bg-white/10 px-3 py-1.5 text-xs font-medium text-white/90 hover:bg-white/20">
            Sair
          </button>
        </form>
      </div>
    </aside>
  );
}
