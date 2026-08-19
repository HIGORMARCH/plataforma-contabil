import { NextResponse } from "next/server";
import { getSessao, PAPEIS_INTERNOS } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { parseEstoqueDominio } from "@/lib/parse-estoque-dominio";
import { parseEstoqueViaPython } from "@/lib/parse-estoque-python";
import { garantirPastaVigencia, caminhoArquivoEstoque } from "@/lib/upload-path";
import { writeFile } from "node:fs/promises";

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

  // 3) SÓ ACRESCENTA — nunca reclassifica.
  //
  // Regra estabelecida em 16/08/2026 (caso Casa São Paulo): o cliente já tinha
  // tabela própria no Domínio, com 70 códigos e classificação distinta da nossa.
  // O comportamento anterior era `upsert` com `update`, o que sobrescrevia a
  // classificação dele pela da nossa base a cada planilha subida — destruindo
  // exatamente o que o contador já havia decidido.
  const existentes = await prisma.ncmVigencia.findMany({
    where: { vigenciaId },
    select: { ncm: true },
  });
  const jaNaVigencia = new Set(existentes.map((e) => e.ncm));
  const novosDaPlanilha = resultado.ncmsUnicos.filter((n) => !jaNaVigencia.has(n));
  const preservados = resultado.ncmsUnicos.length - novosDaPlanilha.length;

  // Numeração no espaço do cliente: continua de onde a tabela dele parou.
  const maxCliente = await prisma.ncmVigencia.aggregate({
    where: { vigenciaId },
    _max: { codigoCliente: true },
  });
  let proximoCodigoCliente = (maxCliente._max.codigoCliente ?? 0) + 1;

  const base = await prisma.ncmBase.findMany({
    where: { ncm: { in: novosDaPlanilha } },
    include: { configuracao: true },
  });
  const baseByNcm = new Map(base.map((b) => [b.ncm, b]));

  const conhecidos = novosDaPlanilha.filter((n) => baseByNcm.has(n));
  const faltantes = novosDaPlanilha.filter((n) => !baseByNcm.has(n));

  let cadastrados = 0;
  for (const ncm of conhecidos) {
    const cfg = baseByNcm.get(ncm)!;
    await prisma.ncmVigencia.create({
      data: {
        vigenciaId,
        ncm,
        configuracaoId: cfg.configuracaoId,
        codigoCliente: proximoCodigoCliente++,
        origem: "base_plataforma",
      },
    });
    cadastrados++;
  }

  // 4) Os faltantes NÃO são consultados aqui.
  //
  // Regra do Higor (19/08/2026): "a questão da Econet tem que ser solicitado".
  // Subir uma planilha não pode disparar consulta a serviço externo — é lento,
  // depende de sessão viva e CAPTCHA, e o contador pode nem querer consultar
  // agora. O upload devolve a lista de faltantes; a consulta é ato deliberado,
  // no botão da tela da vigência.
  //
  // Antes daqui saíam consultas em lote automáticas. Foi assim que 69 NCMs
  // entraram na base sem ninguém acompanhar, em julho, quando a sessão tinha
  // vencido e o parser ainda lia a tela de busca como "tributação normal".

  // 5) Atualiza vigência com o path do arquivo salvo
  await prisma.vigenciaNcm.update({
    where: { id: vigenciaId },
    data: {
      arquivoEstoquePath: arquivoPathSalvo,
      arquivoEstoqueNome: arquivo.name,
    },
  });

  return NextResponse.json({
    ok: true,
    arquivoSalvoEm: arquivoPathSalvo,
    parserUsado,
    totalProdutos: resultado.produtos.length,
    ncmsProcessados: resultado.ncmsUnicos.length,
    // Já estavam na vigência (tabela legada do cliente ou upload anterior) e
    // foram mantidos como estavam — não reclassificados.
    ncmsPreservados: preservados,
    ncmsCadastradosDaBase: cadastrados,
    // Ficam aguardando decisão: a tela oferece consultar na Econet ou
    // classificar à mão.
    ncmsFaltantes: faltantes,
    linhasIgnoradas: resultado.linhasIgnoradas,
  });
}
