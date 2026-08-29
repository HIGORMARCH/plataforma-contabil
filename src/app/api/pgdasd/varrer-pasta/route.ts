import { NextResponse } from "next/server";
import { requireSessao, PAPEIS_INTERNOS } from "@/lib/auth";
import { varrerPastaSimples } from "@/lib/pgdasd/varrerPastaSimples";

/**
 * POST /api/pgdasd/varrer-pasta
 *
 * Lê os PDFs da pasta do cliente (guias DAS e comprovantes de arrecadação) e
 * grava os valores. Não custa nada — é arquivo local, não portal.
 *
 * Body: { clienteId, subpasta? }
 */
export const maxDuration = 300;

export async function POST(req: Request) {
  const sessao = await requireSessao();
  if (!PAPEIS_INTERNOS.includes(sessao.papel)) {
    return NextResponse.json({ erro: "acesso restrito" }, { status: 403 });
  }

  let body: { clienteId?: string; subpasta?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ erro: "body JSON inválido" }, { status: 400 });
  }
  if (!body.clienteId) {
    return NextResponse.json({ erro: "clienteId é obrigatório" }, { status: 400 });
  }

  try {
    const resultado = await varrerPastaSimples({
      clienteId: body.clienteId,
      subpasta: body.subpasta,
    });
    return NextResponse.json(resultado);
  } catch (e) {
    return NextResponse.json({ erro: e instanceof Error ? e.message : String(e) }, { status: 422 });
  }
}
