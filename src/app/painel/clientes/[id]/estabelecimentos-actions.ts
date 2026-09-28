"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireSessao, PAPEIS_INTERNOS } from "@/lib/auth";
import { cifrar } from "@/lib/crypto";
import { preencherDaPlanilha, type ResultadoPlanilha } from "@/lib/planilha-cadastro";

/**
 * Botão "Buscar na planilha" da ficha: preenche o que estiver vazio no
 * cadastro (matriz e filiais) com a planilha de cadastro do escritório.
 * Só roda quando o usuário clica.
 */
export async function buscarNaPlanilhaAction(
  clienteId: string,
  _anterior: ResultadoPlanilha | null,
): Promise<ResultadoPlanilha> {
  const s = await requireSessao();
  if (!PAPEIS_INTERNOS.includes(s.papel)) redirect("/painel");
  const existe = await prisma.cliente.findFirst({
    where: { id: clienteId, escritorioId: s.escritorioId },
    select: { id: true },
  });
  if (!existe) return { ok: false, mensagem: "Cliente não encontrado.", estabelecimentos: [] };

  const resultado = await preencherDaPlanilha(clienteId);
  revalidatePath(`/painel/clientes/${clienteId}`, "layout");
  return resultado;
}

/**
 * Grava a senha do portal da SEFAZ-TO de uma FILIAL (login por IE, então é
 * por estabelecimento). A da matriz continua no "editar cadastro" do cliente.
 *
 * A senha chega do formulário, é cifrada aqui (AES-256-GCM) e nunca volta pra
 * tela nem pra log. Campo vazio não apaga a senha já gravada.
 */
export async function salvarSenhaSefazEstabelecimentoAction(
  clienteId: string,
  estabelecimentoId: string,
  fd: FormData,
) {
  const s = await requireSessao();
  if (!PAPEIS_INTERNOS.includes(s.papel)) redirect("/painel");

  const estab = await prisma.estabelecimento.findFirst({
    where: { id: estabelecimentoId, clienteId, cliente: { escritorioId: s.escritorioId } },
    select: { id: true, numero: true },
  });
  if (!estab || estab.numero === 0) return;

  const senha = String(fd.get("senhaSefaz") ?? "").trim();
  if (!senha) return;

  await prisma.estabelecimento.update({
    where: { id: estab.id },
    data: { senhaSefaz: cifrar(senha) },
  });
  revalidatePath(`/painel/clientes/${clienteId}`, "layout");
}
