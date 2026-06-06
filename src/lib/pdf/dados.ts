/** Monta os dados do PDF a partir do banco (reutilizado pelas rotas de PDF). */

import { prisma } from "@/lib/db";
import type { DadosPdf } from "./relatorioPdf";
import type { ResultadoAnalise } from "@/lib/accounting/analyze";
import type { RelatorioTexto } from "@/lib/accounting/narrative";

export async function montarDadosPdf(relatorioId: string): Promise<DadosPdf | null> {
  const r = await prisma.relatorio.findUnique({
    where: { id: relatorioId },
    include: { cliente: true },
  });
  if (!r) return null;
  const escritorio = await prisma.escritorio.findUnique({ where: { id: r.cliente.escritorioId } });
  if (!escritorio) return null;

  const conteudo = JSON.parse(r.conteudoJson) as {
    geradoEm: string;
    analise: ResultadoAnalise;
    texto: RelatorioTexto;
  };
  const exReg = await prisma.exercicio.findMany({ where: { clienteId: r.clienteId } });
  const docs = exReg.flatMap((e) => (e.documentos ? (JSON.parse(e.documentos) as string[]) : []));

  return {
    escritorio: {
      razaoSocial: escritorio.razaoSocial,
      nomeFantasia: escritorio.nomeFantasia,
      cnpj: escritorio.cnpj,
      crc: escritorio.crc,
      endereco: escritorio.endereco,
      telefone: escritorio.telefone,
      email: escritorio.email,
      site: escritorio.site,
      logoDataUrl: escritorio.logoDataUrl,
      assinaturaDataUrl: escritorio.assinaturaDataUrl,
      corPrimaria: escritorio.corPrimaria,
      corSecundaria: escritorio.corSecundaria,
      rodapePadrao: escritorio.rodapePadrao,
    },
    cliente: {
      razaoSocial: r.cliente.razaoSocial,
      cnpj: r.cliente.cnpj,
      cnaePrincipal: r.cliente.cnaePrincipal,
      regimeTributario: r.cliente.regimeTributario,
      porte: r.cliente.porte,
      contadorResponsavel: r.cliente.contadorResponsavel,
      crcContador: r.cliente.crcContador,
    },
    relatorio: {
      titulo: r.titulo,
      periodo: r.periodo,
      situacao: r.situacao ?? "inconclusiva",
      bloqueado: r.bloqueado,
      aprovadoPor: r.aprovadoPor,
      geradoEm: conteudo.geradoEm,
    },
    texto: conteudo.texto,
    analise: conteudo.analise,
    documentos: Array.from(new Set(docs)),
  };
}
