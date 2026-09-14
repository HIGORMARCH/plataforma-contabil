import path from "node:path";
import { NextResponse } from "next/server";
import { getSessao, PAPEIS_INTERNOS } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { extrairLinhasPdf } from "@/lib/extract/pdfText";
import { extrairDemonstrativos } from "@/lib/extract/heuristic";
import {
  ehFormatoClassificacao,
  ehSoDemonstracaoResultado,
  extrairDemonstracaoResultado,
  extrairPorClassificacao,
} from "@/lib/extract/classificacao";
import { extrairComIA } from "@/lib/extract/ai";
import { pastaTipoAno, salvar } from "@/lib/storage/filesystem";

export async function POST(req: Request) {
  const sessao = await getSessao();
  if (!sessao || !PAPEIS_INTERNOS.includes(sessao.papel)) {
    return NextResponse.json({ erro: "Não autorizado" }, { status: 401 });
  }

  const fd = await req.formData();
  const arquivo = fd.get("arquivo") as File | null;
  if (!arquivo || arquivo.size === 0) {
    return NextResponse.json({ erro: "Nenhum arquivo enviado" }, { status: 400 });
  }
  if (arquivo.size > 10_000_000) {
    return NextResponse.json({ erro: "Arquivo muito grande (máx. 10MB)" }, { status: 400 });
  }
  const clienteId = (fd.get("clienteId") as string | null) ?? null;

  const bytes = Buffer.from(await arquivo.arrayBuffer());
  let linhas: string[];
  try {
    linhas = await extrairLinhasPdf(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer);
  } catch (e) {
    return NextResponse.json(
      { erro: `Não foi possível ler o PDF: ${(e as Error).message}` },
      { status: 422 },
    );
  }

  // Três formatos:
  //  - plano de contas com código + D/C → parser dedicado, que respeita o
  //    sinal contábil e fecha o balanço;
  //  - só a Demonstração do Resultado (a D.R.E. do Domínio) → parser da DRE,
  //    que não devolve campo de balanço;
  //  - o resto → heurística genérica, com refino opcional por IA.
  const estruturado = ehFormatoClassificacao(linhas);
  const soDRE = !estruturado && ehSoDemonstracaoResultado(linhas);
  const base = estruturado
    ? extrairPorClassificacao(linhas)
    : soDRE
      ? extrairDemonstracaoResultado(linhas)
      : extrairDemonstrativos(linhas);

  // Refino opcional por IA: preenche apenas chaves que ainda não foram captadas.
  const ia = estruturado || soDRE ? null : await extrairComIA(linhas);
  const campos = { ...base.campos };
  let origem: "heuristica" | "ia" | "plano_contas" | "dre" = estruturado ? "plano_contas" : soDRE ? "dre" : "heuristica";
  if (ia) {
    origem = "ia";
    for (const [chave, valor] of Object.entries(ia)) {
      if (valor === null) continue;
      const atual = campos[chave];
      if (!atual || atual.valor === null) {
        campos[chave] = { valor, trecho: "(identificado por IA)", confianca: "media" };
      }
    }
  }

  // Fonte única: cópia do PDF em <cliente>\OUTROS\BALANCOS-DOMINIO\<ano>\<tipo>.pdf.
  // O tipo sai do conteúdo (o nome do arquivo é livre) e o ano é o do
  // exercício declarado no documento — nunca a data de emissão.
  let arquivoCopiado: string | null = null;
  if (clienteId && base.ano) {
    try {
      const cliente = await prisma.cliente.findFirst({
        where: { id: clienteId, escritorioId: sessao.escritorioId },
        select: { razaoSocial: true, cnpj: true, pastaLocal: true },
      });
      if (cliente) {
        const tipo = soDRE ? "dre" : "balanco";
        const alvo = path.join(pastaTipoAno(cliente, "BALANCOS-DOMINIO", base.ano), `${tipo}.pdf`);
        const r = await salvar(alvo, bytes);
        if (r === "gravado") arquivoCopiado = alvo;
      }
    } catch {
      // Falha ao salvar cópia não bloqueia a resposta — extração já foi feita.
    }
  }

  return NextResponse.json({
    ano: base.ano,
    origem,
    totalLinhas: linhas.length,
    campos,
    arquivoCopiado,
  });
}
