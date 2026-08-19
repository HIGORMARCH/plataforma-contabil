import { NextResponse } from "next/server";
import { getSessao } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { decifrar } from "@/lib/crypto";
import { loginAssistidoEconet } from "@/lib/econet-login";

/**
 * Renova a sessão da Econet abrindo o navegador pro humano resolver o CAPTCHA.
 *
 * A requisição fica aberta enquanto o login acontece — por isso o maxDuration
 * generoso. A tela mostra "aguardando o login na janela" nesse meio tempo.
 *
 * Só ADMIN: quem renova a sessão vê a credencial pré-preenchida na tela do
 * navegador.
 */
export const maxDuration = 360; // 6 min — o login espera até 5

export async function POST() {
  const sessao = await getSessao();
  if (!sessao || sessao.papel !== "ADMIN") {
    return NextResponse.json({ ok: false, erro: "Não autorizado" }, { status: 401 });
  }

  const esc = await prisma.escritorio.findUnique({
    where: { id: sessao.escritorioId },
    select: { econetUsuario: true, econetSenha: true },
  });

  // Senha só é decifrada aqui, pra ser digitada no navegador e nada mais.
  let senhaClara: string | null = null;
  if (esc?.econetSenha) {
    try {
      senhaClara = decifrar(esc.econetSenha);
    } catch {
      senhaClara = null; // cifra ilegível: o humano digita a senha na janela
    }
  }

  const r = await loginAssistidoEconet({
    escritorioId: sessao.escritorioId,
    usuario: esc?.econetUsuario ?? null,
    senha: senhaClara,
  });

  await prisma.logAcesso.create({
    data: {
      acao: r.ok ? "SESSAO_ECONET_RENOVADA" : "SESSAO_ECONET_RENOVACAO_FALHOU",
      // Nunca registrar a senha, nem parcialmente.
      detalhe: r.ok
        ? `${r.cookies} cookies capturados${r.preencheuCredencial ? "" : " (credencial não pôde ser pré-preenchida)"}`
        : (r.erro ?? "falha desconhecida"),
      usuarioId: sessao.userId,
    },
  });

  return NextResponse.json(r, { status: r.ok ? 200 : 422 });
}
