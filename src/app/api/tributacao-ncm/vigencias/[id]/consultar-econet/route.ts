import { NextResponse } from "next/server";
import { getSessao, PAPEIS_INTERNOS } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { consultarNcmEconet, type AtividadeConsulta, type DiagnosticoEconet } from "@/lib/consulta-econet";
import { carregarSessaoEconet } from "@/lib/econet-sessao";
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
    diagnostico?: DiagnosticoEconet;
    /** De onde saiu a classificação: nossa base local ou uma consulta agora. */
    fonte?: "base" | "econet";
  }[] = [];

  // -------------------------------------------------------------------------
  // ETAPA 1 — resolver pela base local (ideia do Higor, 19/08/2026).
  //
  // A NcmBase é a base da plataforma: começou numa semente e cresce a cada
  // NCM confirmado na Econet, inclusive os tributados normalmente. Consultar a Econet
  // pra um NCM que já está lá é ida desnecessária a um serviço pago, lento e
  // que depende de sessão viva. Na prática a maioria da lista resolve aqui, e
  // sessão vencida deixa de bloquear o trabalho todo.
  //
  // Só a base entra nesta etapa. O CacheEconet fica de fora de propósito: ele
  // guarda o resultado bruto de consultas passadas, e consulta passada foi
  // exatamente o que saiu errado em julho.
  // -------------------------------------------------------------------------
  const naBase = await prisma.ncmBase.findMany({
    where: { ncm: { in: ncmsSolicitados } },
    include: { configuracao: true },
  });
  const baseByNcm = new Map(naBase.map((b) => [b.ncm, b]));

  for (const ncm of ncmsSolicitados) {
    const b = baseByNcm.get(ncm);
    if (!b) continue;
    await prisma.ncmVigencia.upsert({
      where: { vigenciaId_ncm: { vigenciaId, ncm } },
      update: {}, // nunca reclassifica o que já está na vigência
      create: { vigenciaId, ncm, configuracaoId: b.configuracaoId, origem: "base_local" },
    });
    resultados.push({
      ncm,
      ok: true,
      fonte: "base",
      tipo: b.configuracao.tipo,
      codigo: b.configuracao.codigo,
      descricao: b.configuracao.descricao,
    });
  }

  const faltantes = ncmsSolicitados.filter((n) => !baseByNcm.has(n));

  // Tudo resolvido sem sair de casa — nem toca na Econet.
  if (faltantes.length === 0) {
    return NextResponse.json({
      ok: true,
      atividadeUsada: atividade,
      resolvidosNaBase: resultados.length,
      consultadosNaEconet: 0,
      processados: resultados.length,
      sucessos: resultados.length,
      falhas: 0,
      resultados,
    });
  }

  // -------------------------------------------------------------------------
  // ETAPA 2 — só o que sobrou vai pra Econet.
  // -------------------------------------------------------------------------

  // Sessão carregada uma vez pro lote (decifrar custa scrypt). Sem sessão,
  // nem começa: martelar os faltantes pra colher o mesmo erro em cada um só
  // esconde a causa real atrás de uma lista de falhas.
  const sessaoEconet = await carregarSessaoEconet(sessao.escritorioId);
  if (!sessaoEconet) {
    return NextResponse.json(
      {
        ok: false,
        diagnostico: "SESSAO_AUSENTE" satisfies DiagnosticoEconet,
        erro:
          "Nenhuma sessão da Econet cadastrada nesta instalação. " +
          "Abra Administração > Configurações e use “Renovar sessão da Econet”.",
        resolvidosNaBase: resultados.length,
        naoTentados: faltantes.length,
        resultados,
      },
      { status: 409 },
    );
  }

  // Descobre o próximo código livre pra novas configurações
  const maxCodigo = await prisma.configuracaoNcm.aggregate({ _max: { codigo: true } });
  let proximoCodigo = (maxCodigo._max.codigo ?? 0) + 1;

  /** Preenchido quando o lote é abortado por falha que afeta todos os NCMs. */
  let abortadoPor: { diagnostico: DiagnosticoEconet; erro: string } | null = null;
  let tentadosNaEconet = 0;

  for (const ncm of faltantes) {
    tentadosNaEconet++;
    try {
      const r = await consultarNcmEconet(ncm, atividade, sessaoEconet);

      // Sessão vencida ou layout trocado não é problema DESTE NCM — é do lote
      // inteiro. Parar aqui é o que transforma "70 consultas erradas" em
      // "uma mensagem certa na primeira tentativa".
      if (r.diagnostico === "SESSAO_EXPIRADA" || r.diagnostico === "ERRO_REDE") {
        abortadoPor = { diagnostico: r.diagnostico, erro: r.erro ?? "" };
        resultados.push({ ncm, ok: false, erro: r.erro, diagnostico: r.diagnostico });
        break;
      }

      if (r.erro) {
        resultados.push({ ncm, ok: false, erro: r.erro, diagnostico: r.diagnostico });
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

      // Grava na vigência — SEM sobrescrever. Se o NCM já está lá (veio da
      // tabela legada do cliente ou de upload anterior), a classificação
      // existente vale; só o que falta é acrescentado.
      await prisma.ncmVigencia.upsert({
        where: { vigenciaId_ncm: { vigenciaId, ncm } },
        update: {},
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
        fonte: "econet",
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

  // Quantos faltantes sequer chegaram a ser tentados, quando o lote foi abortado.
  const naoTentados = faltantes.length - tentadosNaEconet;

  return NextResponse.json({
    ok: !abortadoPor,
    atividadeUsada: atividade,
    sessaoRenovadaEm: sessaoEconet.renovadaEm,
    resolvidosNaBase: resultados.filter((r) => r.fonte === "base").length,
    consultadosNaEconet: resultados.filter((r) => r.fonte === "econet").length,
    processados: resultados.length,
    sucessos: resultados.filter((r) => r.ok).length,
    falhas: resultados.filter((r) => !r.ok).length,
    ...(abortadoPor
      ? {
          diagnostico: abortadoPor.diagnostico,
          erro: abortadoPor.erro,
          naoTentados,
        }
      : {}),
    resultados,
  });
}
