"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireSessao, PAPEIS_INTERNOS } from "@/lib/auth";
import { importarRaicmsSiagri, type ResultadoImportacaoRaicms } from "@/lib/siagri/importarRaicms";

export interface ResultadoUploadRaicms {
  itens: Array<{ arquivo: string } & ResultadoImportacaoRaicms>;
}

/**
 * Upload do RAICMS (Livro de Apuração do ICMS) do Siagri — um ou vários PDFs.
 * Cada livro vai para o estabelecimento do CNPJ impresso nele; o PDF é lido e
 * descartado.
 */
export async function importarRaicmsSiagriAction(
  clienteId: string,
  _anterior: ResultadoUploadRaicms | null,
  fd: FormData,
): Promise<ResultadoUploadRaicms> {
  const s = await requireSessao();
  if (!PAPEIS_INTERNOS.includes(s.papel)) redirect("/painel");
  const existe = await prisma.cliente.findFirst({
    where: { id: clienteId, escritorioId: s.escritorioId },
    select: { id: true },
  });
  if (!existe) return { itens: [] };

  const itens: ResultadoUploadRaicms["itens"] = [];
  for (const v of fd.getAll("arquivos")) {
    if (!(v instanceof File) || v.size === 0) continue;
    const r = await importarRaicmsSiagri({
      clienteId,
      nomeArquivo: v.name,
      pdf: Buffer.from(await v.arrayBuffer()),
      importadoPor: s.userId,
    });
    itens.push({ arquivo: v.name, ...r });
  }
  revalidatePath(`/painel/clientes/${clienteId}`, "layout");
  return { itens };
}
