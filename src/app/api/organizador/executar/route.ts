import { NextResponse } from "next/server";
import { requireSessao, PAPEIS_INTERNOS } from "@/lib/auth";
import { organizarDocumentos } from "@/lib/organizador/executar";

/**
 * POST /api/organizador/executar
 *
 * Roda o robô nos endereços cadastrados.
 *
 * `simular` é TRUE por padrão, e é intencional: este robô move e renomeia
 * arquivo. Quem chama tem que dizer explicitamente `simular: false` pra ele
 * encostar em alguma coisa.
 *
 * Body: { simular?: boolean, origemId?: string }
 */
export const maxDuration = 300;

export async function POST(req: Request) {
  const sessao = await requireSessao();
  if (!PAPEIS_INTERNOS.includes(sessao.papel)) {
    return NextResponse.json({ erro: "acesso restrito" }, { status: 403 });
  }

  let body: { simular?: boolean; origemId?: string } = {};
  try {
    body = await req.json();
  } catch {
    /* corpo vazio = simulação de tudo */
  }

  try {
    const relatorio = await organizarDocumentos({
      escritorioId: sessao.escritorioId,
      simular: body.simular !== false,
      origemId: body.origemId,
    });
    return NextResponse.json(relatorio);
  } catch (e) {
    return NextResponse.json({ erro: e instanceof Error ? e.message : String(e) }, { status: 422 });
  }
}
