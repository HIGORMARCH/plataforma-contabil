import { requireSessao, PAPEIS_INTERNOS } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { TimbreEscritorio, formatarCnpj } from "@/components/print/PrintHeaderMarch";
import { moduloPorId } from "@/lib/relatorios/catalogo";
import { BotaoImprimirDossie } from "./_BotaoImprimirDossie";
import { SecaoNcm } from "./_SecaoNcm";

/**
 * Documento consolidado: capa + sumário + uma seção por módulo escolhido.
 *
 * Cada seção é um componente próprio que busca os seus dados. Módulo novo =
 * marcar `integradoAoDossie` no catálogo e acrescentar o componente da seção
 * no `switch` abaixo.
 */
export default async function DocumentoDossiePage({
  searchParams,
}: {
  searchParams: Promise<{ cliente?: string; modulos?: string }>;
}) {
  const sessao = await requireSessao();
  if (!PAPEIS_INTERNOS.includes(sessao.papel)) redirect("/painel");

  const { cliente: clienteId, modulos } = await searchParams;
  if (!clienteId) notFound();

  const cliente = await prisma.cliente.findUnique({
    where: { id: clienteId },
    select: { id: true, razaoSocial: true, cnpj: true, escritorioId: true },
  });
  if (!cliente || cliente.escritorioId !== sessao.escritorioId) notFound();

  const escritorio = await prisma.escritorio.findUnique({
    where: { id: sessao.escritorioId },
    select: {
      razaoSocial: true,
      nomeFantasia: true,
      cnpj: true,
      crc: true,
      endereco: true,
      telefone: true,
      email: true,
      site: true,
      logoDataUrl: true,
      rodapePadrao: true,
    },
  });

  const ids = (modulos ?? "").split(",").filter(Boolean);
  const escolhidos = ids.map((id) => moduloPorId(id)).filter((m) => m && m.integradoAoDossie);

  const emitidoEm = new Date();

  return (
    <div>
      <div className="mb-4 flex items-center justify-between no-print">
        <Link href="/painel/dossie" className="text-sm text-[var(--brand)] hover:underline">
          ← Escolher outros relatórios
        </Link>
        <BotaoImprimirDossie />
      </div>

      {/* ---- CAPA ---- */}
      <div className="card mb-6 p-6">
        <TimbreEscritorio escritorio={escritorio} />
        <div className="mt-4 border-t border-slate-200 pt-4">
          <h1 className="text-xl font-bold text-slate-800">Dossiê de Auditoria Contábil-Fiscal</h1>
          <p className="mt-1 text-sm text-slate-600">
            {cliente.razaoSocial} · CNPJ {formatarCnpj(cliente.cnpj)}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            Emitido em {emitidoEm.toLocaleDateString("pt-BR")} às{" "}
            {emitidoEm.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
          </p>

          {escolhidos.length > 0 && (
            <div className="mt-4">
              <h2 className="mb-1 text-xs font-bold uppercase tracking-wide text-slate-500">
                Conteúdo
              </h2>
              <ol className="list-decimal pl-5 text-sm text-slate-700">
                {escolhidos.map((m) => (
                  <li key={m!.id}>
                    {m!.rotulo}
                    <span className="block text-xs text-slate-500">{m!.descricao}</span>
                  </li>
                ))}
              </ol>
            </div>
          )}
        </div>
      </div>

      {escolhidos.length === 0 ? (
        <div className="card p-5 text-sm text-slate-600">
          Nenhum relatório selecionado.{" "}
          <Link href="/painel/dossie" className="text-[var(--brand)] underline">
            Voltar e escolher
          </Link>
          .
        </div>
      ) : (
        escolhidos.map((m) => {
          switch (m!.id) {
            case "tributacao-ncm":
              return <SecaoNcm key={m!.id} clienteId={cliente.id} />;
            default:
              // Não deveria acontecer: o catálogo filtra por integradoAoDossie.
              // Se acontecer, é melhor dizer do que sair uma seção em branco.
              return (
                <div
                  key={m!.id}
                  className="card mb-6 border-l-4 border-amber-400 p-4 text-sm text-amber-900"
                >
                  {m!.rotulo}: seção ainda não implementada no dossiê.
                </div>
              );
          }
        })
      )}

      {escritorio?.rodapePadrao && (
        <p className="mt-6 text-center text-xs text-slate-500">{escritorio.rodapePadrao}</p>
      )}
    </div>
  );
}
