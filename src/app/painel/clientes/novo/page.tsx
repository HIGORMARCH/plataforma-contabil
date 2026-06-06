import Link from "next/link";
import { requirePapel, PAPEIS_INTERNOS } from "@/lib/auth";
import { BuscarCNPJ } from "@/components/BuscarCNPJ";
import { criarClienteAction } from "../actions";

function Campo({
  nome,
  label,
  obrigatorio,
  placeholder,
}: {
  nome: string;
  label: string;
  obrigatorio?: boolean;
  placeholder?: string;
}) {
  return (
    <div>
      <label className="label" htmlFor={nome}>
        {label} {obrigatorio && <span className="text-red-500">*</span>}
      </label>
      <input id={nome} name={nome} className="input" placeholder={placeholder} required={obrigatorio} />
    </div>
  );
}

export default async function NovoClientePage({
  searchParams,
}: {
  searchParams: Promise<{ erro?: string }>;
}) {
  await requirePapel(PAPEIS_INTERNOS);
  const { erro } = await searchParams;

  return (
    <div>
      <div className="mb-6">
        <Link href="/painel/clientes" className="text-sm text-slate-500 hover:underline">
          ← Voltar para clientes
        </Link>
        <h1 className="mt-1 text-2xl font-bold text-slate-800">Novo Cliente</h1>
        <p className="text-sm text-slate-500">Dados cadastrais e tributários da empresa analisada.</p>
      </div>

      {erro && (
        <div className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          Preencha ao menos a razão social e o CNPJ.
        </div>
      )}

      <form action={criarClienteAction} className="space-y-6">
        <section className="card p-5">
          <h2 className="mb-4 text-sm font-bold uppercase tracking-wide text-slate-500">Identificação</h2>
          <div className="mb-4 rounded-lg border border-[var(--brand-2)] bg-[var(--brand-2-soft)] p-3 text-xs text-slate-600">
            💡 Digite o CNPJ e clique em <b>Buscar na Receita</b> para preencher automaticamente os
            dados cadastrais. Depois é só conferir e completar.
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="md:col-span-2">
              <BuscarCNPJ />
            </div>
            <Campo nome="razaoSocial" label="Razão social" obrigatorio />
            <Campo nome="nomeFantasia" label="Nome fantasia" />
            <Campo nome="naturezaJuridica" label="Natureza jurídica" />
            <Campo nome="inscricaoEstadual" label="Inscrição estadual" />
            <Campo nome="inscricaoMunicipal" label="Inscrição municipal" />
            <Campo nome="cnaePrincipal" label="CNAE principal" />
            <div>
              <label className="label" htmlFor="setorAtividade">Setor de atividade</label>
              <select id="setorAtividade" name="setorAtividade" className="input capitalize">
                <option value="">Selecione...</option>
                {["comercio", "industria", "servico", "rural", "holding", "construcao", "outro"].map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>
          </div>
        </section>

        <section className="card p-5">
          <h2 className="mb-4 text-sm font-bold uppercase tracking-wide text-slate-500">Tributação e porte</h2>
          <div className="grid gap-4 md:grid-cols-3">
            <div>
              <label className="label" htmlFor="regimeTributario">Regime tributário</label>
              <select id="regimeTributario" name="regimeTributario" className="input">
                <option value="">Selecione...</option>
                {["Simples Nacional", "Lucro Presumido", "Lucro Real", "MEI"].map((r) => (
                  <option key={r} value={r}>{r}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="label" htmlFor="porte">Porte</label>
              <select id="porte" name="porte" className="input">
                <option value="">Selecione...</option>
                {["ME", "EPP", "Demais"].map((p) => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </select>
            </div>
            <Campo nome="municipio" label="Município" />
            <Campo nome="uf" label="UF" placeholder="SP" />
          </div>
        </section>

        <section className="card p-5">
          <h2 className="mb-4 text-sm font-bold uppercase tracking-wide text-slate-500">Responsáveis e contato</h2>
          <div className="grid gap-4 md:grid-cols-2">
            <Campo nome="responsavelLegal" label="Responsável legal" />
            <Campo nome="contadorResponsavel" label="Contador responsável" />
            <Campo nome="crcContador" label="CRC do contador" />
            <Campo nome="email" label="E-mail" />
            <Campo nome="telefone" label="Telefone" />
          </div>
        </section>

        <div className="flex justify-end gap-3">
          <Link href="/painel/clientes" className="btn btn-ghost">Cancelar</Link>
          <button type="submit" className="btn btn-primary">Salvar cliente</button>
        </div>
      </form>
    </div>
  );
}
