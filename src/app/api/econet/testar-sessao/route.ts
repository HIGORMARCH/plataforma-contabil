import { NextResponse } from "next/server";
import { getSessao, PAPEIS_INTERNOS } from "@/lib/auth";
import { testarSessaoEconet } from "@/lib/econet-teste";

/**
 * Testa a sessão da Econet com o NCM canário (xampu → monofásico).
 *
 * Leitura pura: não grava nada, não classifica NCM nenhum na base. Serve pra
 * responder uma pergunta só — "dá pra confiar numa consulta em lote agora?".
 */
export const maxDuration = 60;

export async function POST() {
  const sessao = await getSessao();
  if (!sessao || !PAPEIS_INTERNOS.includes(sessao.papel)) {
    return NextResponse.json({ ok: false, erro: "Não autorizado" }, { status: 401 });
  }

  const r = await testarSessaoEconet(sessao.escritorioId);
  return NextResponse.json(r);
}
