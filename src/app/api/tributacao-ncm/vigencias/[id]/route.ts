import { NextResponse } from "next/server";
import { getSessao, PAPEIS_INTERNOS } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { z } from "zod";

const AtualizarSchema = z.object({
  dataVigencia: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  descricao: z.string().min(1).max(80).optional(),
});

async function garantirAcesso(vigenciaId: string, escritorioId: string) {
  const v = await prisma.vigenciaNcm.findUnique({
    where: { id: vigenciaId },
    include: { cliente: true },
  });
  if (!v || v.cliente.escritorioId !== escritorioId) return null;
  return v;
}

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const sessao = await getSessao();
  if (!sessao || !PAPEIS_INTERNOS.includes(sessao.papel)) {
    return NextResponse.json({ ok: false, erro: "Não autorizado" }, { status: 401 });
  }
  const { id } = await ctx.params;
  const vigencia = await garantirAcesso(id, sessao.escritorioId);
  if (!vigencia) return NextResponse.json({ ok: false, erro: "Vigência não encontrada" }, { status: 404 });

  const body = await req.json().catch(() => null);
  const parsed = AtualizarSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, erro: "Dados inválidos", detalhes: parsed.error.issues }, { status: 422 });
  }

  const data: { dataVigencia?: Date; descricao?: string } = {};
  if (parsed.data.dataVigencia) data.dataVigencia = new Date(parsed.data.dataVigencia + "T00:00:00");
  if (parsed.data.descricao) data.descricao = parsed.data.descricao;

  const atualizada = await prisma.vigenciaNcm.update({ where: { id }, data });
  return NextResponse.json({ ok: true, vigencia: atualizada });
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const sessao = await getSessao();
  if (!sessao || !PAPEIS_INTERNOS.includes(sessao.papel)) {
    return NextResponse.json({ ok: false, erro: "Não autorizado" }, { status: 401 });
  }
  const { id } = await ctx.params;
  const vigencia = await garantirAcesso(id, sessao.escritorioId);
  if (!vigencia) return NextResponse.json({ ok: false, erro: "Vigência não encontrada" }, { status: 404 });

  // ncms com onDelete: Cascade já saem juntos
  await prisma.vigenciaNcm.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
