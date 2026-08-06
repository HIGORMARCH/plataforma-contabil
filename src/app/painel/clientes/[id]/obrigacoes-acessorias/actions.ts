"use server";

import { revalidatePath } from "next/cache";
import { requireSessao, PAPEIS_INTERNOS } from "@/lib/auth";
import { prisma } from "@/lib/db";
import type { TipoObrigacao } from "@/lib/obrigacoes-acessorias/tipos";

async function garantirEscritorio(clienteId: string) {
  const sessao = await requireSessao();
  if (!PAPEIS_INTERNOS.includes(sessao.papel)) {
    throw new Error("acesso restrito a papéis internos");
  }
  const cliente = await prisma.cliente.findFirst({
    where: { id: clienteId, escritorioId: sessao.escritorioId },
    select: { id: true },
  });
  if (!cliente) throw new Error("cliente não encontrado");
  return sessao;
}

/** Alterna a flag que decide se a seção "Obrigações Acessórias" entra no relatório final. */
export async function alternarIncluirNoRelatorioAction(clienteId: string, formData: FormData) {
  await garantirEscritorio(clienteId);
  const valor = formData.get("incluir") === "1";
  await prisma.cliente.update({
    where: { id: clienteId },
    data: { incluirObrigacoesNoRelatorio: valor },
  });
  revalidatePath(`/painel/clientes/${clienteId}/obrigacoes-acessorias`);
}

/**
 * Registra uma entrega manual pra PGDAS-D / DEFIS / MIT — enquanto v1 não tem
 * robô Portal Simples nem SERPRO PGDASD/MIT ativados.
 */
export async function registrarEntregaManualAction(clienteId: string, formData: FormData) {
  const sessao = await garantirEscritorio(clienteId);

  const tipo = formData.get("tipo") as TipoObrigacao | null;
  const ano = Number(formData.get("ano"));
  const mesRaw = formData.get("mes");
  const mes = mesRaw && String(mesRaw).length > 0 ? Number(mesRaw) : null;
  const dataEntrega = formData.get("dataEntrega") as string | null;
  const numeroRecibo = (formData.get("numeroRecibo") as string | null)?.trim() || null;
  const observacao = (formData.get("observacao") as string | null)?.trim() || null;

  if (!tipo || !["PGDAS_D", "DEFIS", "MIT"].includes(tipo)) {
    throw new Error("tipo inválido — só PGDAS_D, DEFIS e MIT aceitam entrada manual na v1");
  }
  if (!ano || isNaN(ano)) throw new Error("ano obrigatório");
  if (!dataEntrega) throw new Error("dataEntrega obrigatória");

  const data = new Date(dataEntrega + "T00:00:00.000Z");
  if (isNaN(data.getTime())) throw new Error("dataEntrega inválida");

  const existente = await prisma.entregaObrigacaoManual.findFirst({
    where: { clienteId, tipoObrigacao: tipo, ano, mes },
    select: { id: true },
  });

  if (existente) {
    await prisma.entregaObrigacaoManual.update({
      where: { id: existente.id },
      data: {
        dataEntrega: data,
        numeroRecibo,
        observacao,
        registradoPor: sessao.userId,
      },
    });
  } else {
    await prisma.entregaObrigacaoManual.create({
      data: {
        clienteId,
        tipoObrigacao: tipo,
        ano,
        mes,
        dataEntrega: data,
        numeroRecibo,
        observacao,
        registradoPor: sessao.userId,
      },
    });
  }

  revalidatePath(`/painel/clientes/${clienteId}/obrigacoes-acessorias`);
}

/** Remove um registro de entrega manual (permite corrigir engano). */
export async function removerEntregaManualAction(clienteId: string, formData: FormData) {
  await garantirEscritorio(clienteId);
  const id = formData.get("id") as string | null;
  if (!id) throw new Error("id obrigatório");
  await prisma.entregaObrigacaoManual.delete({ where: { id } });
  revalidatePath(`/painel/clientes/${clienteId}/obrigacoes-acessorias`);
}
