import { NextResponse } from "next/server";
import { requireSessao, PAPEIS_INTERNOS } from "@/lib/auth";
import { varrerPastaGiam } from "@/lib/giam/varrerPastaGiam";

/**
 * POST /api/giam/varrer
 *   Varre a pasta GIAM do cliente (ou pastaFiscal como fallback) atrás de
 *   arquivos GIAM 10.0. Filtra por IE dentro do arquivo (não por nome).
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
    const relatorio = await varrerPastaGiam({
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
