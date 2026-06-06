"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireSessao } from "@/lib/auth";

function txt(fd: FormData, nome: string): string | null {
  const v = String(fd.get(nome) ?? "").trim();
  return v === "" ? null : v;
}

async function arquivoParaDataUrl(file: File | null): Promise<string | null> {
  if (!file || file.size === 0) return null;
  if (file.size > 1_500_000) return null; // limite ~1.5MB
  const buf = Buffer.from(await file.arrayBuffer());
  const mime = file.type || "image/png";
  return `data:${mime};base64,${buf.toString("base64")}`;
}

export async function salvarPapelTimbradoAction(fd: FormData) {
  const sessao = await requireSessao();
  if (sessao.papel !== "ADMIN") redirect("/painel");

  const logo = await arquivoParaDataUrl(fd.get("logo") as File | null);
  const assinatura = await arquivoParaDataUrl(fd.get("assinatura") as File | null);

  await prisma.escritorio.update({
    where: { id: sessao.escritorioId },
    data: {
      razaoSocial: txt(fd, "razaoSocial") ?? "Escritório",
      nomeFantasia: txt(fd, "nomeFantasia"),
      cnpj: txt(fd, "cnpj"),
      crc: txt(fd, "crc"),
      endereco: txt(fd, "endereco"),
      telefone: txt(fd, "telefone"),
      email: txt(fd, "email"),
      site: txt(fd, "site"),
      corPrimaria: txt(fd, "corPrimaria") ?? "#1e3a5f",
      corSecundaria: txt(fd, "corSecundaria") ?? "#2c7a7b",
      rodapePadrao: txt(fd, "rodapePadrao"),
      ...(logo ? { logoDataUrl: logo } : {}),
      ...(assinatura ? { assinaturaDataUrl: assinatura } : {}),
    },
  });

  await prisma.logAcesso.create({
    data: { acao: "PAPEL_TIMBRADO_ATUALIZADO", usuarioId: sessao.userId },
  });
  revalidatePath("/painel/configuracoes");
  redirect("/painel/configuracoes?ok=1");
}
