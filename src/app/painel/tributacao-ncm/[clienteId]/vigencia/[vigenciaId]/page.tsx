import Link from "next/link";
import { requireSessao, PAPEIS_INTERNOS } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { redirect, notFound } from "next/navigation";
import { EditorVigencia } from "./_EditorVigencia";

export default async function VigenciaPage(
  props: { params: Promise<{ clienteId: string; vigenciaId: string }> }
) {
  const { clienteId, vigenciaId } = await props.params;
  const sessao = await requireSessao();
  if (!PAPEIS_INTERNOS.includes(sessao.papel)) redirect("/painel");

  const vigencia = await prisma.vigenciaNcm.findUnique({
    where: { id: vigenciaId },
    include: {
      cliente: true,
      ncms: {
        include: { configuracao: true },
        orderBy: [{ configuracao: { codigo: "asc" } }, { ncm: "asc" }],
      },
    },
  });
  if (!vigencia || vigencia.clienteId !== clienteId || vigencia.cliente.escritorioId !== sessao.escritorioId) {
    notFound();
  }

  return (
    <div>
      <div className="mb-4 text-sm">
        <Link href="/painel/tributacao-ncm" className="text-[var(--brand)] hover:underline">
          Tributação NCM
        </Link>
        {" · "}
        <Link href={`/painel/tributacao-ncm/${clienteId}`} className="text-[var(--brand)] hover:underline">
          {vigencia.cliente.razaoSocial}
        </Link>
      </div>

      <header className="mb-6">
        <h1 className="text-2xl font-bold text-slate-800">
          Vigência {vigencia.dataVigencia.toLocaleDateString("pt-BR")}
        </h1>
        <p className="text-sm text-slate-500">
          {vigencia.descricao} · Status: {vigencia.status} · {vigencia.ncms.length} NCMs
        </p>
      </header>

      <EditorVigencia
        vigenciaId={vigencia.id}
        clienteId={clienteId}
        ncmsIniciais={vigencia.ncms.map((n) => ({
          id: n.id,
          ncm: n.ncm,
          origem: n.origem,
          codigoConfig: n.configuracao.codigo,
          descricaoConfig: n.configuracao.descricao,
          cstEntrada: n.configuracao.cstEntrada,
          cstSaida: n.configuracao.cstSaida,
          natureza: n.configuracao.natureza,
          tipo: n.configuracao.tipo,
        }))}
      />
    </div>
  );
}
