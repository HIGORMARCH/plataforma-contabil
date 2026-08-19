import { NextResponse } from "next/server";
import { getSessao, PAPEIS_INTERNOS } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { gerarTxtDominio, type LinhaNcmTxt } from "@/lib/gerar-txt-dominio";

/**
 * Gera o TXT no formato do Domínio a partir da BASE DA PLATAFORMA:
 *  - todas as linhas da nossa base (configurações + NCMs classificados)
 *  - + os NCMs desta vigência que ainda não estão nela
 *
 * NUMERAÇÃO: a nossa, sempre.
 *
 * Até 19/08/2026 havia um segundo caminho, que exportava na numeração DO
 * CLIENTE quando ele já tinha tabela própria importada — para não colidir com
 * os códigos que ele usava no Domínio. O Higor encerrou essa dualidade:
 *
 *   "esquece a tabela do cliente, a tabela do cliente vira a nossa"
 *
 * Ou seja: a tabela dele é ponto de partida para o de-para, e depois disso quem
 * manda é a nossa classificação e a nossa numeração. Some o problema dos dois
 * espaços de numeração convivendo, e todo NCM sai com a descrição da nossa
 * configuração — inclusive os que entraram por planilha, que não têm descrição
 * própria.
 *
 * ⚠️ Consequência prática no Domínio: como os códigos antigos do cliente
 * significavam outra coisa, a importação passa a redefinir a tabela dele. Usar
 * "Importar somente registros inexistentes" mantém as linhas antigas convivendo
 * com as novas; para trocar de verdade, a tabela antiga precisa sair.
 */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const sessao = await getSessao();
  if (!sessao || !PAPEIS_INTERNOS.includes(sessao.papel)) {
    return NextResponse.json({ ok: false, erro: "Não autorizado" }, { status: 401 });
  }
  const { id: vigenciaId } = await ctx.params;

  const vigencia = await prisma.vigenciaNcm.findUnique({
    where: { id: vigenciaId },
    include: {
      cliente: true,
      ncms: { include: { configuracao: true } },
    },
  });
  if (!vigencia || vigencia.cliente.escritorioId !== sessao.escritorioId) {
    return NextResponse.json({ ok: false, erro: "Vigência não encontrada" }, { status: 404 });
  }

  // Um caminho só: a nossa base inteira + o que a vigência acrescentou.
  const baseNcms = await prisma.ncmBase.findMany({ include: { configuracao: true } });
  const ncmsNaBase = new Set(baseNcms.map((n) => n.ncm));

  const linhasPai: LinhaNcmTxt[] = baseNcms.map((n) => ({
    codigo: n.configuracao.codigo,
    descricao: n.configuracao.descricao,
    ncm: n.ncm,
    cstEntrada: n.configuracao.cstEntrada,
    cstSaida: n.configuracao.cstSaida,
    natureza: n.configuracao.natureza,
  }));

  // NCM sem configuração nossa fica de fora: exportar linha sem CST e sem
  // natureza seria mandar pro Domínio um cadastro que não classifica nada.
  const linhasNovas: LinhaNcmTxt[] = vigencia.ncms
    .filter((n) => !ncmsNaBase.has(n.ncm) && n.configuracao !== null)
    .map((n) => ({
      codigo: n.configuracao!.codigo,
      descricao: n.configuracao!.descricao,
      ncm: n.ncm,
      cstEntrada: n.configuracao!.cstEntrada,
      cstSaida: n.configuracao!.cstSaida,
      natureza: n.configuracao!.natureza,
    }));

  // NCMs da vigência que ficaram sem classificação — informados no cabeçalho da
  // resposta pra tela poder avisar em vez de exportar em silêncio.
  const semClassificacao = vigencia.ncms.filter((n) => n.configuracao === null).length;

  const linhas = [...linhasPai, ...linhasNovas];
  const bytes = gerarTxtDominio(linhas);

  // Marca a vigência como exportada
  await prisma.vigenciaNcm.update({
    where: { id: vigenciaId },
    data: { status: "EXPORTADA" },
  });

  const nomeCliente = vigencia.cliente.razaoSocial.replace(/[^A-Za-z0-9-]+/g, "_").slice(0, 40);
  const dataIso = vigencia.dataVigencia.toISOString().slice(0, 10);
  const filename = `${nomeCliente}-tributacao-${dataIso}.txt`;

  return new NextResponse(bytes as unknown as BodyInit, {
    status: 200,
    headers: {
      "Content-Type": "text/plain; charset=windows-1252",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Content-Length": bytes.length.toString(),
      "X-Linhas-Pai": linhasPai.length.toString(),
      "X-Linhas-Novas": linhasNovas.length.toString(),
      "X-Total-Linhas": linhas.length.toString(),
      "X-Sem-Classificacao": semClassificacao.toString(),
    },
  });
}
