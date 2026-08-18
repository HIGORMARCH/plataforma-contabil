import { NextResponse } from "next/server";
import { getSessao, PAPEIS_INTERNOS } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { gerarTxtDominio, type LinhaNcmTxt } from "@/lib/gerar-txt-dominio";

/**
 * Gera o TXT no formato exato do Domínio combinando:
 *  - TODAS as linhas do arquivo pai (57 configs + ~3.318 NCMs base — a semente Autmais)
 *  - + Os NCMs desta vigência que ainda NÃO estão no pai
 *
 * Assim, ao importar no Domínio com "Importar somente registros inexistentes":
 *  - Se a empresa nunca teve o pai importado, o Domínio importa TUDO (pai + novos)
 *  - Se já teve, ignora as 3.318 duplicatas e adiciona só os novos
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

  // O cliente já tinha tabela própria importada nesta vigência?
  //
  // Se sim, NÃO se manda o arquivo pai: a numeração dele (códigos 2..71 na Casa
  // São Paulo) é independente da nossa numeração global, e o mesmo número
  // significa coisas diferentes nos dois lados. Despejar o pai por cima
  // corromperia a tabela que ele já usa. Exporta-se apenas o que é NOVO, na
  // numeração DELE — os códigos antigos já estão no Domínio dele.
  const temTabelaLegada = vigencia.ncms.some((n) => n.origem === "cliente_legado");

  let linhasPai: LinhaNcmTxt[] = [];
  let linhasNovas: LinhaNcmTxt[];

  if (temTabelaLegada) {
    linhasNovas = vigencia.ncms
      .filter((n) => n.origem !== "cliente_legado" && n.configuracao !== null)
      .map((n) => ({
        // codigoCliente é a sequência dele (72 em diante). Só cai pro código
        // global se por algum motivo a linha não tiver recebido numeração.
        codigo: n.codigoCliente ?? n.configuracao!.codigo,
        descricao: n.configuracao!.descricao,
        ncm: n.ncm,
        cstEntrada: n.configuracao!.cstEntrada,
        cstSaida: n.configuracao!.cstSaida,
        natureza: n.configuracao!.natureza,
      }));
  } else {
    // Comportamento original: cliente sem tabela prévia recebe o arquivo pai
    // inteiro + os complementos, e o Domínio importa só o que não existe.
    const baseNcms = await prisma.ncmBase.findMany({ include: { configuracao: true } });
    const ncmsNoPai = new Set(baseNcms.map((n) => n.ncm));

    linhasPai = baseNcms.map((n) => ({
      codigo: n.configuracao.codigo,
      descricao: n.configuracao.descricao,
      ncm: n.ncm,
      cstEntrada: n.configuracao.cstEntrada,
      cstSaida: n.configuracao.cstSaida,
      natureza: n.configuracao.natureza,
    }));

    linhasNovas = vigencia.ncms
      .filter((n) => !ncmsNoPai.has(n.ncm) && n.configuracao !== null)
      .map((n) => ({
        codigo: n.configuracao!.codigo,
        descricao: n.configuracao!.descricao,
        ncm: n.ncm,
        cstEntrada: n.configuracao!.cstEntrada,
        cstSaida: n.configuracao!.cstSaida,
        natureza: n.configuracao!.natureza,
      }));
  }

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
    },
  });
}
