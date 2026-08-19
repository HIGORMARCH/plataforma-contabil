import { requireSessao, PAPEIS_INTERNOS } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { redirect } from "next/navigation";
import { SelecaoDossie } from "./_SelecaoDossie";

/**
 * Dossiê do Cliente — monta um documento único com os relatórios escolhidos.
 *
 * Ideia do Higor (19/08/2026): cada módulo tem o seu relatório, e aqui na
 * Auditoria se escolhe quais deles entram no documento que vai pro cliente.
 */
export default async function DossiePage() {
  const sessao = await requireSessao();
  if (!PAPEIS_INTERNOS.includes(sessao.papel)) redirect("/painel");

  const clientes = await prisma.cliente.findMany({
    where: { escritorioId: sessao.escritorioId },
    select: { id: true, razaoSocial: true, cnpj: true },
    orderBy: { razaoSocial: "asc" },
  });

  return (
    <div>
      <header className="mb-6">
        <h1 className="text-2xl font-bold text-slate-800">Dossiê do Cliente</h1>
        <p className="text-sm text-slate-500">
          Escolha o cliente e os relatórios que devem compor o documento de entrega. Sai um arquivo
          só, com capa e uma seção por módulo.
        </p>
      </header>

      {clientes.length === 0 ? (
        <div className="card p-5 text-sm text-slate-600">Nenhum cliente cadastrado ainda.</div>
      ) : (
        <SelecaoDossie clientes={clientes} />
      )}
    </div>
  );
}
