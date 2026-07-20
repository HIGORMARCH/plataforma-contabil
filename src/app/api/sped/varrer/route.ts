import { NextResponse } from "next/server";
import { requireSessao, PAPEIS_INTERNOS } from "@/lib/auth";
import { varrerPastaSped } from "@/lib/sped/varrerPasta";

/**
 * POST /api/sped/varrer
 *   Varre a pasta fiscal configurada do cliente atrás de arquivos SPED-Fiscal
 *   ainda não importados (dedup por SHA-256) e importa os novos.
 *
 *   Body JSON: { clienteId: string }
 */
export async function POST(req: Request) {
  const sessao = await requireSessao();
  if (!PAPEIS_INTERNOS.includes(sessao.papel)) {
    return NextResponse.json({ erro: "acesso restrito a papéis internos" }, { status: 403 });
  }

  let body: { clienteId?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ erro: "body JSON inválido" }, { status: 400 });
  }

  if (!body.clienteId) {
    return NextResponse.json({ erro: "clienteId obrigatório" }, { status: 400 });
  }

  try {
    const relatorio = await varrerPastaSped({
      clienteId: body.clienteId,
      importadoPor: sessao.userId,
    });
    return NextResponse.json(relatorio);
  } catch (e) {
    return NextResponse.json(
      { erro: e instanceof Error ? e.message : String(e) },
      { status: 422 },
    );
  }
}
