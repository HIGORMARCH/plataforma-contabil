"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { existsSync, statSync } from "node:fs";
import { prisma } from "@/lib/db";
import { requireSessao, PAPEIS_INTERNOS } from "@/lib/auth";

/**
 * Cadastro dos endereços que o robô varre, e a execução dele.
 *
 * O caminho é validado NA HORA de cadastrar: pasta que não existe vira erro
 * agora, não surpresa na primeira varredura.
 */

async function exigirInterno() {
  const sessao = await requireSessao();
  if (!PAPEIS_INTERNOS.includes(sessao.papel)) {
    throw new Error("acesso restrito a papéis internos");
  }
  return sessao;
}

/**
 * Server action de <form>: não pode devolver valor. Erro volta pela URL
 * (`?erro=`), que a própria página exibe.
 */
export async function adicionarOrigemAction(fd: FormData) {
  const sessao = await exigirInterno();

  const nome = String(fd.get("nome") ?? "").trim();
  const caminho = String(fd.get("caminho") ?? "").trim();
  const recursivo = String(fd.get("recursivo") ?? "1") === "1";
  const clienteId = String(fd.get("clienteId") ?? "").trim() || null;

  const falhar = (msg: string): never =>
    redirect(`/painel/organizador?erro=${encodeURIComponent(msg)}`);

  if (!nome || !caminho) falhar("Informe um nome e o caminho da pasta.");

  try {
    if (!existsSync(caminho) || !statSync(caminho).isDirectory()) {
      falhar(`"${caminho}" não existe ou não é uma pasta.`);
    }
  } catch (e) {
    // `redirect` lança por dentro — não pode ser engolido por este catch.
    if (e instanceof Error && e.message.includes("NEXT_REDIRECT")) throw e;
    falhar(`Não consegui ler "${caminho}": ${e instanceof Error ? e.message : String(e)}`);
  }

  try {
    await prisma.origemArquivo.create({
      data: {
        escritorioId: sessao.escritorioId,
        nome,
        caminho,
        recursivo,
        clienteId,
      },
    });
  } catch {
    falhar("Esse caminho já está cadastrado.");
  }

  revalidatePath("/painel/organizador");
}

export async function alternarOrigemAction(id: string) {
  const sessao = await exigirInterno();
  const origem = await prisma.origemArquivo.findFirst({
    where: { id, escritorioId: sessao.escritorioId },
  });
  if (!origem) return;
  await prisma.origemArquivo.update({ where: { id }, data: { ativo: !origem.ativo } });
  revalidatePath("/painel/organizador");
}

export async function removerOrigemAction(id: string) {
  const sessao = await exigirInterno();
  await prisma.origemArquivo.deleteMany({ where: { id, escritorioId: sessao.escritorioId } });
  revalidatePath("/painel/organizador");
}
