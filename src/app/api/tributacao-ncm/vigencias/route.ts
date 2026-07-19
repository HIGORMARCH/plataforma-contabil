import { NextResponse } from "next/server";
import { getSessao, PAPEIS_INTERNOS } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { z } from "zod";

const CriarVigenciaSchema = z.object({
  clienteId: z.string().min(1),
  dataVigencia: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  descricao: z.string().min(1).max(80).default("TRIBUTAÇÃO"),
});

export async function POST(req: Request) {
  const sessao = await getSessao();
  if (!sessao || !PAPEIS_INTERNOS.includes(sessao.papel)) {
    return NextResponse.json({ ok: false, erro: "Não autorizado" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const parsed = CriarVigenciaSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, erro: "Dados inválidos", detalhes: parsed.error.issues }, { status: 422 });
  }

  // Confere que o cliente é do escritório do usuário
  const cliente = await prisma.cliente.findUnique({
    where: { id: parsed.data.clienteId, escritorioId: sessao.escritorioId },
    select: { id: true },
  });
  if (!cliente) {
    return NextResponse.json({ ok: false, erro: "Cliente não encontrado" }, { status: 404 });
  }

  const vigencia = await prisma.vigenciaNcm.create({
    data: {
      clienteId: cliente.id,
      dataVigencia: new Date(parsed.data.dataVigencia + "T00:00:00"),
      descricao: parsed.data.descricao,
    },
  });

  return NextResponse.json({ ok: true, vigencia }, { status: 201 });
}
