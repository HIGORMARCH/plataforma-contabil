import { prisma } from "@/lib/db";

/**
 * Estabelecimentos do cadastro (matriz + filiais) — ver model Estabelecimento.
 *
 * Fonte dos dados da MATRIZ: o próprio Cliente. CNPJ, IE, senha SEFAZ e
 * vigência da IE da matriz são editados no cadastro do cliente, então a linha
 * MATRIZ da tabela Estabelecimento é só a âncora do vínculo das apurações —
 * aqui os campos dela são lidos do Cliente, pra não existir duas cópias que
 * possam divergir. Das FILIAIS, os dados vêm da própria linha.
 */

const soDigitos = (s: string | null | undefined) => (s ?? "").replace(/\D/g, "");

export interface EstabelecimentoInfo {
  id: string;
  tipo: "MATRIZ" | "FILIAL";
  numero: number;
  cnpj: string; // só dígitos
  inscricaoEstadual: string | null;
  uf: string | null;
  municipio: string | null;
  pastaLocal: string | null;
  senhaSefaz: string | null; // cifrada
  ieInicio: Date | null;
  ieFim: Date | null;
  rotulo: string; // "Matriz" | "Filial 01" ...
}

export function rotuloEstabelecimento(e: { tipo: string; numero: number }): string {
  return e.tipo === "MATRIZ" ? "Matriz" : `Filial ${String(e.numero).padStart(2, "0")}`;
}

/**
 * Garante o estabelecimento MATRIZ do cliente (cria se faltar — cadastro novo
 * nasce sem ele) e devolve o id.
 */
export async function garantirMatriz(clienteId: string): Promise<string> {
  const existente = await prisma.estabelecimento.findUnique({
    where: { clienteId_numero: { clienteId, numero: 0 } },
    select: { id: true },
  });
  if (existente) return existente.id;

  const c = await prisma.cliente.findUniqueOrThrow({
    where: { id: clienteId },
    select: { cnpj: true, inscricaoEstadual: true, uf: true, municipio: true },
  });
  const criado = await prisma.estabelecimento.upsert({
    where: { clienteId_numero: { clienteId, numero: 0 } },
    create: {
      clienteId,
      tipo: "MATRIZ",
      numero: 0,
      cnpj: soDigitos(c.cnpj),
      inscricaoEstadual: c.inscricaoEstadual,
      uf: c.uf,
      municipio: c.municipio,
    },
    update: {},
    select: { id: true },
  });
  return criado.id;
}

/** Todos os estabelecimentos do cliente, matriz primeiro, com a matriz lida do Cliente. */
export async function listarEstabelecimentos(clienteId: string): Promise<EstabelecimentoInfo[]> {
  await garantirMatriz(clienteId);
  const [c, linhas] = await Promise.all([
    prisma.cliente.findUniqueOrThrow({
      where: { id: clienteId },
      select: {
        cnpj: true,
        inscricaoEstadual: true,
        uf: true,
        municipio: true,
        pastaLocal: true,
        senhaSefaz: true,
        ieInicio: true,
        ieFim: true,
      },
    }),
    prisma.estabelecimento.findMany({ where: { clienteId }, orderBy: { numero: "asc" } }),
  ]);

  return linhas.map((e) => {
    const matriz = e.numero === 0;
    return {
      id: e.id,
      tipo: matriz ? "MATRIZ" : "FILIAL",
      numero: e.numero,
      cnpj: matriz ? soDigitos(c.cnpj) : soDigitos(e.cnpj),
      inscricaoEstadual: matriz ? c.inscricaoEstadual : e.inscricaoEstadual,
      uf: matriz ? c.uf : e.uf,
      municipio: matriz ? c.municipio : e.municipio,
      pastaLocal: matriz ? c.pastaLocal : e.pastaLocal,
      senhaSefaz: matriz ? c.senhaSefaz : e.senhaSefaz,
      ieInicio: matriz ? c.ieInicio : e.ieInicio,
      ieFim: matriz ? c.ieFim : e.ieFim,
      rotulo: rotuloEstabelecimento(e),
    };
  });
}

export async function obterEstabelecimento(
  clienteId: string,
  estabelecimentoId: string,
): Promise<EstabelecimentoInfo | null> {
  const todos = await listarEstabelecimentos(clienteId);
  return todos.find((e) => e.id === estabelecimentoId) ?? null;
}

/** Estabelecimento do cadastro cujo CNPJ é o do arquivo (null = não pertence ao cadastro). */
export async function acharPorCnpj(clienteId: string, cnpj: string): Promise<EstabelecimentoInfo | null> {
  const alvo = soDigitos(cnpj);
  if (!alvo) return null;
  const todos = await listarEstabelecimentos(clienteId);
  return todos.find((e) => e.cnpj === alvo) ?? null;
}

/** Estabelecimento do cadastro cuja IE é a do arquivo (null = nenhuma IE bate). */
export async function acharPorIe(clienteId: string, ie: string): Promise<EstabelecimentoInfo | null> {
  const alvo = soDigitos(ie);
  if (!alvo) return null;
  const todos = await listarEstabelecimentos(clienteId);
  return todos.find((e) => soDigitos(e.inscricaoEstadual) === alvo) ?? null;
}
