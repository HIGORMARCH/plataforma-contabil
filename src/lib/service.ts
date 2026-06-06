/**
 * Camada de serviço: ponte entre o banco (Prisma) e o motor contábil.
 */

import { prisma } from "./db";
import { analisar, type ResultadoAnalise } from "./accounting/analyze";
import type { DemonstrativosExercicio } from "./accounting/types";

export function parseExercicio(dadosJson: string): DemonstrativosExercicio {
  return JSON.parse(dadosJson) as DemonstrativosExercicio;
}

/** Carrega os exercícios de um cliente já desserializados e ordenados por ano. */
export async function carregarExercicios(clienteId: string): Promise<DemonstrativosExercicio[]> {
  const regs = await prisma.exercicio.findMany({
    where: { clienteId },
    orderBy: { ano: "asc" },
  });
  return regs.map((r) => parseExercicio(r.dadosJson));
}

/** Roda a análise completa de um cliente, ou null se não houver dados. */
export async function analisarCliente(clienteId: string): Promise<ResultadoAnalise | null> {
  const exercicios = await carregarExercicios(clienteId);
  if (exercicios.length === 0) return null;
  return analisar(exercicios);
}

export interface ResumoCliente {
  id: string;
  razaoSocial: string;
  nomeFantasia: string | null;
  regimeTributario: string | null;
  setorAtividade: string | null;
  contadorResponsavel: string | null;
  anos: number[];
  situacao: ResultadoAnalise["situacao"] | "sem_dados";
  bloqueado: boolean;
  criticos: number;
}

export async function resumoClientes(escritorioId: string): Promise<ResumoCliente[]> {
  const clientes = await prisma.cliente.findMany({
    where: { escritorioId },
    include: { exercicios: { orderBy: { ano: "asc" } } },
    orderBy: { razaoSocial: "asc" },
  });

  return clientes.map((c) => {
    const exercicios = c.exercicios.map((e) => parseExercicio(e.dadosJson));
    let situacao: ResumoCliente["situacao"] = "sem_dados";
    let bloqueado = false;
    let criticos = 0;
    if (exercicios.length > 0) {
      const a = analisar(exercicios);
      situacao = a.situacao;
      bloqueado = a.bloqueado;
      criticos = a.resumo.critico;
    }
    return {
      id: c.id,
      razaoSocial: c.razaoSocial,
      nomeFantasia: c.nomeFantasia,
      regimeTributario: c.regimeTributario,
      setorAtividade: c.setorAtividade,
      contadorResponsavel: c.contadorResponsavel,
      anos: exercicios.map((e) => e.ano),
      situacao,
      bloqueado,
      criticos,
    };
  });
}
