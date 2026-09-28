import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePapel, PAPEIS_INTERNOS } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { carregarExercicios } from "@/lib/service";
import { analisar } from "@/lib/accounting/analyze";
import { ResumoSituacao } from "@/components/Analise";
import { CardPastaUnica } from "@/components/CardPastaUnica";
import { StatusBadge } from "@/components/ui";
import { gerarRelatorioAction } from "./actions";
import { salvarSenhaSefazEstabelecimentoAction } from "./estabelecimentos-actions";
import { listarEstabelecimentos } from "@/lib/estabelecimento";
import { BuscarNaPlanilhaButton } from "./_components/BuscarNaPlanilhaButton";
import { excluirRelatorioAction } from "../../relatorios/actions";

export default async function ClienteDetalhe({ params }: { params: Promise<{ id: string }> }) {
  const sessao = await requirePapel(PAPEIS_INTERNOS);
  const { id } = await params;

  const cliente = await prisma.cliente.findFirst({
    where: { id, escritorioId: sessao.escritorioId },
    include: {
      exercicios: { orderBy: { ano: "desc" } },
      relatorios: { orderBy: { createdAt: "desc" } },
    },
  });
  if (!cliente) notFound();

  const exercicios = await carregarExercicios(id);
  const estabelecimentos = await listarEstabelecimentos(id);
  const fmtCnpj = (d: string) => d.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5");
  const analise = exercicios.length ? analisar(exercicios) : null;

  const infos: [string, string | null][] = [
    ["CNPJ", cliente.cnpj],
    ["Nome fantasia", cliente.nomeFantasia],
    ["Regime tributário", cliente.regimeTributario],
    ["Porte", cliente.porte],
    ["Setor", cliente.setorAtividade],
    ["Município/UF", [cliente.municipio, cliente.uf].filter(Boolean).join("/") || null],
    ["CNAE", cliente.cnaePrincipal],
    ["Contador responsável", cliente.contadorResponsavel],
    ["CRC", cliente.crcContador],
  ];

  return (
    <div>
      <div className="mb-6">
        <Link href="/painel/clientes" className="text-sm text-slate-500 hover:underline">
          ← Voltar para clientes
        </Link>
        <div className="mt-1 flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-800">{cliente.razaoSocial}</h1>
            <Link
              href={`/painel/clientes/${id}/editar`}
              className="mt-1 inline-block text-xs text-[var(--ink-soft)] underline decoration-dotted underline-offset-2 hover:text-[var(--brand-deep)]"
            >
              editar cadastro
            </Link>
            <span className="mx-2 text-xs text-slate-300">·</span>
            <BuscarNaPlanilhaButton clienteId={id} />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Link href={`/painel/clientes/${id}/exercicios`} className="btn btn-accent">
              📄 Adicionar documentos
            </Link>
            {exercicios.length > 0 && (
              <Link href={`/painel/clientes/${id}/analise`} className="btn btn-accent">
                Ver análise
              </Link>
            )}
            {exercicios.length > 0 && (
              <form action={gerarRelatorioAction.bind(null, id)}>
                <button className="btn btn-primary">Gerar relatório</button>
              </form>
            )}
          </div>
        </div>
        <p className="mt-3 max-w-[62ch] text-[11px] leading-relaxed text-[var(--ink-soft)]">
          Os módulos de auditoria (SPED-Fiscal, PIS/COFINS, IRPJ/CSLL, Conciliação ECD,
          Balanço, Balancete, Razão / Contrapartida) foram movidos pro menu lateral, sob
          suas categorias <b>Fiscal</b> e <b>Contábil</b>. Selecione o módulo lá e escolha
          este cliente na lista.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <section className="card p-5 lg:col-span-2">
          <h2 className="mb-4 text-sm font-bold uppercase tracking-wide text-slate-500">Dados cadastrais</h2>
          <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm md:grid-cols-3">
            {infos.map(([k, v]) => (
              <div key={k}>
                <dt className="text-xs text-slate-400">{k}</dt>
                <dd className="text-slate-700">{v ?? "—"}</dd>
              </div>
            ))}
          </dl>

          {estabelecimentos.length > 1 && (
            <div className="mt-6 border-t border-slate-100 pt-4">
              <h3 className="mb-1 text-xs font-bold uppercase tracking-wide text-slate-500">
                Estabelecimentos — {estabelecimentos.length}
              </h3>
              <p className="mb-3 text-xs text-slate-400">
                ECD, ECF, EFD-Contribuições e DCTFWeb são da empresa (entregues pela matriz). EFD
                ICMS/IPI e GIAM são de cada estabelecimento. GIAM só existe no TO. A senha SEFAZ da
                matriz fica em &quot;editar cadastro&quot;; a das filiais, aqui.
              </p>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="border-b border-slate-200 text-left text-xs uppercase text-slate-500">
                    <tr>
                      <th className="pb-2 pr-3">Estabelecimento</th>
                      <th className="pb-2 pr-3">CNPJ</th>
                      <th className="pb-2 pr-3">IE</th>
                      <th className="pb-2 pr-3">UF</th>
                      <th className="pb-2 pr-3">Senha SEFAZ-TO</th>
                    </tr>
                  </thead>
                  <tbody>
                    {estabelecimentos.map((e) => (
                      <tr key={e.id} className="border-b border-slate-100 align-top">
                        <td className="py-2 pr-3 font-medium text-slate-700">
                          <Link href={`/painel/clientes/${id}/sped?estab=${e.id}`} className="hover:underline">
                            {e.rotulo}
                          </Link>
                          {e.pastaLocal && e.tipo === "FILIAL" && (
                            <p className="text-[11px] font-normal text-slate-400">{e.pastaLocal}</p>
                          )}
                        </td>
                        <td className="py-2 pr-3 font-mono text-xs">{fmtCnpj(e.cnpj)}</td>
                        <td className="py-2 pr-3 font-mono text-xs">{e.inscricaoEstadual ?? "—"}</td>
                        <td className="py-2 pr-3">{e.uf ?? "—"}</td>
                        <td className="py-2 pr-3 text-xs">
                          {e.uf && e.uf !== "TO" ? (
                            <span className="text-slate-400">não entrega GIAM</span>
                          ) : e.tipo === "MATRIZ" ? (
                            <span className="text-slate-500">
                              {e.senhaSefaz ? "cadastrada" : "não cadastrada"} · no cadastro
                            </span>
                          ) : (
                            <form
                              action={salvarSenhaSefazEstabelecimentoAction.bind(null, id, e.id)}
                              className="flex items-center gap-2"
                            >
                              <span className={e.senhaSefaz ? "text-emerald-700" : "text-slate-500"}>
                                {e.senhaSefaz ? "cadastrada" : "não cadastrada"}
                              </span>
                              <input
                                type="password"
                                name="senhaSefaz"
                                autoComplete="new-password"
                                placeholder={e.senhaSefaz ? "trocar senha" : "senha"}
                                className="w-28 rounded border border-slate-300 px-2 py-1 text-xs"
                              />
                              <button className="btn btn-ghost text-xs">Salvar</button>
                            </form>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </section>

        <section className="space-y-4">
          {analise ? (
            <ResumoSituacao analise={analise} />
          ) : (
            <div className="card p-5 text-center">
              <p className="mb-3 text-sm text-slate-500">
                Nenhum documento enviado ainda. Envie o Balanço, o Balancete e a DRE (PDF, Excel ou
                lançamento manual) para iniciar a análise.
              </p>
              <Link href={`/painel/clientes/${id}/exercicios`} className="btn btn-primary">
                📄 Enviar documentos
              </Link>
            </div>
          )}
          <CardPastaUnica
            cliente={{
              razaoSocial: cliente.razaoSocial,
              cnpj: cliente.cnpj,
              pastaLocal: cliente.pastaLocal,
            }}
          />
        </section>
      </div>

      <section className="mt-6 grid gap-6 lg:grid-cols-2">
        <div>
          <h2 className="mb-3 text-lg font-bold text-slate-800">Exercícios cadastrados</h2>
          <div className="card divide-y divide-slate-100">
            {cliente.exercicios.length === 0 && (
              <p className="p-4 text-sm text-slate-400">Nenhum exercício cadastrado.</p>
            )}
            {cliente.exercicios.map((ex) => {
              const docs: string[] = ex.documentos ? JSON.parse(ex.documentos) : [];
              return (
                <div key={ex.id} className="flex items-center justify-between p-4">
                  <div>
                    <p className="font-semibold text-slate-700">Exercício {ex.ano}</p>
                    <p className="text-xs text-slate-400">
                      {docs.length ? docs.join(", ") : "Lançamento manual"}
                    </p>
                  </div>
                  <Link
                    href={`/painel/clientes/${id}/exercicios?ano=${ex.ano}`}
                    className="text-sm text-[var(--brand)] hover:underline"
                  >
                    Editar
                  </Link>
                </div>
              );
            })}
          </div>
        </div>

        <div>
          <h2 className="mb-3 text-lg font-bold text-slate-800">Relatórios</h2>
          <div className="card divide-y divide-slate-100">
            {cliente.relatorios.length === 0 && (
              <p className="p-4 text-sm text-slate-400">Nenhum relatório gerado.</p>
            )}
            {cliente.relatorios.map((r) => (
              <div key={r.id} className="flex items-center justify-between p-4">
                <div>
                  <Link href={`/painel/relatorios/${r.id}`} className="font-medium text-[var(--brand)] hover:underline">
                    {r.titulo}
                  </Link>
                  <p className="text-xs text-slate-400">
                    Período {r.periodo} · Criado em {new Date(r.createdAt).toLocaleString("pt-BR")}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <StatusBadge status={r.status} />
                  <form action={excluirRelatorioAction.bind(null, r.id, cliente.id)}>
                    <button
                      className="rounded border border-red-200 bg-white px-2 py-1 text-xs text-red-600 hover:bg-red-50"
                      title="Excluir este relatório"
                      // eslint-disable-next-line @typescript-eslint/no-explicit-any
                      formNoValidate
                    >
                      Excluir
                    </button>
                  </form>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}

