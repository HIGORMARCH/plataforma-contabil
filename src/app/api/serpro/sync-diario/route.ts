import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { autorizarCron, rangeDiaAnterior, sincronizarTodosClientes } from "@/lib/serpro/sincronizar";

/**
 * POST /api/serpro/sync-diario
 *   Sincroniza pagamentos e-CAC do DIA ANTERIOR para TODOS os clientes com
 *   metodoAcessoEcac=PROCURACAO_MARCH de TODOS os escritórios.
 *
 *   Header: x-cron-token: <SERPRO_CRON_TOKEN>
 *   Chamado pelo Windows Task Scheduler diariamente às 22h (retentativas por hora
 *   até 23:59 caso falhe; a segunda chamada pula por idempotência se a primeira
 *   deu certo).
 */
export async function POST(req: Request) {
  if (!autorizarCron(req)) {
    return NextResponse.json({ erro: "não autorizado" }, { status: 401 });
  }

  const { inicio, fim } = rangeDiaAnterior();
  const escritorios = await prisma.escritorio.findMany({ select: { id: true, razaoSocial: true } });

  const relatorios = [];
  for (const esc of escritorios) {
    const r = await sincronizarTodosClientes({
      escritorioId: esc.id,
      tipo: "DIARIO",
      inicio,
      fim,
    });
    relatorios.push({ escritorioId: esc.id, escritorio: esc.razaoSocial, ...r });
  }

  return NextResponse.json({
    ok: true,
    tipo: "DIARIO",
    periodoInicial: inicio.toISOString(),
    periodoFinal: fim.toISOString(),
    escritorios: relatorios,
  });
}
