import { NextResponse } from "next/server";
import { getSessao, PAPEIS_INTERNOS } from "@/lib/auth";
import { prisma } from "@/lib/db";

/**
 * De-para entre a tabela de NCM do cliente e a NOSSA base.
 *
 * O cliente traz do Domínio dele uma tabela pequena, com código e descrição
 * dele — sem CST e sem natureza. A nossa base tem 3,3 mil NCMs classificados e
 * cresce a cada consulta: a semente Autmais só cobre regimes especiais, então
 * cada NCM tributado que confirmamos na Econet é registro que só existe aqui.
 * Cruzar as duas resolve a maior parte do trabalho sem tocar na Econet: o que
 * bate ganha a nossa classificação; só o que sobra precisa de consulta.
 *
 * O cruzamento é pelo NCM de 8 dígitos — chave natural do domínio fiscal.
 * (Não é o caso do de-para de plano de contas revertido em 10/08/2026: lá o
 * casamento era por código sequencial, que casava conta errada. NCM é NCM.)
 *
 * Body: { aplicar?: boolean }. Sem `aplicar`, só simula e devolve o que faria —
 * nada é gravado. Vincular muda o que o TXT exporta pro Domínio, então a
 * prévia existe pra você conferir antes.
 */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const sessao = await getSessao();
  if (!sessao || !PAPEIS_INTERNOS.includes(sessao.papel)) {
    return NextResponse.json({ ok: false, erro: "Não autorizado" }, { status: 401 });
  }
  const { id: vigenciaId } = await ctx.params;

  const vigencia = await prisma.vigenciaNcm.findUnique({
    where: { id: vigenciaId },
    include: { cliente: true, ncms: true },
  });
  if (!vigencia || vigencia.cliente.escritorioId !== sessao.escritorioId) {
    return NextResponse.json({ ok: false, erro: "Vigência não encontrada" }, { status: 404 });
  }

  const body = await req.json().catch(() => null);
  const aplicar = Boolean(body?.aplicar);

  // Só linhas ainda sem configuração nossa. As que já têm ficam intocadas —
  // o de-para acrescenta, nunca reclassifica o que já foi decidido.
  const semVinculo = vigencia.ncms.filter((n) => !n.configuracaoId);

  const naBase = await prisma.ncmBase.findMany({
    where: { ncm: { in: semVinculo.map((n) => n.ncm) } },
    include: { configuracao: true },
  });
  const byNcm = new Map(naBase.map((b) => [b.ncm, b]));

  const casados = semVinculo.filter((n) => byNcm.has(n.ncm));
  const semCorrespondencia = semVinculo.filter((n) => !byNcm.has(n.ncm));

  const preview = casados.map((n) => {
    const b = byNcm.get(n.ncm)!;
    return {
      ncm: n.ncm,
      codigoCliente: n.codigoCliente,
      descricaoCliente: n.descricaoCliente,
      nossoCodigo: b.configuracao.codigo,
      nossaDescricao: b.configuracao.descricao,
      tipo: b.configuracao.tipo,
    };
  });

  if (aplicar) {
    for (const n of casados) {
      const b = byNcm.get(n.ncm)!;
      // Só o vínculo muda. A origem continua registrando DE ONDE a linha veio
      // (a tabela do cliente), que é informação diferente de como ela foi
      // classificada.
      await prisma.ncmVigencia.update({
        where: { id: n.id },
        data: { configuracaoId: b.configuracaoId },
      });
    }
    await prisma.logAcesso.create({
      data: {
        acao: "DEPARA_NCM_APLICADO",
        detalhe: `${casados.length} NCMs vinculados na vigência ${vigenciaId} (${vigencia.cliente.razaoSocial})`,
        usuarioId: sessao.userId,
      },
    });
  }

  return NextResponse.json({
    ok: true,
    aplicado: aplicar,
    totalNaVigencia: vigencia.ncms.length,
    jaVinculados: vigencia.ncms.length - semVinculo.length,
    casados: casados.length,
    semCorrespondencia: semCorrespondencia.length,
    ncmsParaEconet: semCorrespondencia.map((n) => n.ncm),
    preview,
  });
}
