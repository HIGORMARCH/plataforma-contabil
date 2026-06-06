import { NextResponse } from "next/server";
import { getSessao, PAPEIS_INTERNOS } from "@/lib/auth";
import { consultarCNPJ } from "@/lib/cnpj";

export async function GET(req: Request) {
  const sessao = await getSessao();
  if (!sessao || !PAPEIS_INTERNOS.includes(sessao.papel)) {
    return NextResponse.json({ ok: false, erro: "Não autorizado" }, { status: 401 });
  }
  const cnpj = new URL(req.url).searchParams.get("cnpj") ?? "";
  const resultado = await consultarCNPJ(cnpj);
  return NextResponse.json(resultado, { status: resultado.ok ? 200 : 422 });
}
