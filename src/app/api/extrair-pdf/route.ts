import { NextResponse } from "next/server";
import { getSessao, PAPEIS_INTERNOS } from "@/lib/auth";
import { extrairLinhasPdf } from "@/lib/extract/pdfText";
import { extrairDemonstrativos } from "@/lib/extract/heuristic";
import { ehFormatoClassificacao, extrairPorClassificacao } from "@/lib/extract/classificacao";
import { extrairComIA } from "@/lib/extract/ai";

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

  let linhas: string[];
  try {
    linhas = await extrairLinhasPdf(await arquivo.arrayBuffer());
  } catch (e) {
    return NextResponse.json(
      { erro: `Não foi possível ler o PDF: ${(e as Error).message}` },
      { status: 422 },
    );
  }

  // Formato estruturado (plano de contas com código + D/C) → parser dedicado,
  // que respeita o sinal contábil e fecha o balanço. Senão, heurística genérica.
  const estruturado = ehFormatoClassificacao(linhas);
  const base = estruturado ? extrairPorClassificacao(linhas) : extrairDemonstrativos(linhas);

  // Refino opcional por IA: preenche apenas chaves que ainda não foram captadas.
  const ia = estruturado ? null : await extrairComIA(linhas);
  const campos = { ...base.campos };
  let origem: "heuristica" | "ia" | "plano_contas" = estruturado ? "plano_contas" : "heuristica";
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

  return NextResponse.json({
    ano: base.ano,
    origem,
    totalLinhas: linhas.length,
    campos,
  });
}
