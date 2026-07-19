import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { autorizarCron, rangeMesAnterior, sincronizarTodosClientes } from "@/lib/serpro/sincronizar";

/**
 * POST /api/serpro/sync-mensal
 *   Sincroniza pagamentos e-CAC do MÊS ANTERIOR (backfill) para TODOS os clientes.
 *   Roda dia 1º de cada mês via Task Scheduler.
 */
export async function POST(req: Request) {
  if (!autorizarCron(req)) {
    return NextResponse.json({ erro: "não autorizado" }, { status: 401 });
  }

  const { inicio, fim } = rangeMesAnterior();
  const escritorios = await prisma.escritorio.findMany({ select: { id: true, razaoSocial: true } });

  const relatorios = [];
  for (const esc of escritorios) {
    const r = await sincronizarTodosClientes({
      escritorioId: esc.id,
      tipo: "MENSAL",
      inicio,
      fim,
    });
    relatorios.push({ escritorioId: esc.id, escritorio: esc.razaoSocial, ...r });
  }

  return NextResponse.json({
    ok: true,
    tipo: "MENSAL",
    periodoInicial: inicio.toISOString(),
    periodoFinal: fim.toISOString(),
    escritorios: relatorios,
  });
}
