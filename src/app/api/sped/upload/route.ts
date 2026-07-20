import { NextResponse } from "next/server";
import { requireSessao, PAPEIS_INTERNOS } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { importarSped } from "@/lib/sped/importarSped";

/**
 * POST /api/sped/upload
 *   Recebe um arquivo SPED-Fiscal EFD ICMS/IPI (.txt) via FormData e importa
 *   as apurações (E110) pro cliente informado.
 *
 *   FormData:
 *     clienteId: string (obrigatório)
 *     arquivo:   File   (obrigatório, .txt)
 *
 *   Retorno JSON:
 *     { sucesso, mensagem, importacaoId, apuracoesGravadas, apuracoesSubstituidas,
 *       registrosE110, metadata: {cnpj, ie, uf, nome, dataInicial, dataFinal} }
 */
export async function POST(req: Request) {
  const sessao = await requireSessao();
  if (!PAPEIS_INTERNOS.includes(sessao.papel)) {
    return NextResponse.json({ erro: "acesso restrito a papéis internos" }, { status: 403 });
  }

  let fd: FormData;
  try {
    fd = await req.formData();
  } catch {
    return NextResponse.json({ erro: "body deve ser multipart/form-data" }, { status: 400 });
  }

  const clienteId = fd.get("clienteId");
  const arquivo = fd.get("arquivo");
  if (!clienteId || typeof clienteId !== "string") {
    return NextResponse.json({ erro: "clienteId obrigatório" }, { status: 400 });
  }
  if (!arquivo || !(arquivo instanceof File)) {
    return NextResponse.json({ erro: "arquivo obrigatório" }, { status: 400 });
  }

  // Sanidade: cliente pertence ao mesmo escritório do usuário.
  const cliente = await prisma.cliente.findFirst({
    where: { id: clienteId, escritorioId: sessao.escritorioId },
    select: { id: true },
  });
  if (!cliente) {
    return NextResponse.json({ erro: "cliente não encontrado" }, { status: 404 });
  }

  // Lê o arquivo como texto UTF-8 (SPED oficial é ASCII; UTF-8 cobre + acentos eventuais).
  const conteudo = await arquivo.text();

  const resultado = await importarSped({
    clienteId,
    nomeArquivo: arquivo.name,
    conteudo,
    importadoPor: sessao.userId,
  });

  return NextResponse.json(resultado, { status: resultado.sucesso ? 200 : 422 });
}
