import { requireSessao } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { redirect } from "next/navigation";
import { salvarPapelTimbradoAction, salvarCredencialEconetAction } from "./actions";

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

      {/* Formulário separado: credencial não viaja junto com papel timbrado. */}
      <form action={salvarCredencialEconetAction} className="mt-8">
        <section className="card p-5">
          <h2 className="mb-1 text-sm font-bold uppercase tracking-wide text-slate-500">
            Credencial Econet
          </h2>
          <p className="mb-4 max-w-[70ch] text-xs text-slate-500">
            Usada na consulta de tributação por NCM. A senha é cifrada antes de ir pro banco e
            nunca volta pra esta tela.
          </p>

          <div className="mb-4 rounded border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
            <b>O login da Econet exige CAPTCHA</b>, então não dá pra autenticar sozinho. Cadastrar
            aqui faz o robô pré-preencher usuário e senha — resta a você só resolver o desafio.
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="label" htmlFor="econetUsuario">Código do cliente</label>
              <input
                id="econetUsuario"
                name="econetUsuario"
                className="input"
                defaultValue={e?.econetUsuario ?? ""}
                autoComplete="off"
              />
            </div>
            <div>
              <label className="label" htmlFor="econetSenha">Senha</label>
              <input
                id="econetSenha"
                name="econetSenha"
                type="password"
                className="input"
                placeholder={e?.econetSenha ? "•••••••• (cadastrada)" : "Digite a senha"}
                autoComplete="new-password"
              />
              <p className="mt-1 text-xs text-slate-400">
                {e?.econetSenha
                  ? "Deixe em branco para manter a senha atual."
                  : "Nenhuma senha cadastrada ainda."}
              </p>
            </div>
          </div>

          <p className="mt-4 text-xs text-slate-500">
            Sessão renovada pela última vez:{" "}
            <b>
              {e?.econetSessaoEm
                ? e.econetSessaoEm.toLocaleString("pt-BR")
                : "nunca registrada nesta tela"}
            </b>
            . Uma sessão vencida faz a Econet responder &quot;NCM não encontrado&quot; em toda
            consulta — a mesma mensagem de NCM inexistente, por isso a falha passa despercebida.
          </p>

          <div className="mt-4 flex justify-end">
            <button type="submit" className="btn btn-primary">Salvar credencial</button>
          </div>
        </section>
      </form>
    </div>
  );
}
