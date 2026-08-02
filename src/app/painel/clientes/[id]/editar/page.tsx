import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePapel, PAPEIS_INTERNOS } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { editarClienteAction } from "../../actions";
import { AcessoEcacFields } from "../../_components/AcessoEcacFields";
import { AcessoSefazFields } from "../../_components/AcessoSefazFields";
import { ExcluirClienteButton } from "../../_components/ExcluirClienteButton";

function Campo({
  nome,
  label,
  obrigatorio,
  placeholder,
  defaultValue,
}: {
  nome: string;
  label: string;
  obrigatorio?: boolean;
  placeholder?: string;
  defaultValue?: string | null;
}) {
  return (
    <div>
      <label className="label" htmlFor={nome}>
        {label} {obrigatorio && <span className="text-red-500">*</span>}
      </label>
      <input
        id={nome}
        name={nome}
        className="input"
        placeholder={placeholder}
        required={obrigatorio}
        defaultValue={defaultValue ?? ""}
      />
    </div>
  );
}

export default async function EditarClientePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ erro?: string }>;
}) {
  const sessao = await requirePapel(PAPEIS_INTERNOS);
  const { id } = await params;
  const { erro } = await searchParams;

  const cliente = await prisma.cliente.findFirst({
    where: { id, escritorioId: sessao.escritorioId },
  });
  if (!cliente) notFound();

  return (
    <div>
      <div className="mb-6">
        <Link href={`/painel/clientes/${id}`} className="text-sm text-slate-500 hover:underline">
          ← Voltar para {cliente.nomeFantasia || cliente.razaoSocial}
        </Link>
        <h1 className="mt-1 text-2xl font-bold text-slate-800">Editar cadastro</h1>
        <p className="text-sm text-slate-500">
          Atualize os dados do cliente. Campos deixados em branco NÃO apagam o valor atual.
        </p>
      </div>

      {erro && (
        <div className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          Razão social e CNPJ são obrigatórios.
        </div>
      )}

      <form action={editarClienteAction.bind(null, id)} className="space-y-6">
        <section className="card p-5">
          <h2 className="mb-4 text-sm font-bold uppercase tracking-wide text-slate-500">Identificação</h2>
          <div className="grid gap-4 md:grid-cols-2">
            <Campo nome="razaoSocial" label="Razão social" obrigatorio defaultValue={cliente.razaoSocial} />
            <Campo nome="nomeFantasia" label="Nome fantasia" defaultValue={cliente.nomeFantasia} />
            <Campo nome="cnpj" label="CNPJ" obrigatorio defaultValue={cliente.cnpj} />
            <Campo nome="naturezaJuridica" label="Natureza jurídica" defaultValue={cliente.naturezaJuridica} />
            <Campo nome="inscricaoMunicipal" label="Inscrição municipal" defaultValue={cliente.inscricaoMunicipal} />
            <Campo nome="cnaePrincipal" label="CNAE principal" defaultValue={cliente.cnaePrincipal} />
            <div>
              <label className="label" htmlFor="setorAtividade">Setor de atividade</label>
              <select
                id="setorAtividade"
                name="setorAtividade"
                className="input capitalize"
                defaultValue={cliente.setorAtividade ?? ""}
              >
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
              <select
                id="regimeTributario"
                name="regimeTributario"
                className="input"
                defaultValue={cliente.regimeTributario ?? ""}
              >
                <option value="">Selecione...</option>
                {["Simples Nacional", "Lucro Presumido", "Lucro Real", "MEI"].map((r) => (
                  <option key={r} value={r}>{r}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="label" htmlFor="porte">Porte</label>
              <select id="porte" name="porte" className="input" defaultValue={cliente.porte ?? ""}>
                <option value="">Selecione...</option>
                {["ME", "EPP", "Demais"].map((p) => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </select>
            </div>
            <Campo nome="municipio" label="Município" defaultValue={cliente.municipio} />
            <Campo nome="uf" label="UF" placeholder="SP" defaultValue={cliente.uf} />
          </div>
        </section>

        <AcessoEcacFields
          metodoInicial={cliente.metodoAcessoEcac}
          clienteId={id}
          razaoSocial={cliente.razaoSocial}
          temCertificado={!!cliente.certificadoArquivo}
          nomeArquivoAtual={cliente.certificadoNomeArquivo}
          validadeAtual={cliente.certificadoValidade}
        />

        <AcessoSefazFields
          inscricaoEstadualInicial={cliente.inscricaoEstadual ?? ""}
          pastaFiscalInicial={cliente.pastaFiscal ?? ""}
          pastaGiamInicial={cliente.pastaGiam ?? ""}
          jaCadastrada={!!cliente.senhaSefaz}
        />

        {/* AcessoEcacFields aqui em cima ja usa o cliente existente pra upload */}

        <section className="card p-5">
          <h2 className="mb-4 text-sm font-bold uppercase tracking-wide text-slate-500">Responsáveis e contato</h2>
          <div className="grid gap-4 md:grid-cols-2">
            <Campo nome="responsavelLegal" label="Responsável legal" defaultValue={cliente.responsavelLegal} />
            <Campo nome="contadorResponsavel" label="Contador responsável" defaultValue={cliente.contadorResponsavel} />
            <Campo nome="crcContador" label="CRC do contador" defaultValue={cliente.crcContador} />
            <Campo nome="email" label="E-mail" defaultValue={cliente.email} />
            <Campo nome="telefone" label="Telefone" defaultValue={cliente.telefone} />
          </div>
        </section>

        <div className="flex items-center justify-between gap-3">
          {sessao.papel === "ADMIN" ? (
            <ExcluirClienteButton clienteId={id} razaoSocial={cliente.razaoSocial} />
          ) : (
            <span />
          )}
          <div className="flex gap-3">
            <Link href={`/painel/clientes/${id}`} className="btn btn-ghost">Cancelar</Link>
            <button type="submit" className="btn btn-primary">Salvar alterações</button>
          </div>
        </div>
      </form>
    </div>
  );
}
