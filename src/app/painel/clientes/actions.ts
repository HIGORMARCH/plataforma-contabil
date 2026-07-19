"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireSessao, PAPEIS_INTERNOS } from "@/lib/auth";
import { cifrar } from "@/lib/crypto";

function campo(fd: FormData, nome: string): string | null {
  const v = fd.get(nome);
  const s = v == null ? "" : String(v).trim();
  return s === "" ? null : s;
}

export async function criarClienteAction(fd: FormData) {
  const sessao = await requireSessao();
  if (!PAPEIS_INTERNOS.includes(sessao.papel)) redirect("/painel");

  const razaoSocial = campo(fd, "razaoSocial");
  const cnpj = campo(fd, "cnpj");
  if (!razaoSocial || !cnpj) {
    redirect("/painel/clientes/novo?erro=1");
  }

  const metodoAcessoEcac = campo(fd, "metodoAcessoEcac") ?? "PROCURACAO_MARCH";
  const certificadoCaminho = metodoAcessoEcac === "CERTIFICADO_PROPRIO" ? campo(fd, "certificadoCaminho") : null;
  const senhaClara = metodoAcessoEcac === "CERTIFICADO_PROPRIO" ? campo(fd, "certificadoSenha") : null;
  const certificadoSenha = senhaClara ? cifrar(senhaClara) : null;

  const cliente = await prisma.cliente.create({
    data: {
      razaoSocial: razaoSocial!,
      cnpj: cnpj!,
      nomeFantasia: campo(fd, "nomeFantasia"),
      inscricaoEstadual: campo(fd, "inscricaoEstadual"),
      inscricaoMunicipal: campo(fd, "inscricaoMunicipal"),
      cnaePrincipal: campo(fd, "cnaePrincipal"),
      regimeTributario: campo(fd, "regimeTributario"),
      porte: campo(fd, "porte"),
      naturezaJuridica: campo(fd, "naturezaJuridica"),
      municipio: campo(fd, "municipio"),
      uf: campo(fd, "uf"),
      setorAtividade: campo(fd, "setorAtividade"),
      responsavelLegal: campo(fd, "responsavelLegal"),
      contadorResponsavel: campo(fd, "contadorResponsavel"),
      crcContador: campo(fd, "crcContador"),
      email: campo(fd, "email"),
      telefone: campo(fd, "telefone"),
      metodoAcessoEcac,
      certificadoCaminho,
      certificadoSenha,
      escritorioId: sessao.escritorioId,
    },
  });

  await prisma.logAcesso.create({
    data: { acao: "CLIENTE_CRIADO", detalhe: `${razaoSocial}`, usuarioId: sessao.userId },
  });

  revalidatePath("/painel");
  redirect(`/painel/clientes/${cliente.id}`);
}

export async function editarClienteAction(id: string, fd: FormData) {
  const sessao = await requireSessao();
  if (!PAPEIS_INTERNOS.includes(sessao.papel)) redirect("/painel");

  const razaoSocial = campo(fd, "razaoSocial");
  const cnpj = campo(fd, "cnpj");
  if (!razaoSocial || !cnpj) {
    redirect(`/painel/clientes/${id}/editar?erro=1`);
  }

  const clienteExistente = await prisma.cliente.findFirst({
    where: { id, escritorioId: sessao.escritorioId },
  });
  if (!clienteExistente) redirect("/painel/clientes");

  const metodoAcessoEcac = campo(fd, "metodoAcessoEcac") ?? "PROCURACAO_MARCH";
  const certificadoCaminho = metodoAcessoEcac === "CERTIFICADO_PROPRIO" ? campo(fd, "certificadoCaminho") : null;
  // Se veio senha nova, cifra. Se veio vazia, mantém a antiga.
  const senhaClara = metodoAcessoEcac === "CERTIFICADO_PROPRIO" ? campo(fd, "certificadoSenha") : null;
  const certificadoSenha = senhaClara
    ? cifrar(senhaClara)
    : metodoAcessoEcac === "CERTIFICADO_PROPRIO"
      ? clienteExistente.certificadoSenha
      : null;

  await prisma.cliente.update({
    where: { id },
    data: {
      razaoSocial: razaoSocial!,
      cnpj: cnpj!,
      nomeFantasia: campo(fd, "nomeFantasia"),
      inscricaoEstadual: campo(fd, "inscricaoEstadual"),
      inscricaoMunicipal: campo(fd, "inscricaoMunicipal"),
      cnaePrincipal: campo(fd, "cnaePrincipal"),
      regimeTributario: campo(fd, "regimeTributario"),
      porte: campo(fd, "porte"),
      naturezaJuridica: campo(fd, "naturezaJuridica"),
      municipio: campo(fd, "municipio"),
      uf: campo(fd, "uf"),
      setorAtividade: campo(fd, "setorAtividade"),
      responsavelLegal: campo(fd, "responsavelLegal"),
      contadorResponsavel: campo(fd, "contadorResponsavel"),
      crcContador: campo(fd, "crcContador"),
      email: campo(fd, "email"),
      telefone: campo(fd, "telefone"),
      metodoAcessoEcac,
      certificadoCaminho,
      certificadoSenha,
    },
  });

  await prisma.logAcesso.create({
    data: { acao: "CLIENTE_EDITADO", detalhe: `${razaoSocial}`, usuarioId: sessao.userId },
  });

  revalidatePath("/painel");
  redirect(`/painel/clientes/${id}`);
}

export async function excluirClienteAction(fd: FormData) {
  const sessao = await requireSessao();
  if (sessao.papel !== "ADMIN") redirect("/painel");
  const id = String(fd.get("id"));
  await prisma.cliente.delete({ where: { id } });
  await prisma.logAcesso.create({
    data: { acao: "CLIENTE_EXCLUIDO", detalhe: id, usuarioId: sessao.userId },
  });
  revalidatePath("/painel");
  redirect("/painel/clientes");
}
