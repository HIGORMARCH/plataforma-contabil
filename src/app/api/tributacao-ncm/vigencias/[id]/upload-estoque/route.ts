import { NextResponse } from "next/server";
import { getSessao, PAPEIS_INTERNOS } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { parseEstoqueDominio } from "@/lib/parse-estoque-dominio";
import { parseEstoqueViaPython } from "@/lib/parse-estoque-python";
import { garantirPastaVigencia, caminhoArquivoEstoque } from "@/lib/upload-path";
import { writeFile } from "node:fs/promises";
import { consultarNcmEconet, type AtividadeConsulta } from "@/lib/consulta-econet";
import { atividadeTributariaFromCnae } from "@/lib/atividade-tributaria";

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const sessao = await getSessao();
  if (!sessao || !PAPEIS_INTERNOS.includes(sessao.papel)) {
    return NextResponse.json({ ok: false, erro: "Não autorizado" }, { status: 401 });
  }

  const { id: vigenciaId } = await ctx.params;

  const vigencia = await prisma.vigenciaNcm.findUnique({
    where: { id: vigenciaId },
    include: { cliente: true },
  });
  if (!vigencia || vigencia.cliente.escritorioId !== sessao.escritorioId) {
    return NextResponse.json({ ok: false, erro: "Vigência não encontrada" }, { status: 404 });
  }

  const form = await req.formData();
  const arquivo = form.get("arquivo");
  if (!arquivo || !(arquivo instanceof File)) {
    return NextResponse.json({ ok: false, erro: "Arquivo não recebido" }, { status: 422 });
  }

  const buffer = Buffer.from(await arquivo.arrayBuffer());

  // 1) Salva o arquivo no Z: — antes de tentar parsear (auditoria mesmo que dê erro)
  let arquivoPathSalvo: string | null = null;
  try {
    const pasta = await garantirPastaVigencia(vigencia.cliente.cnpj, vigencia.dataVigencia);
    arquivoPathSalvo = caminhoArquivoEstoque(pasta, arquivo.name);
    await writeFile(arquivoPathSalvo, buffer);
  } catch (e) {
    // Sem quebrar o fluxo — apenas registra
    console.error("[upload-estoque] falha ao salvar em Z:", e);
    arquivoPathSalvo = null;
  }

  // 2) Parseia. Tenta SheetJS primeiro (pra .xlsx/.csv); se falhar ou vier vazio, usa Python calamine.
  let resultado: {
    produtos: { codigo: string; descricao: string; ncm: string }[];
    ncmsUnicos: string[];
    linhasIgnoradas: number;
  } | null = null;
  let parserUsado = "sheetjs";
  let erroParser: string | null = null;

  try {
    resultado = parseEstoqueDominio(buffer);
    if (!resultado.produtos.length && arquivoPathSalvo) {
      // vazio — provavelmente é .xls BIFF antigo do Domínio. Tenta Python
      const viaPy = await parseEstoqueViaPython(arquivoPathSalvo);
      if (viaPy.produtos.length) {
        resultado = viaPy;
        parserUsado = "python-calamine";
      }
    }
  } catch (e) {
    erroParser = e instanceof Error ? e.message : String(e);
    // fallback Python se salvou o arquivo
    if (arquivoPathSalvo) {
      try {
        resultado = await parseEstoqueViaPython(arquivoPathSalvo);
        parserUsado = "python-calamine";
        erroParser = null;
      } catch (e2) {
        erroParser = `SheetJS: ${erroParser} | Python: ${e2 instanceof Error ? e2.message : String(e2)}`;
      }
    }
  }

  if (!resultado || !resultado.produtos.length) {
    return NextResponse.json(
      {
        ok: false,
        erro: erroParser ?? "Nenhum produto extraído da planilha. Verifique o formato.",
        arquivoSalvoEm: arquivoPathSalvo,
        parserUsado,
      },
      { status: 422 },
    );
  }

  // 3) Cruza com base local
  const base = await prisma.ncmBase.findMany({
    where: { ncm: { in: resultado.ncmsUnicos } },
    include: { configuracao: true },
  });
  const baseByNcm = new Map(base.map((b) => [b.ncm, b]));

  const conhecidos = resultado.ncmsUnicos.filter((n) => baseByNcm.has(n));
  const faltantes = resultado.ncmsUnicos.filter((n) => !baseByNcm.has(n));

  let cadastrados = 0;
  for (const ncm of conhecidos) {
    const cfg = baseByNcm.get(ncm)!;
    await prisma.ncmVigencia.upsert({
      where: { vigenciaId_ncm: { vigenciaId, ncm } },
      update: { configuracaoId: cfg.configuracaoId, origem: "seed_autmais" },
      create: {
        vigenciaId,
        ncm,
        configuracaoId: cfg.configuracaoId,
        origem: "seed_autmais",
      },
    });
    cadastrados++;
  }

  // 4) Consulta Econet automaticamente pros faltantes (Fase 3)
  const econetSucessos: string[] = [];
  const econetFalhas: { ncm: string; erro: string }[] = [];
  if (faltantes.length > 0) {
    const atividade: AtividadeConsulta =
      (vigencia.cliente.atividadeTributaria as AtividadeConsulta | null) ??
      (atividadeTributariaFromCnae(vigencia.cliente.cnaePrincipal) as AtividadeConsulta | null) ??
      "varejo";

    const maxCodigo = await prisma.configuracaoNcm.aggregate({ _max: { codigo: true } });
    let proximoCodigo = (maxCodigo._max.codigo ?? 0) + 1;

    for (const ncm of faltantes) {
      try {
        const r = await consultarNcmEconet(ncm, atividade);
        if (r.erro) {
          econetFalhas.push({ ncm, erro: r.erro });
          continue;
        }
        const descricao = `${r.descricaoBase} - ${r.natureza || "0"}`;
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
        await prisma.ncmVigencia.upsert({
          where: { vigenciaId_ncm: { vigenciaId, ncm } },
          update: { configuracaoId: config.id, origem: "econet_auto" },
          create: { vigenciaId, ncm, configuracaoId: config.id, origem: "econet_auto" },
        });
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
        econetSucessos.push(ncm);
      } catch (e) {
        econetFalhas.push({ ncm, erro: e instanceof Error ? e.message : String(e) });
      }
    }
  }

  // 5) Atualiza vigência com o path do arquivo salvo
  await prisma.vigenciaNcm.update({
    where: { id: vigenciaId },
    data: {
      arquivoEstoquePath: arquivoPathSalvo,
      arquivoEstoqueNome: arquivo.name,
    },
  });

  const ncmsRealmenteFaltantes = faltantes.filter((n) => !econetSucessos.includes(n));

  return NextResponse.json({
    ok: true,
    arquivoSalvoEm: arquivoPathSalvo,
    parserUsado,
    totalProdutos: resultado.produtos.length,
    ncmsProcessados: resultado.ncmsUnicos.length,
    ncmsCadastradosDaBase: cadastrados,
    ncmsResolvidosViaEconet: econetSucessos.length,
    ncmsFaltantes: ncmsRealmenteFaltantes,
    econetFalhas,
    linhasIgnoradas: resultado.linhasIgnoradas,
  });
}
