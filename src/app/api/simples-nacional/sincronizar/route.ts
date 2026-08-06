import { NextResponse } from "next/server";
import { requireSessao, PAPEIS_INTERNOS } from "@/lib/auth";
import { sincronizarSimplesNacional } from "@/lib/simples-nacional/sincronizar";

/**
 * POST /api/simples-nacional/sincronizar
 *
 * Dispara o robô do Portal do Simples Nacional pra puxar PGDAS-D e DEFIS
 * transmitidas do cliente no range solicitado. Usa o certificado digital
 * cadastrado no cliente.
 *
 * Body: { clienteId, anoInicial, anoFinal, tipos?: ["PGDAS_D","DEFIS"] }
 */
export const maxDuration = 300; // Playwright leva tempo — allow 5min

export async function POST(req: Request) {
  const sessao = await requireSessao();
  if (!PAPEIS_INTERNOS.includes(sessao.papel)) {
    return NextResponse.json({ erro: "acesso restrito" }, { status: 403 });
  }

  let body: {
    clienteId?: string;
    anoInicial?: number;
    anoFinal?: number;
    tipos?: Array<"PGDAS_D" | "DEFIS">;
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

  try {
    const resultado = await sincronizarSimplesNacional({
      clienteId: body.clienteId,
      anoInicial: body.anoInicial,
      anoFinal: body.anoFinal,
      tipos: body.tipos,
      executadoPor: sessao.userId,
    });
    return NextResponse.json(resultado);
  } catch (e) {
    return NextResponse.json(
      { erro: e instanceof Error ? e.message : String(e) },
      { status: 422 },
    );
  }
}
