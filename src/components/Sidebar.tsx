"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

export interface ItemMenu {
  href: string;
  rotulo: string;
  icone: string;
  /** Título da seção que agrupa o item. Itens sem grupo aparecem soltos no topo. */
  grupo?: string;
}

/**
 * Topbar horizontal estilo Sistema Domínio. Categorias como itens do menu
 * ao topo (Cadastros, Fiscal, Contábil, Auditoria, Administração); passar
 * mouse abre dropdown com os módulos daquela categoria. Libera toda a
 * largura da viewport pra tabela abaixo.
 *
 * Mantém o nome do arquivo "Sidebar" pra evitar refactor de imports.
 */
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
  const [aberto, setAberto] = useState<string | null>(null);

  // Item avulso (Painel) — sem grupo, vira link direto
  const itensAvulsos = itens.filter((it) => !it.grupo);
  // Agrupa por categoria mantendo a ordem
  const grupos: { titulo: string; itens: ItemMenu[] }[] = [];
  for (const it of itens) {
    if (!it.grupo) continue;
    const ultimo = grupos[grupos.length - 1];
    if (ultimo && ultimo.titulo === it.grupo) ultimo.itens.push(it);
    else grupos.push({ titulo: it.grupo, itens: [it] });
  }

  return (
    <header className="topbar sticky top-0 z-40 flex h-12 items-center gap-1 bg-[var(--brand)] px-3 text-white shadow-md">
      {/* Logo */}
      <Link href="/painel" className="flex items-center gap-2 pr-4">
        <div className="flex h-7 w-7 items-center justify-center rounded bg-white/15 text-sm font-bold">
          ◇
        </div>
        <div className="hidden leading-tight md:block">
          <p className="text-[13px] font-bold">{escritorio}</p>
          <p className="text-[10px] text-white/60">Plataforma Contábil</p>
        </div>
      </Link>

      {/* Divisor */}
      <div className="h-6 w-px bg-white/10" />

      {/* Menu horizontal */}
      <nav className="flex flex-1 items-center gap-0.5">
        {itensAvulsos.map((it) => {
          const ativo = path === it.href || (it.href !== "/painel" && path.startsWith(it.href));
          return (
            <Link
              key={it.href}
              href={it.href}
              className={`flex items-center gap-1.5 rounded px-3 py-1.5 text-[13px] font-medium transition-colors ${
                ativo ? "bg-white/15" : "hover:bg-white/10"
              }`}
            >
              <span aria-hidden>{it.icone}</span>
              <span>{it.rotulo}</span>
            </Link>
          );
        })}

        {grupos.map((g) => {
          const algumAtivo = g.itens.some(
            (it) => path === it.href || (it.href !== "/painel" && path.startsWith(it.href)),
          );
          const isOpen = aberto === g.titulo;
          return (
            <div
              key={g.titulo}
              className="relative"
              onMouseEnter={() => setAberto(g.titulo)}
              onMouseLeave={() => setAberto((cur) => (cur === g.titulo ? null : cur))}
            >
              <button
                type="button"
                className={`flex items-center gap-1 rounded px-3 py-1.5 text-[13px] font-medium transition-colors ${
                  algumAtivo || isOpen ? "bg-white/15" : "hover:bg-white/10"
                }`}
                onClick={() => setAberto((cur) => (cur === g.titulo ? null : g.titulo))}
              >
                <span>{g.titulo}</span>
                <span aria-hidden className="text-[9px] opacity-70">▾</span>
              </button>
              {isOpen && (
                <div className="absolute left-0 top-full mt-1 min-w-[280px] rounded-md border border-black/10 bg-white text-[var(--ink)] shadow-xl">
                  <ul className="py-1">
                    {g.itens.map((it) => {
                      const ativo =
                        path === it.href || (it.href !== "/painel" && path.startsWith(it.href));
                      return (
                        <li key={it.href}>
                          <Link
                            href={it.href}
                            onClick={() => setAberto(null)}
                            className={`flex items-start gap-2.5 px-3 py-2 text-[13px] leading-snug ${
                              ativo
                                ? "bg-[var(--brand-2-soft)] text-[var(--brand-darker)]"
                                : "hover:bg-[var(--paper)]"
                            }`}
                          >
                            <span aria-hidden className="w-5 shrink-0 text-center text-base">
                              {it.icone}
                            </span>
                            <span>{it.rotulo}</span>
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}
            </div>
          );
        })}
      </nav>

      {/* Direita: usuário + sair */}
      <div className="flex items-center gap-3 pl-3">
        <div className="hidden text-right leading-tight lg:block">
          <p className="text-[12px] font-semibold">{nome}</p>
          <p className="text-[10px] text-white/60">{papelRotulo}</p>
        </div>
        <form action="/api/logout" method="post">
          <button
            className="rounded bg-white/10 px-2.5 py-1.5 text-[11px] font-medium text-white/90 hover:bg-white/20"
            title="Sair"
          >
            Sair
          </button>
        </form>
      </div>
    </header>
  );
}
