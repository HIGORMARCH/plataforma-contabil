import { NextResponse } from "next/server";
import { requireSessao, PAPEIS_INTERNOS } from "@/lib/auth";
import { varrerObrigacoesAcessorias } from "@/lib/obrigacoes-acessorias/varredura";

/**
 * POST /api/obrigacoes-acessorias/varrer
 *
 * Varre a pastaFiscal do cliente e cataloga (upsert) a presença de arquivos
 * ECD, ECF, EFD-Contribuições e DCTF antiga em ArquivoObrigacaoDetectado.
 * Não importa apuração — só catalogação de presença + mtime.
 *
 * Body: { clienteId: string }
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
    const relatorio = await varrerObrigacoesAcessorias({ clienteId: body.clienteId });
    return NextResponse.json(relatorio);
  } catch (e) {
    return NextResponse.json(
      { erro: e instanceof Error ? e.message : String(e) },
      { status: 422 },
    );
  }
}
