import { requireSessao } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { redirect } from "next/navigation";
import { salvarPapelTimbradoAction } from "./actions";

function Campo({ nome, label, valor, placeholder }: { nome: string; label: string; valor?: string | null; placeholder?: string }) {
  return (
    <div>
      <label className="label" htmlFor={nome}>{label}</label>
      <input id={nome} name={nome} className="input" defaultValue={valor ?? ""} placeholder={placeholder} />
    </div>
  );
}

export default async function ConfiguracoesPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string }>;
}) {
  const sessao = await requireSessao();
  if (sessao.papel !== "ADMIN") redirect("/painel");
  const { ok } = await searchParams;
  const e = await prisma.escritorio.findUnique({ where: { id: sessao.escritorioId } });

  return (
    <div>
      <header className="mb-6">
        <h1 className="text-2xl font-bold text-slate-800">Papel timbrado</h1>
        <p className="text-sm text-slate-500">
          Configure a identidade do escritório usada nos relatórios em PDF.
        </p>
      </header>

      {ok && (
        <div className="mb-4 rounded-lg bg-green-50 px-3 py-2 text-sm text-green-700">
          Configurações salvas com sucesso.
        </div>
      )}

      <form action={salvarPapelTimbradoAction} className="space-y-6">
        <section className="card p-5">
          <h2 className="mb-4 text-sm font-bold uppercase tracking-wide text-slate-500">Dados do escritório</h2>
          <div className="grid gap-4 md:grid-cols-2">
            <Campo nome="razaoSocial" label="Razão social" valor={e?.razaoSocial} />
            <Campo nome="nomeFantasia" label="Nome fantasia" valor={e?.nomeFantasia} />
            <Campo nome="cnpj" label="CNPJ" valor={e?.cnpj} />
            <Campo nome="crc" label="CRC" valor={e?.crc} />
            <Campo nome="endereco" label="Endereço" valor={e?.endereco} />
            <Campo nome="telefone" label="Telefone" valor={e?.telefone} />
            <Campo nome="email" label="E-mail" valor={e?.email} />
            <Campo nome="site" label="Site" valor={e?.site} />
          </div>
        </section>

        <section className="card p-5">
          <h2 className="mb-4 text-sm font-bold uppercase tracking-wide text-slate-500">Identidade visual</h2>
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="label" htmlFor="corPrimaria">Cor primária</label>
              <input id="corPrimaria" name="corPrimaria" type="color" className="input h-11" defaultValue={e?.corPrimaria ?? "#1e3a5f"} />
            </div>
            <div>
              <label className="label" htmlFor="corSecundaria">Cor secundária</label>
              <input id="corSecundaria" name="corSecundaria" type="color" className="input h-11" defaultValue={e?.corSecundaria ?? "#2c7a7b"} />
            </div>
            <div>
              <label className="label" htmlFor="logo">Logomarca (PNG/JPG até 1,5 MB)</label>
              <input id="logo" name="logo" type="file" accept="image/*" className="input" />
              {e?.logoDataUrl && <p className="mt-1 text-xs text-green-600">✓ Logomarca configurada</p>}
            </div>
            <div>
              <label className="label" htmlFor="assinatura">Assinatura digitalizada</label>
              <input id="assinatura" name="assinatura" type="file" accept="image/*" className="input" />
              {e?.assinaturaDataUrl && <p className="mt-1 text-xs text-green-600">✓ Assinatura configurada</p>}
            </div>
          </div>
        </section>

        <section className="card p-5">
          <h2 className="mb-4 text-sm font-bold uppercase tracking-wide text-slate-500">Rodapé padrão</h2>
          <textarea
            name="rodapePadrao"
            rows={2}
            className="input"
            defaultValue={e?.rodapePadrao ?? ""}
            placeholder="Texto exibido no rodapé de todas as páginas dos relatórios."
          />
        </section>

        <div className="flex justify-end">
          <button type="submit" className="btn btn-primary">Salvar configurações</button>
        </div>
      </form>
    </div>
  );
}
