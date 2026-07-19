import { NextResponse } from "next/server";
import { requireSessao, PAPEIS_INTERNOS } from "@/lib/auth";
import { sincronizarCliente, type TipoSincronizacao } from "@/lib/serpro/sincronizar";

/**
 * POST /api/serpro/sync-manual
 *   Sync manual acionada pelo botão "Sincronizar e-CAC" na UI.
 *   Autenticada por sessão (usuário interno).
 *
 *   Body:
 *     clienteId: string
 *     dataInicial: string (ISO ou "AAAA-MM-DD")
 *     dataFinal:   string
 *     forcar?: boolean (default true — override idempotência)
 */
export async function POST(req: Request) {
  const sessao = await requireSessao();
  if (!PAPEIS_INTERNOS.includes(sessao.papel)) {
    return NextResponse.json({ erro: "acesso restrito a papéis internos" }, { status: 403 });
  }

  let body: { clienteId?: string; dataInicial?: string; dataFinal?: string; forcar?: boolean };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ erro: "body JSON inválido" }, { status: 400 });
  }

  if (!body.clienteId || !body.dataInicial || !body.dataFinal) {
    return NextResponse.json(
      { erro: "campos obrigatórios: clienteId, dataInicial, dataFinal" },
      { status: 400 },
    );
  }

  const inicio = new Date(body.dataInicial);
  const fim = new Date(body.dataFinal);
  if (isNaN(inicio.getTime()) || isNaN(fim.getTime())) {
    return NextResponse.json({ erro: "datas inválidas" }, { status: 400 });
  }

  const tipo: TipoSincronizacao = "MANUAL";
  const resultado = await sincronizarCliente({
    clienteId: body.clienteId,
    tipo,
    inicio,
    fim,
    forcar: body.forcar ?? true,
  });

  return NextResponse.json(resultado);
}
