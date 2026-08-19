import { NextResponse } from "next/server";
import { getSessao, PAPEIS_INTERNOS } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { lerCstEntrada, lerCstSaida } from "@/lib/tributacao-ncm/cst";

/**
 * Consulta rápida de um NCM na base da plataforma.
 *
 * Responde a pergunta do dia a dia — "este NCM, como é tributado e me credito?"
 * — sem precisar abrir cliente, vigência ou planilha.
 *
 * Lê SÓ a base local. Não vai à Econet: consulta externa é ato deliberado,
 * dentro de uma vigência, não efeito colateral de digitar um número.
 */
export async function GET(req: Request) {
  const sessao = await getSessao();
  if (!sessao || !PAPEIS_INTERNOS.includes(sessao.papel)) {
    return NextResponse.json({ ok: false, erro: "Não autorizado" }, { status: 401 });
  }

  const url = new URL(req.url);
  const ncm = (url.searchParams.get("ncm") ?? "").replace(/\D/g, "");
  if (ncm.length !== 8) {
    return NextResponse.json(
      { ok: false, erro: "Informe um NCM com 8 dígitos." },
      { status: 422 },
    );
  }

  const registro = await prisma.ncmBase.findUnique({
    where: { ncm },
    include: { configuracao: true },
  });

  if (!registro) {
    // Pode estar na tabela de algum cliente sem classificação ainda — é útil
    // dizer isso, em vez de só "não encontrado".
    const emCliente = await prisma.ncmVigencia.findFirst({
      where: { ncm, vigencia: { cliente: { escritorioId: sessao.escritorioId } } },
      select: { vigencia: { select: { cliente: { select: { razaoSocial: true } } } } },
    });

    return NextResponse.json({
      ok: false,
      ncm,
      naBase: false,
      erro: emCliente
        ? `Ainda não classificado. Aparece na tabela de ${emCliente.vigencia.cliente.razaoSocial} e precisa de consulta à Econet.`
        : "Não está na base da plataforma. Consulte na Econet dentro de uma vigência para acrescentá-lo.",
    });
  }

  const c = registro.configuracao;

  return NextResponse.json({
    ok: true,
    ncm,
    naBase: true,
    regime: c.tipo,
    codigo: c.codigo,
    descricao: c.descricao,
    cstEntrada: c.cstEntrada,
    cstSaida: c.cstSaida,
    natureza: c.natureza,
    entrada: lerCstEntrada(c.cstEntrada),
    saida: lerCstSaida(c.cstSaida),
    origem: registro.origem,
    atividadeContexto: registro.atividadeContexto,
    atualizadoEm: registro.atualizadoEm,
  });
}
