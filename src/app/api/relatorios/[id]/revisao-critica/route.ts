import { NextResponse } from "next/server";
import { getSessao, PAPEIS_INTERNOS } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { gerarRevisaoCritica } from "@/lib/ai/revisaoCritica";
import type { ResultadoAnalise } from "@/lib/accounting/analyze";

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const sessao = await getSessao();
  if (!sessao || !PAPEIS_INTERNOS.includes(sessao.papel)) {
    return NextResponse.json({ erro: "Não autorizado" }, { status: 401 });
  }
  const { id } = await ctx.params;

  const r = await prisma.relatorio.findFirst({
    where: { id, cliente: { escritorioId: sessao.escritorioId } },
  });
  if (!r) return NextResponse.json({ erro: "Relatório não encontrado" }, { status: 404 });

  const body = (await req.json().catch(() => ({}))) as { conclusao?: string[]; comentario?: string };
  const conteudo = JSON.parse(r.conteudoJson) as { analise: ResultadoAnalise; texto: { conclusao: string[] } };

  // Usa o rascunho enviado pelo contador; se vazio, a conclusão já salva.
  const conclusao =
    Array.isArray(body.conclusao) && body.conclusao.some((l) => l.trim())
      ? body.conclusao.filter((l) => l.trim())
      : conteudo.texto.conclusao;

  const revisao = await gerarRevisaoCritica(conteudo.analise, conclusao, body.comentario);
  return NextResponse.json(revisao);
}
