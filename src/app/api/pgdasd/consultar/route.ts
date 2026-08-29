import { NextResponse } from "next/server";
import { requireSessao, PAPEIS_INTERNOS } from "@/lib/auth";
import { consultarPgdasdNoSerpro } from "@/lib/pgdasd/sincronizar";

/**
 * POST /api/pgdasd/consultar
 *
 * Consulta as declarações PGDAS-D do cliente no SERPRO Integra Contador
 * (CONSULTIMADECREC14) pro intervalo pedido, lê o PDF em memória e grava os
 * valores.
 *
 * CADA COMPETÊNCIA É UMA CHAMADA PAGA — só roda por acionamento explícito do
 * botão (regra: consulta externa só sob solicitação). O intervalo ainda é
 * recortado pelo período de atendimento do cliente antes de sair consultando.
 *
 * Body: { clienteId, anoInicial, anoFinal, mesInicial?, mesFinal? }
 */
export const maxDuration = 300;

export async function POST(req: Request) {
  const sessao = await requireSessao();
  if (!PAPEIS_INTERNOS.includes(sessao.papel)) {
    return NextResponse.json({ erro: "acesso restrito" }, { status: 403 });
  }

  let body: {
    clienteId?: string;
    anoInicial?: number;
    anoFinal?: number;
    mesInicial?: number;
    mesFinal?: number;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ erro: "body JSON inválido" }, { status: 400 });
  }

  if (!body.clienteId || !body.anoInicial || !body.anoFinal) {
    return NextResponse.json(
      { erro: "clienteId, anoInicial e anoFinal são obrigatórios" },
      { status: 400 },
    );
  }
  if (body.anoFinal < body.anoInicial) {
    return NextResponse.json({ erro: "ano final anterior ao inicial" }, { status: 400 });
  }

  try {
    const resultado = await consultarPgdasdNoSerpro({
      clienteId: body.clienteId,
      anoInicial: body.anoInicial,
      anoFinal: body.anoFinal,
      mesInicial: body.mesInicial,
      mesFinal: body.mesFinal,
      usuarioId: sessao.userId,
    });
    return NextResponse.json(resultado);
  } catch (e) {
    return NextResponse.json({ erro: e instanceof Error ? e.message : String(e) }, { status: 422 });
  }
}
