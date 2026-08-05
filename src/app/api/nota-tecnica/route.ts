import { NextResponse } from "next/server";
import { getSessao, PAPEIS_INTERNOS } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { gerarNotaTecnica } from "@/lib/ai/notaTecnica";
import type { ResultadoAnalise } from "@/lib/accounting/analyze";

interface Body {
  relatorioId: string;
  contexto: string;
  anexos?: string[];
}

interface ConteudoRelatorio {
  analise: ResultadoAnalise;
}

export async function POST(req: Request) {
  const sessao = await getSessao();
  if (!sessao || !PAPEIS_INTERNOS.includes(sessao.papel)) {
    return NextResponse.json({ erro: "Não autorizado" }, { status: 401 });
  }

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ erro: "JSON inválido" }, { status: 400 });
  }
  if (!body?.relatorioId) {
    return NextResponse.json({ erro: "relatorioId é obrigatório" }, { status: 400 });
  }

  const r = await prisma.relatorio.findFirst({
    where: { id: body.relatorioId, cliente: { escritorioId: sessao.escritorioId } },
    include: { cliente: true },
  });
  if (!r) {
    return NextResponse.json({ erro: "Relatório não encontrado" }, { status: 404 });
  }

  let analise: ResultadoAnalise;
  try {
    analise = (JSON.parse(r.conteudoJson) as ConteudoRelatorio).analise;
  } catch {
    return NextResponse.json({ erro: "Conteúdo do relatório está corrompido" }, { status: 500 });
  }

  const anoRef = Number(r.periodo?.match(/\d{4}/)?.[0]) || undefined;
  const nota = await gerarNotaTecnica(analise, body.contexto ?? "", {
    cliente: r.cliente.razaoSocial,
    ano: anoRef,
    cidade: "Palmas",
    anexos: body.anexos ?? [],
  });

  // Persiste automaticamente — a nota fica atrelada ao relatório e sai anexa quando
  // for compartilhada/impressa. O contador pode reeditar e regerar quando quiser.
  await prisma.relatorio.update({
    where: { id: r.id },
    data: {
      notaTecnicaContexto: body.contexto || null,
      notaTecnicaTexto: nota.texto,
      notaTecnicaOrigemIA: nota.origem,
    },
  });

  return NextResponse.json({
    texto: nota.texto,
    origem: nota.origem,
    modelo: nota.modelo ?? null,
    observacao: nota.observacao ?? null,
  });
}
