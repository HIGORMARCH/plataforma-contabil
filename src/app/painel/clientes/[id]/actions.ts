"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireSessao, PAPEIS_INTERNOS } from "@/lib/auth";
import {
  TODOS_CAMPOS,
  montarExercicio,
  parseNumero,
  lerPlanilha,
} from "@/lib/import";
import { carregarExercicios } from "@/lib/service";
import { analisar } from "@/lib/accounting/analyze";
import { gerarRelatorioSimples } from "@/lib/accounting/narrative";
import { refinarRelatorio } from "@/lib/ai/provider";
import type { Maybe } from "@/lib/accounting/types";

async function exigirInterno() {
  const s = await requireSessao();
  if (!PAPEIS_INTERNOS.includes(s.papel)) redirect("/painel");
  return s;
}

async function salvarExercicio(
  clienteId: string,
  ano: number,
  mapa: Record<string, Maybe>,
  documentos: string[],
) {
  const dados = montarExercicio(ano, mapa, documentos);
  await prisma.exercicio.upsert({
    where: { clienteId_ano: { clienteId, ano } },
    create: {
      clienteId,
      ano,
      dadosJson: JSON.stringify(dados),
      documentos: JSON.stringify(documentos),
    },
    update: {
      dadosJson: JSON.stringify(dados),
      documentos: JSON.stringify(documentos),
    },
  });
}

export async function salvarExercicioManualAction(clienteId: string, fd: FormData) {
  const sessao = await exigirInterno();
  const ano = Number(fd.get("ano"));
  if (!ano || ano < 1900 || ano > 2100) redirect(`/painel/clientes/${clienteId}/exercicios?erro=ano`);

  const mapa: Record<string, Maybe> = {};
  for (const c of TODOS_CAMPOS) mapa[c.chave] = parseNumero(fd.get(c.chave));

  const documentos = String(fd.get("documentos") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  await salvarExercicio(clienteId, ano, mapa, documentos);
  await prisma.logAcesso.create({
    data: { acao: "EXERCICIO_SALVO", detalhe: `Cliente ${clienteId} — ${ano}`, usuarioId: sessao.userId },
  });
  revalidatePath(`/painel/clientes/${clienteId}`);
  redirect(`/painel/clientes/${clienteId}`);
}

export async function importarExercicioAction(clienteId: string, fd: FormData) {
  await exigirInterno();
  const ano = Number(fd.get("ano"));
  const arquivo = fd.get("arquivo") as File | null;
  if (!ano || !arquivo || arquivo.size === 0) {
    redirect(`/painel/clientes/${clienteId}/exercicios?erro=arquivo`);
  }
  const buffer = await arquivo!.arrayBuffer();
  let mapa: Record<string, Maybe>;
  try {
    mapa = lerPlanilha(buffer);
  } catch {
    redirect(`/painel/clientes/${clienteId}/exercicios?erro=leitura`);
  }
  await salvarExercicio(clienteId, ano, mapa!, [arquivo!.name]);
  revalidatePath(`/painel/clientes/${clienteId}`);
  redirect(`/painel/clientes/${clienteId}`);
}

export async function excluirExercicioAction(clienteId: string, fd: FormData) {
  await exigirInterno();
  const ano = Number(fd.get("ano"));
  await prisma.exercicio.deleteMany({ where: { clienteId, ano } });
  revalidatePath(`/painel/clientes/${clienteId}`);
  redirect(`/painel/clientes/${clienteId}`);
}

export async function gerarRelatorioAction(clienteId: string) {
  const sessao = await exigirInterno();
  const exercicios = await carregarExercicios(clienteId);
  if (exercicios.length === 0) redirect(`/painel/clientes/${clienteId}`);

  const cliente = await prisma.cliente.findUnique({ where: { id: clienteId } });
  const analise = analisar(exercicios);
  const textoBase = gerarRelatorioSimples(exercicios, analise);
  const anos = analise.cruzamento.anos;
  const refino = await refinarRelatorio(textoBase, {
    cliente: cliente?.razaoSocial ?? "",
    ano: anos[anos.length - 1],
  });

  const periodo = anos.length > 1 ? `${anos[0]} a ${anos[anos.length - 1]}` : `${anos[0]}`;
  const conteudo = {
    geradoEm: new Date().toISOString(),
    analise,
    texto: refino.texto,
  };

  const relatorio = await prisma.relatorio.create({
    data: {
      clienteId,
      periodo,
      status: "AGUARDANDO_REVISAO",
      situacao: analise.situacao,
      bloqueado: analise.bloqueado,
      conteudoJson: JSON.stringify(conteudo),
      origemTexto: refino.origem,
      observacaoIA: refino.observacao,
      criadoPor: sessao.nome,
    },
  });

  await prisma.logAcesso.create({
    data: { acao: "RELATORIO_GERADO", detalhe: relatorio.id, usuarioId: sessao.userId },
  });
  revalidatePath("/painel");
  redirect(`/painel/relatorios/${relatorio.id}`);
}
