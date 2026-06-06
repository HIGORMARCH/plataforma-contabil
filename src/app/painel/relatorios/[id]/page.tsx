import Link from "next/link";
import { notFound } from "next/navigation";
import { headers } from "next/headers";
import { requireSessao, PAPEIS_INTERNOS } from "@/lib/auth";
import { prisma } from "@/lib/db";
import type { ResultadoAnalise } from "@/lib/accounting/analyze";
import type { RelatorioTexto } from "@/lib/accounting/narrative";
import { StatusBadge } from "@/components/ui";
import { IndicadoresGrid } from "@/components/Analise";
import { CopiarLink } from "@/components/CopiarLink";
import { RevisaoCritica } from "@/components/RevisaoCritica";
import {
  aprovarRelatorioAction,
  reprovarRelatorioAction,
  liberarRelatorioAction,
  salvarRevisaoAction,
  gerarLinkRastreavelAction,
} from "../actions";

interface Conteudo {
  geradoEm: string;
  analise: ResultadoAnalise;
  texto: RelatorioTexto;
}

function Secao({ titulo, paragrafos }: { titulo: string; paragrafos: string[] }) {
  return (
    <section className="mb-6">
      <h2 className="mb-2 border-b border-slate-200 pb-1 text-lg font-bold text-[var(--brand)]">{titulo}</h2>
      <div className="space-y-2 text-sm leading-relaxed text-slate-700">
        {paragrafos.map((p, i) => (
          <p key={i}>{p}</p>
        ))}
      </div>
    </section>
  );
}

export default async function RelatorioPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ erro?: string }>;
}) {
  const sessao = await requireSessao();
  const { id } = await params;
  const { erro } = await searchParams;

  const r = await prisma.relatorio.findFirst({
    where: { id, cliente: { escritorioId: sessao.escritorioId } },
    include: { cliente: true, acessos: { orderBy: { createdAt: "desc" }, take: 100 } },
  });
  if (!r) notFound();

  // URL absoluta para o link rastreável.
  const h = await headers();
  const proto = h.get("x-forwarded-proto") ?? "http";
  const host = h.get("host") ?? "localhost:3000";
  const linkRastreavel = r.shareToken ? `${proto}://${host}/r/${r.shareToken}` : null;
  const aberturas = r.acessos.filter((a) => a.tipo === "ABERTURA").length;
  const downloads = r.acessos.filter((a) => a.tipo === "DOWNLOAD").length;

  const interno = PAPEIS_INTERNOS.includes(sessao.papel);
  // Cliente só vê o próprio relatório, e somente se LIBERADO.
  if (!interno && (sessao.clienteId !== r.clienteId || r.status !== "LIBERADO")) notFound();

  const conteudo = JSON.parse(r.conteudoJson) as Conteudo;
  const { texto, analise } = conteudo;
  const podeAprovar = (sessao.papel === "CONTADOR" || sessao.papel === "ADMIN") && r.status === "AGUARDANDO_REVISAO";
  const podeLiberar = (sessao.papel === "CONTADOR" || sessao.papel === "ADMIN") && r.status === "APROVADO";

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link href={interno ? "/painel/relatorios" : "/painel"} className="text-sm text-slate-500 hover:underline">
            ← Voltar
          </Link>
          <h1 className="mt-1 text-2xl font-bold text-slate-800">{r.titulo}</h1>
          <p className="text-sm text-slate-500">
            {r.cliente.razaoSocial} — Período {r.periodo}
          </p>
          <div className="mt-2"><StatusBadge status={r.status} /></div>
        </div>
        <a href={`/api/relatorios/${id}/pdf`} className="btn btn-primary">Baixar PDF</a>
      </div>

      {erro === "bloqueado" && (
        <div className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          Este relatório não pode ser aprovado: há inconsistências relevantes nos dados. Corrija os
          demonstrativos e gere o relatório novamente.
        </div>
      )}

      {r.bloqueado && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          ⛔ <b>Emissão bloqueada.</b> Foram detectadas inconsistências relevantes. A conclusão é
          inconclusiva até a revisão e correção pelo contador responsável.
        </div>
      )}

      {r.origemTexto && (
        <p className="mb-4 text-xs text-slate-400">
          Texto: {r.origemTexto === "ia" ? "refinado por IA" : "gerado pelo motor determinístico"}.{" "}
          {r.observacaoIA}
        </p>
      )}

      {/* Compartilhamento e rastreamento (apenas equipe interna) */}
      {interno && (
        <section className="card mb-6 p-5">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-bold uppercase tracking-wide text-slate-500">
              🔗 Compartilhamento e rastreamento
            </h2>
            <span className="text-xs text-slate-500">
              {aberturas} abertura(s) · {downloads} download(s)
            </span>
          </div>

          {!linkRastreavel ? (
            <div>
              <p className="mb-3 text-sm text-slate-600">
                Gere um <b>link rastreável</b> para enviar ao cliente. Toda vez que o link for aberto —
                por ele ou por quem ele encaminhar — fica registrado aqui (data, dispositivo e IP).
              </p>
              <form action={gerarLinkRastreavelAction.bind(null, id)}>
                <button className="btn btn-primary" disabled={r.status !== "LIBERADO"}>
                  Gerar link rastreável
                </button>
              </form>
              {r.status !== "LIBERADO" && (
                <p className="mt-2 text-xs text-amber-700">
                  O link só fica ativo após o relatório ser <b>liberado ao cliente</b>.
                </p>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              <CopiarLink url={linkRastreavel} />
              <p className="text-xs text-slate-500">
                Envie este link ao cliente (e-mail/WhatsApp). Cada abertura é registrada abaixo.
              </p>

              {r.acessos.length === 0 ? (
                <p className="text-sm text-slate-400">Nenhum acesso registrado ainda.</p>
              ) : (
                <div className="overflow-hidden rounded-lg border border-slate-200">
                  <table className="w-full text-xs">
                    <thead className="bg-slate-50 text-left uppercase tracking-wide text-slate-500">
                      <tr>
                        <th className="px-3 py-2">Data / hora</th>
                        <th className="px-3 py-2">Ação</th>
                        <th className="px-3 py-2">Dispositivo</th>
                        <th className="px-3 py-2">IP</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {r.acessos.map((a) => (
                        <tr key={a.id}>
                          <td className="px-3 py-2 text-slate-700">
                            {new Date(a.createdAt).toLocaleString("pt-BR")}
                          </td>
                          <td className="px-3 py-2">
                            <span
                              className={`rounded px-1.5 py-0.5 font-medium ${
                                a.tipo === "DOWNLOAD" ? "bg-blue-100 text-blue-800" : "bg-green-100 text-green-800"
                              }`}
                            >
                              {a.tipo === "DOWNLOAD" ? "Download" : "Abertura"}
                            </span>
                          </td>
                          <td className="px-3 py-2 text-slate-600">{a.dispositivo ?? "—"}</td>
                          <td className="px-3 py-2 text-slate-500">{a.ip ?? "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </section>
      )}

      {/* Controles de revisão (apenas equipe interna) */}
      {interno && r.status !== "LIBERADO" && (
        <section className="card mb-6 border-l-4 border-l-[var(--brand-2)] p-5">
          <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-slate-500">
            Revisão do contador
          </h2>
          <form action={salvarRevisaoAction.bind(null, id)} className="space-y-3">
            <div>
              <label className="label">Conclusão (uma linha por parágrafo)</label>
              <textarea
                name="conclusao"
                rows={4}
                className="input"
                defaultValue={texto.conclusao.join("\n")}
              />
            </div>
            <div>
              <label className="label">Comentário do contador (visível ao cliente)</label>
              <textarea
                name="comentario"
                rows={2}
                className="input"
                defaultValue={r.comentarioContador ?? ""}
                placeholder="Observações adicionais..."
              />
            </div>
            <button className="btn btn-ghost">Salvar revisão</button>
          </form>

          <RevisaoCritica relatorioId={id} />

          <div className="mt-4 flex flex-wrap gap-2 border-t border-slate-100 pt-4">
            {podeAprovar && (
              <>
                <form action={aprovarRelatorioAction.bind(null, id)}>
                  <button className="btn btn-accent" disabled={r.bloqueado}>
                    ✓ Aprovar relatório
                  </button>
                </form>
              </>
            )}
            {podeLiberar && (
              <form action={liberarRelatorioAction.bind(null, id)}>
                <button className="btn btn-primary">↗ Liberar ao cliente</button>
              </form>
            )}
            {r.status !== "AGUARDANDO_REVISAO" && (
              <form action={reprovarRelatorioAction.bind(null, id)}>
                <button className="btn btn-ghost">↩ Reabrir para edição</button>
              </form>
            )}
          </div>
          {r.aprovadoPor && (
            <p className="mt-2 text-xs text-slate-400">
              Aprovado por {r.aprovadoPor}
              {r.aprovadoEm ? ` em ${new Date(r.aprovadoEm).toLocaleDateString("pt-BR")}` : ""}.
            </p>
          )}
        </section>
      )}

      {/* Corpo do relatório */}
      <article className="card p-8">
        <Secao titulo="Resumo executivo" paragrafos={texto.resumoExecutivo} />
        <Secao titulo="Análise do Balanço Patrimonial" paragrafos={texto.analiseBalanco} />
        <Secao titulo="Análise da DRE" paragrafos={texto.analiseResultado} />

        <section className="mb-6">
          <h2 className="mb-3 border-b border-slate-200 pb-1 text-lg font-bold text-[var(--brand)]">
            Indicadores financeiros
          </h2>
          <IndicadoresGrid indicadores={analise.indicadoresRecentes} />
        </section>

        <Secao titulo="Pontos de atenção" paragrafos={texto.pontosAtencao} />
        <Secao titulo="Recomendações técnicas" paragrafos={texto.recomendacoes} />
        <Secao titulo="Conclusão" paragrafos={texto.conclusao} />

        {r.comentarioContador && (
          <section className="mb-6 rounded-lg bg-slate-50 p-4">
            <h3 className="mb-1 text-sm font-bold text-slate-700">Observações do contador</h3>
            <p className="text-sm text-slate-700">{r.comentarioContador}</p>
          </section>
        )}

        <section className="mt-6 border-t border-slate-200 pt-4 text-xs text-slate-500">
          <p className="font-semibold text-slate-600">Limitação de escopo e responsabilidade técnica</p>
          <p className="mt-1">{texto.limitacaoEscopo}</p>
        </section>
      </article>
    </div>
  );
}
