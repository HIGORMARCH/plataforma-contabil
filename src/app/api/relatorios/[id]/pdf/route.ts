import { NextResponse } from "next/server";
import { getSessao, PAPEIS_INTERNOS } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { gerarRelatorioPdf } from "@/lib/pdf/relatorioPdf";
import { montarDadosPdf } from "@/lib/pdf/dados";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const sessao = await getSessao();
  if (!sessao) return new NextResponse("Não autenticado", { status: 401 });
  const { id } = await ctx.params;

  const r = await prisma.relatorio.findFirst({
    where: { id, cliente: { escritorioId: sessao.escritorioId } },
    include: { cliente: true },
  });
  if (!r) return new NextResponse("Relatório não encontrado", { status: 404 });

  const interno = PAPEIS_INTERNOS.includes(sessao.papel);
  if (!interno && (sessao.clienteId !== r.clienteId || r.status !== "LIBERADO")) {
    return new NextResponse("Acesso negado", { status: 403 });
  }

  const dados = await montarDadosPdf(r.id);
  if (!dados) return new NextResponse("Dados indisponíveis", { status: 404 });

  const buffer = await gerarRelatorioPdf(dados);
  const nomeArquivo = `relatorio-${r.cliente.razaoSocial.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}-${r.periodo}.pdf`;

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `inline; filename="${nomeArquivo}"`,
    },
  });
}
