import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { registrarAcesso } from "@/lib/rastreio";
import { gerarRelatorioPdf } from "@/lib/pdf/relatorioPdf";
import { montarDadosPdf } from "@/lib/pdf/dados";

export async function GET(_req: Request, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  const r = await prisma.relatorio.findUnique({ where: { shareToken: token } });
  if (!r || r.status !== "LIBERADO") return new NextResponse("Documento indisponível", { status: 404 });

  await registrarAcesso(r.id, "DOWNLOAD");

  const dados = await montarDadosPdf(r.id);
  if (!dados) return new NextResponse("Documento indisponível", { status: 404 });
  const buffer = await gerarRelatorioPdf(dados);

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `inline; filename="relatorio.pdf"`,
    },
  });
}
