"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireSessao, PAPEIS_INTERNOS } from "@/lib/auth";
import { gerarToken } from "@/lib/rastreio";

async function carregar(id: string, escritorioId: string) {
  const r = await prisma.relatorio.findFirst({
    where: { id, cliente: { escritorioId } },
  });
  if (!r) redirect("/painel/relatorios");
  return r;
}

/** Contador edita a conclusão e o comentário antes de aprovar. */
export async function salvarRevisaoAction(id: string, fd: FormData) {
  const s = await requireSessao();
  if (!PAPEIS_INTERNOS.includes(s.papel)) redirect("/painel");
  const r = await carregar(id, s.escritorioId);

  const conteudo = JSON.parse(r.conteudoJson);
  const novaConclusao = String(fd.get("conclusao") ?? "")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  if (novaConclusao.length > 0) conteudo.texto.conclusao = novaConclusao;

  await prisma.relatorio.update({
    where: { id },
    data: {
      conteudoJson: JSON.stringify(conteudo),
      comentarioContador: String(fd.get("comentario") ?? "").trim() || null,
    },
  });
  revalidatePath(`/painel/relatorios/${id}`);
  redirect(`/painel/relatorios/${id}`);
}

export async function aprovarRelatorioAction(id: string) {
  const s = await requireSessao();
  if (s.papel !== "CONTADOR" && s.papel !== "ADMIN") redirect(`/painel/relatorios/${id}`);
  const r = await carregar(id, s.escritorioId);
  if (r.bloqueado) redirect(`/painel/relatorios/${id}?erro=bloqueado`);

  await prisma.relatorio.update({
    where: { id },
    data: { status: "APROVADO", aprovadoPor: `${s.nome}`, aprovadoEm: new Date() },
  });
  await prisma.logAcesso.create({
    data: { acao: "RELATORIO_APROVADO", detalhe: id, usuarioId: s.userId },
  });
  revalidatePath("/painel");
  redirect(`/painel/relatorios/${id}`);
}

export async function reprovarRelatorioAction(id: string) {
  const s = await requireSessao();
  if (!PAPEIS_INTERNOS.includes(s.papel)) redirect("/painel");
  await carregar(id, s.escritorioId);
  await prisma.relatorio.update({
    where: { id },
    data: { status: "EM_ANALISE", aprovadoPor: null, aprovadoEm: null },
  });
  revalidatePath("/painel");
  redirect(`/painel/relatorios/${id}`);
}

export async function liberarRelatorioAction(id: string) {
  const s = await requireSessao();
  if (s.papel !== "CONTADOR" && s.papel !== "ADMIN") redirect(`/painel/relatorios/${id}`);
  const r = await carregar(id, s.escritorioId);
  if (r.status !== "APROVADO") redirect(`/painel/relatorios/${id}`);

  await prisma.relatorio.update({
    where: { id },
    data: { status: "LIBERADO", liberadoEm: new Date() },
  });
  await prisma.logAcesso.create({
    data: { acao: "RELATORIO_LIBERADO", detalhe: id, usuarioId: s.userId },
  });
  revalidatePath("/painel");
  redirect(`/painel/relatorios/${id}`);
}

/** Gera (ou mantém) o link rastreável do relatório. */
export async function gerarLinkRastreavelAction(id: string) {
  const s = await requireSessao();
  if (!PAPEIS_INTERNOS.includes(s.papel)) redirect("/painel");
  const r = await carregar(id, s.escritorioId);
  if (!r.shareToken) {
    await prisma.relatorio.update({ where: { id }, data: { shareToken: gerarToken() } });
    await prisma.logAcesso.create({
      data: { acao: "LINK_RASTREAVEL_GERADO", detalhe: id, usuarioId: s.userId },
    });
  }
  revalidatePath(`/painel/relatorios/${id}`);
  redirect(`/painel/relatorios/${id}`);
}

export async function excluirRelatorioAction(id: string) {
  const s = await requireSessao();
  if (!PAPEIS_INTERNOS.includes(s.papel)) redirect("/painel");
  await carregar(id, s.escritorioId);
  await prisma.relatorio.delete({ where: { id } });
  revalidatePath("/painel");
  redirect("/painel/relatorios");
}
