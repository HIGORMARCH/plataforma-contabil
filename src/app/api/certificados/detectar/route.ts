import { NextResponse } from "next/server";
import { getSessao, PAPEIS_INTERNOS } from "@/lib/auth";
import { acharCertificadoPorNome } from "@/lib/certificados/scanner";

/**
 * GET /api/certificados/detectar?pasta=Z:\...\PJ&razaoSocial=NOME
 *
 * Responde com { ok: true, cert: { caminhoCompleto, senha, validade } } quando acha.
 * A senha vem em PLAINTEXT — o formulario cifra ao salvar (não a persistimos aqui).
 */
export async function GET(req: Request) {
  const sessao = await getSessao();
  if (!sessao || !PAPEIS_INTERNOS.includes(sessao.papel)) {
    return NextResponse.json({ ok: false, erro: "Não autorizado" }, { status: 401 });
  }
  const url = new URL(req.url);
  const pasta = url.searchParams.get("pasta") ?? "";
  const razaoSocial = url.searchParams.get("razaoSocial") ?? "";
  if (!pasta || !razaoSocial) {
    return NextResponse.json(
      { ok: false, erro: "Parâmetros obrigatórios: pasta, razaoSocial" },
      { status: 400 },
    );
  }
  try {
    const cert = await acharCertificadoPorNome(pasta, razaoSocial);
    if (!cert) {
      return NextResponse.json({ ok: false, erro: "Nenhum .pfx corresponde ao nome" }, { status: 404 });
    }
    return NextResponse.json({
      ok: true,
      cert: {
        caminhoCompleto: cert.caminhoCompleto,
        senha: cert.senha ?? null,
        validade: cert.validade ?? null,
        razaoSocialInferida: cert.razaoSocialInferida,
      },
    });
  } catch (e) {
    return NextResponse.json({ ok: false, erro: (e as Error).message }, { status: 500 });
  }
}
