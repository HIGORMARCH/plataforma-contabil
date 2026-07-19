import { NextResponse } from "next/server";
import { getSessao, PAPEIS_INTERNOS } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { consultarNcmEconet, type AtividadeConsulta } from "@/lib/consulta-econet";
import { atividadeTributariaFromCnae } from "@/lib/atividade-tributaria";

/**
 * Consulta a Econet pros NCMs da vigência que ainda não estão na base pai.
 * Pra cada NCM:
 *  1. Consulta a Econet (usando sessão logada)
 *  2. Encontra/cria a Configuração NCM correspondente
 *  3. Grava associação NCM ↔ Config na vigência
 *  4. Grava tb na base pai (pra próximo cliente que precisar)
 */
export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
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

  // Descobre atividade: campo do cliente ou inferido do CNAE
  const atividade: AtividadeConsulta =
    (vigencia.cliente.atividadeTributaria as AtividadeConsulta | null) ??
    (atividadeTributariaFromCnae(vigencia.cliente.cnaePrincipal) as AtividadeConsulta | null) ??
    "varejo";

  // Identifica NCMs "faltantes" — os que estão na vigência mas com configuração origem 'faltante'
  // (por enquanto, todos os NCMs sem NcmBase são considerados já resolvidos no upload; então essa
  // rota consulta os NCMs que ainda não têm associação — mas atualmente todos têm.
  // Alternativa: aceitar lista de NCMs específicos pra consultar.)

  // Melhor: usar a lista de faltantes que vem no body
  const body = await _req.json().catch(() => null);
  const ncmsSolicitados: string[] = Array.isArray(body?.ncms) ? body.ncms : [];
  if (ncmsSolicitados.length === 0) {
    return NextResponse.json(
      { ok: false, erro: "Nenhum NCM enviado. Envie { ncms: string[] } no body." },
      { status: 422 },
    );
  }

  const resultados: {
    ncm: string;
    ok: boolean;
    tipo?: string;
    codigo?: number;
    descricao?: string;
    erro?: string;
  }[] = [];

  // Descobre o próximo código livre pra novas configurações
  const maxCodigo = await prisma.configuracaoNcm.aggregate({ _max: { codigo: true } });
  let proximoCodigo = (maxCodigo._max.codigo ?? 0) + 1;

  for (const ncm of ncmsSolicitados) {
    try {
      const r = await consultarNcmEconet(ncm, atividade);
      if (r.erro) {
        resultados.push({ ncm, ok: false, erro: r.erro });
        continue;
      }

      // Descrição no padrão do arquivo pai
      const descricao = `${r.descricaoBase} - ${r.natureza || "0"}`;

      // Acha configuração existente com essa descrição, ou cria nova
      let config = await prisma.configuracaoNcm.findFirst({
        where: { descricao: { equals: descricao } },
      });
      if (!config) {
        config = await prisma.configuracaoNcm.create({
          data: {
            codigo: proximoCodigo++,
            descricao,
            tipo: r.tipo,
            cstEntrada: r.cstEntrada,
            cstSaida: r.cstSaida,
            natureza: r.natureza || "0",
            origem: "econet",
          },
        });
      }

      // Grava na vigência
      await prisma.ncmVigencia.upsert({
        where: { vigenciaId_ncm: { vigenciaId, ncm } },
        update: { configuracaoId: config.id, origem: "econet_auto" },
        create: {
          vigenciaId,
          ncm,
          configuracaoId: config.id,
          origem: "econet_auto",
        },
      });

      // Grava na base pai (pra reaproveitamento futuro)
      await prisma.ncmBase.upsert({
        where: { ncm },
        update: { configuracaoId: config.id, atualizadoEm: new Date() },
        create: {
          ncm,
          configuracaoId: config.id,
          origem: "econet_cache",
          atividadeContexto: atividade,
        },
      });

      // Salva no cache Econet (histórico)
      await prisma.cacheEconet.upsert({
        where: { ncm_atividade: { ncm, atividade } },
        update: {
          tipo: r.tipo,
          natureza: r.natureza,
          cstEntrada: r.cstEntrada,
          cstSaida: r.cstSaida,
          abasHtml: JSON.stringify(r.todasAbas ?? []),
          consultadoEm: new Date(),
        },
        create: {
          ncm,
          atividade,
          tipo: r.tipo,
          natureza: r.natureza,
          cstEntrada: r.cstEntrada,
          cstSaida: r.cstSaida,
          abasHtml: JSON.stringify(r.todasAbas ?? []),
        },
      });

      resultados.push({
        ncm,
        ok: true,
        tipo: r.tipo,
        codigo: config.codigo,
        descricao: config.descricao,
      });
    } catch (e) {
      resultados.push({
        ncm,
        ok: false,
        erro: e instanceof Error ? e.message : String(e),
      });
    }
  }

  return NextResponse.json({
    ok: true,
    atividadeUsada: atividade,
    processados: resultados.length,
    sucessos: resultados.filter((r) => r.ok).length,
    falhas: resultados.filter((r) => !r.ok).length,
    resultados,
  });
}
