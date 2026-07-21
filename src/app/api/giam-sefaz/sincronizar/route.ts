import { NextResponse } from "next/server";
import { requireSessao, PAPEIS_INTERNOS } from "@/lib/auth";
import { sincronizarGiamSefaz } from "@/lib/giam/importarGiamSefaz";

/**
 * POST /api/giam-sefaz/sincronizar
 *
 * Body: { clienteId: string, ano: number, meses?: number[], headless?: boolean }
 *
 * Dispara o robô que raspa o portal SEFAZ (giam.sefaz.to.gov.br) e grava as
 * apurações recepcionadas na tabela GiamSefazApuracao. Só quem tem papel
 * interno pode chamar. A senha do portal é decifrada dentro do processo e
 * nunca sai pra tela nem log.
 *
 * Timeout: ~60s por competência (2 logins + navegação + download PDF).
 * Se solicitar ano inteiro, pode passar de 10min — chamador deve tratar.
 */
export const runtime = "nodejs";
export const maxDuration = 600; // 10 minutos

export async function POST(req: Request) {
  const sessao = await requireSessao();
  if (!PAPEIS_INTERNOS.includes(sessao.papel)) {
    return NextResponse.json({ erro: "Sem permissão." }, { status: 403 });
  }

  let body: {
    clienteId?: string;
    ano?: number;
    meses?: number[];
    headless?: boolean;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ erro: "Body inválido — envie JSON." }, { status: 400 });
  }

  const { clienteId, ano, meses, headless = true } = body;
  if (!clienteId) return NextResponse.json({ erro: "clienteId é obrigatório." }, { status: 400 });
  if (!ano || !Number.isInteger(ano) || ano < 2009 || ano > 2100) {
    return NextResponse.json({ erro: "ano inválido (2009-2100)." }, { status: 400 });
  }
  if (meses && !meses.every((m) => Number.isInteger(m) && m >= 1 && m <= 12)) {
    return NextResponse.json({ erro: "meses inválidos (1-12)." }, { status: 400 });
  }

  try {
    const resumo = await sincronizarGiamSefaz({
      clienteId,
      ano,
      meses,
      executadoPor: sessao.userId,
      headless,
    });
    return NextResponse.json(resumo);
  } catch (e) {
    return NextResponse.json(
      { erro: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}
