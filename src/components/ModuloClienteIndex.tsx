import Link from "next/link";
import { requirePapel, PAPEIS_INTERNOS } from "@/lib/auth";
import { prisma } from "@/lib/db";

interface Props {
  /** Título da tela (grande, editorial). */
  titulo: string;
  /** Subtítulo curto explicando o módulo. */
  descricao: string;
  /** Eyebrow (categoria) — ex.: "Fiscal" / "Contábil". */
  categoria: string;
  /** Caminho do módulo relativo ao cliente. Ex.: "balanco-comparado". */
  caminhoModulo: string;
  /** Ícone emoji do módulo. */
  icone: string;
}

/**
 * Índice de um módulo — lista clientes do escritório e leva pra a tela
 * do módulo dentro do cliente selecionado. Padrão usado por SPED-Fiscal,
 * PIS/COFINS, IRPJ/CSLL, Conciliação ECD, Balanço, Balancete, Razão etc.
 */
export async function ModuloClienteIndex({
  titulo,
  descricao,
  categoria,
  caminhoModulo,
  icone,
}: Props) {
  const sessao = await requirePapel(PAPEIS_INTERNOS);
  const clientes = await prisma.cliente.findMany({
    where: { escritorioId: sessao.escritorioId },
    select: {
      id: true,
      razaoSocial: true,
      cnpj: true,
      regimeTributario: true,
    },
    orderBy: { razaoSocial: "asc" },
  });

  function formatarCnpj(cnpj: string): string {
    const d = cnpj.replace(/\D/g, "");
    if (d.length !== 14) return cnpj;
    return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
  }

  return (
    <div className="mx-auto max-w-6xl px-6 py-8 lg:px-10 lg:py-12">
      <div className="mb-8">
        <div className="eyebrow">
          <span>{categoria}</span>
          <span className="eyebrow-sep">§</span>
          <span>Módulo</span>
        </div>
        <h1 className="display mt-3 text-[2.6rem] lg:text-[3rem]">
          <span className="mr-3">{icone}</span>
          {titulo}
        </h1>
        <p className="mt-3 max-w-[62ch] text-[0.92rem] leading-relaxed text-[var(--ink-soft)]">
          {descricao}
        </p>
        <div className="rule-gold mt-6 w-40" />
      </div>

      <div className="mb-3 flex items-baseline justify-between">
        <h2 className="display text-xl">Selecione um cliente</h2>
        <span className="eyebrow">
          {clientes.length.toString().padStart(2, "0")} cliente(s)
        </span>
      </div>

      {clientes.length === 0 ? (
        <div className="notice">
          Nenhum cliente cadastrado. Adicione clientes em{" "}
          <Link href="/painel/clientes" className="underline decoration-[var(--brand-2)] decoration-2 underline-offset-2">
            Clientes
          </Link>
          .
        </div>
      ) : (
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {clientes.map((c) => (
            <Link
              key={c.id}
              href={`/painel/clientes/${c.id}/${caminhoModulo}`}
              className="rounded border border-[var(--rule)] bg-white p-4 transition hover:border-[var(--brand-2)] hover:shadow-sm"
            >
              <div className="font-serif text-[1rem] leading-tight text-[var(--brand-darker)]">
                {c.razaoSocial}
              </div>
              <div className="mt-1 font-mono text-[10px] text-[var(--ink-soft)]">
                {formatarCnpj(c.cnpj)}
              </div>
              {c.regimeTributario && (
                <div className="mt-1 text-[11px] text-[var(--ink-soft)]">
                  {c.regimeTributario}
                </div>
              )}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
