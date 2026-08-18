import { NextResponse } from "next/server";
import { getSessao, PAPEIS_INTERNOS } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { parseTabelaLegada } from "@/lib/tributacao-ncm/parseTabelaLegada";

/**
 * Importa a tabela de tributação que o cliente JÁ TEM no Domínio.
 *
 * Sem isso, o módulo montava a vigência do zero pela nossa base + Econet — e
 * atropelava a classificação que o cliente já usa. Aqui a tabela dele entra
 * como ponto de partida e fica INTOCÁVEL: os NCMs seguintes (estoque,
 * inconsistências) só ACRESCENTAM, nunca sobrescrevem.
 *
 * As linhas legadas não apontam pra `ConfiguracaoNcm`: o arquivo do cliente traz
 * só código, descrição e NCM — sem CST nem natureza —, então não há como saber a
 * qual configuração nossa cada código dele equivale. Elas guardam o código e a
 * descrição DELE em `codigoCliente` / `descricaoCliente`.
 *
 * Body: multipart com `arquivo`.
 */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const sessao = await getSessao();
  if (!sessao || !PAPEIS_INTERNOS.includes(sessao.papel)) {
    return NextResponse.json({ ok: false, erro: "Não autorizado" }, { status: 401 });
  }

  const { id: vigenciaId } = await ctx.params;

  const vigencia = await prisma.vigenciaNcm.findUnique({
    where: { id: vigenciaId },
    include: { cliente: { select: { escritorioId: true } } },
  });
  if (!vigencia || vigencia.cliente.escritorioId !== sessao.escritorioId) {
    return NextResponse.json({ ok: false, erro: "Vigência não encontrada" }, { status: 404 });
  }

  const form = await req.formData();
  const arquivo = form.get("arquivo");
  if (!arquivo || !(arquivo instanceof File)) {
    return NextResponse.json({ ok: false, erro: "Arquivo não recebido" }, { status: 422 });
  }

  const bytes = new Uint8Array(await arquivo.arrayBuffer());
  const parsed = parseTabelaLegada(bytes);

  if (parsed.linhas.length === 0) {
    return NextResponse.json(
      {
        ok: false,
        erro:
          "Nenhuma linha válida no arquivo. Esperado o formato codigo|descricao|ncm, um registro por linha.",
        avisos: parsed.avisos,
      },
      { status: 422 },
    );
  }

  // Só ACRESCENTA. Se o NCM já está na vigência (importação repetida, ou já veio
  // do estoque), a linha existente permanece como está — a regra do módulo agora
  // é nunca reclassificar o que já foi decidido.
  const existentes = await prisma.ncmVigencia.findMany({
    where: { vigenciaId },
    select: { ncm: true },
  });
  const jaNaVigencia = new Set(existentes.map((e) => e.ncm));

  let incluidos = 0;
  let ignorados = 0;
  for (const linha of parsed.linhas) {
    if (jaNaVigencia.has(linha.ncm)) {
      ignorados++;
      continue;
    }
    await prisma.ncmVigencia.create({
      data: {
        vigenciaId,
        ncm: linha.ncm,
        configuracaoId: null,
        codigoCliente: linha.codigo,
        descricaoCliente: linha.descricao,
        origem: "cliente_legado",
      },
    });
    jaNaVigencia.add(linha.ncm);
    incluidos++;
  }

  return NextResponse.json({
    ok: true,
    incluidos,
    ignorados,
    codigos: parsed.grupos.length,
    ncmsUnicos: parsed.ncmsUnicos.length,
    // A numeração dos NCMs novos continua daqui — não pode colidir com a do cliente.
    proximoCodigoCliente: parsed.maiorCodigo + 1,
    avisos: parsed.avisos,
    arquivo: arquivo.name,
  });
}
