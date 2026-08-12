/**
 * Conciliação Domínio × ECD — apresentação editorial "relatório de auditoria".
 *
 * Aplica-se a clientes do Lucro Real/Presumido. Simples Nacional deve usar
 * a conciliação × DEFIS (ver [[project-conciliacao-balanco-por-regime]]).
 */
import { Fragment } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import path from "node:path";
import { requirePapel, PAPEIS_INTERNOS } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { parseExercicio } from "@/lib/service";
import { extrairExercicioAnual, caminhoEcdDoAno } from "@/lib/ecd/parseSpedEcd";
import { conciliar, type LinhaConciliacao } from "@/lib/accounting/conciliacaoEcd";
import { moeda } from "@/lib/accounting/format";
import { pastaCliente } from "@/lib/storage/filesystem";

function formatarCnpj(cnpj: string): string {
  const d = cnpj.replace(/\D/g, "");
  if (d.length !== 14) return cnpj;
  return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
}

export default async function ConciliacaoEcdPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ ano?: string }>;
}) {
  const sessao = await requirePapel(PAPEIS_INTERNOS);
  const { id } = await params;
  const { ano: anoQ } = await searchParams;

  const cliente = await prisma.cliente.findFirst({
    where: { id, escritorioId: sessao.escritorioId },
    include: { exercicios: { orderBy: { ano: "desc" } } },
  });
  if (!cliente) notFound();

  const clienteRef = { razaoSocial: cliente.razaoSocial, cnpj: cliente.cnpj };
  const pastaClienteAbs = pastaCliente(clienteRef);
  const anosImportados = cliente.exercicios.map((e) => e.ano);
  const anoSelecionado = anoQ ? Number(anoQ) : anosImportados[0];

  const ehSimples = /simples/i.test(cliente.regimeTributario ?? "");

  let relatorio: ReturnType<typeof conciliar> | null = null;
  let arqEcd: string | null = null;
  let erro: string | null = null;
  const exercicio = cliente.exercicios.find((e) => e.ano === anoSelecionado);
  if (exercicio) {
    arqEcd = await caminhoEcdDoAno(clienteRef, anoSelecionado, {
      pastaFiscalLegada: cliente.pastaFiscal,
    });
    if (arqEcd) {
      try {
        const ecdEx = extrairExercicioAnual(arqEcd, anoSelecionado);
        if (ecdEx) {
          const dominioEx = parseExercicio(exercicio.dadosJson);
          relatorio = conciliar(dominioEx, ecdEx);
        } else {
          erro = "SPED-ECD encontrado, mas não foi possível extrair a demonstração do ano.";
        }
      } catch (e) {
        erro = `Erro ao processar SPED-ECD: ${(e as Error).message}`;
      }
    }
  }

  return (
    <div className="mx-auto max-w-6xl px-6 py-8 lg:px-10 lg:py-12">
      {/* ------------------------------------------------------------------
          CABEÇALHO EDITORIAL
          ------------------------------------------------------------------ */}
      <div className="mb-8">
        <Link
          href={`/painel/clientes/${id}`}
          className="text-xs text-[var(--ink-soft)] hover:text-[var(--brand-deep)] transition"
        >
          ← {cliente.razaoSocial}
        </Link>

        <div className="mt-4 eyebrow">
          <span>Auditoria Contábil</span>
          <span className="eyebrow-sep">§</span>
          <span>Módulo de Conciliação</span>
          {anoSelecionado && (
            <>
              <span className="eyebrow-sep">§</span>
              <span>Exercício {anoSelecionado}</span>
            </>
          )}
        </div>

        <h1 className="display mt-3 text-[2.6rem] lg:text-[3.2rem]">
          Conciliação Domínio <span className="italic text-[var(--brand-2)]">×</span> ECD
        </h1>

        <p className="mt-3 max-w-[62ch] text-[0.92rem] leading-relaxed text-[var(--ink-soft)]">
          Cruza o balanço importado do sistema Domínio com o SPED-ECD oficial
          transmitido à Receita. Sinaliza divergências de <em>totais</em> como
          críticas e reclassificações internas como observações.
        </p>

        <div className="rule-gold mt-6 w-40" />
      </div>

      {/* ------------------------------------------------------------------
          META STRIP — cliente, CNPJ, fonte de arquivos, arquivo em uso
          ------------------------------------------------------------------ */}
      <dl className="meta-strip mb-6">
        <div>
          <dt>Razão social</dt>
          <dd>{cliente.razaoSocial}</dd>
        </div>
        <div>
          <dt>CNPJ</dt>
          <dd>{formatarCnpj(cliente.cnpj)}</dd>
        </div>
        <div>
          <dt>Regime</dt>
          <dd>{cliente.regimeTributario ?? "—"}</dd>
        </div>
        <div>
          <dt>Fonte SPED-ECD</dt>
          <dd>
            <code>{pastaClienteAbs}\SPED-ECD\</code>
          </dd>
        </div>
        {arqEcd && (
          <div>
            <dt>Arquivo em uso</dt>
            <dd>
              <code>{path.basename(arqEcd)}</code>
            </dd>
          </div>
        )}
      </dl>

      {ehSimples && (
        <div className="notice mb-4" data-tone="warn">
          Cliente do <b>Simples Nacional</b> não entrega ECD — a conciliação
          correta é contra a DEFIS. Esta tela vai devolver vazio.
        </div>
      )}

      {/* ------------------------------------------------------------------
          SELETOR DE EXERCÍCIO
          ------------------------------------------------------------------ */}
      {anosImportados.length === 0 ? (
        <div className="notice mb-6">
          Nenhum exercício importado ainda pra este cliente. Importe balanços/DREs em{" "}
          <Link
            href={`/painel/clientes/${id}/exercicios`}
            className="font-medium text-[var(--brand-deep)] underline decoration-[var(--brand-2)] decoration-2 underline-offset-2"
          >
            Adicionar documentos
          </Link>
          .
        </div>
      ) : (
        <div className="mb-8 flex flex-wrap items-center gap-x-3 gap-y-2">
          <span className="eyebrow mr-1">Exercício</span>
          <div className="flex flex-wrap gap-1.5">
            {anosImportados.map((a) => (
              <Link
                key={a}
                href={`/painel/clientes/${id}/conciliacao-ecd?ano=${a}`}
                className="chip-year"
                data-active={a === anoSelecionado}
              >
                {a}
              </Link>
            ))}
          </div>
        </div>
      )}

      {exercicio && !arqEcd && (
        <div className="notice mb-4" data-tone="warn">
          SPED-ECD do exercício <b>{anoSelecionado}</b> não encontrado em{" "}
          <code>
            {pastaClienteAbs}\SPED-ECD\{anoSelecionado}\{anoSelecionado}.txt
          </code>
          {cliente.pastaFiscal && (
            <>
              {" "}nem em <code>{path.join(cliente.pastaFiscal, "ECD")}</code>
            </>
          )}
          . Faça upload ou baixe do e-CAC.
        </div>
      )}

      {erro && (
        <div className="notice mb-4" data-tone="err">
          {erro}
        </div>
      )}

      {relatorio && (
        <>
          {/* ------------------------------------------------------------
              PAINEL DE STATUS
              ------------------------------------------------------------ */}
          <div
            className="status-panel mb-5"
            data-tone={relatorio.fecha ? "ok" : "err"}
          >
            <div>
              <div className="status-label">
                {relatorio.fecha ? "Conciliado" : "Divergente"}
              </div>
              <div className="status-msg">
                {relatorio.fecha
                  ? `Totais fecham entre Domínio e ECD em ${anoSelecionado}`
                  : `Divergências entre Domínio e ECD em ${anoSelecionado}`}
              </div>
            </div>
            <div className="status-count">
              <b>{relatorio.divergenciasCriticas.length.toString().padStart(2, "0")}</b>{" "}
              críticas
              <br />
              <b>{relatorio.divergenciasDetalhe.length.toString().padStart(2, "0")}</b>{" "}
              de detalhe
            </div>
          </div>

          {/* ------------------------------------------------------------
              ERRATA — Divergências críticas em destaque
              ------------------------------------------------------------ */}
          {relatorio.divergenciasCriticas.length > 0 && (
            <section className="errata mb-5">
              <header>
                <h2>Divergências críticas — totais não batem</h2>
                <span className="count">
                  {relatorio.divergenciasCriticas.length.toString().padStart(2, "0")}
                </span>
              </header>
              <ul>
                {relatorio.divergenciasCriticas.map((d) => (
                  <li key={d.campo}>
                    <span className="text-[var(--ink)]">{d.rotulo}</span>
                    <span className="val">
                      {d.diferenca === null ? "—" : moeda(d.diferenca)}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {/* ------------------------------------------------------------
              BALANÇO HIERÁRQUICO
              ------------------------------------------------------------ */}
          <BalancoHierarquico linhas={relatorio.linhas} />

          {/* ------------------------------------------------------------
              DRE (mantém plano — sequencial, não hierárquico)
              ------------------------------------------------------------ */}
          {relatorio.linhas.some(
            (l) =>
              l.grupo === "resultado" &&
              (l.valorDominio !== null || l.valorEcd !== null),
          ) && (
            <section className="mt-6">
              <div className="mb-2 flex items-baseline justify-between">
                <h3 className="display text-xl">Demonstração do Resultado</h3>
                <span className="eyebrow">DRE · {anoSelecionado}</span>
              </div>
              <table className="ledger">
                <thead>
                  <tr>
                    <th>Rubrica</th>
                    <th>Domínio</th>
                    <th>ECD</th>
                    <th>Diferença</th>
                  </tr>
                </thead>
                <tbody>
                  {relatorio.linhas
                    .filter((l) => l.grupo === "resultado")
                    .map((l) => (
                      <LinhaDre key={l.campo} l={l} />
                    ))}
                </tbody>
              </table>
            </section>
          )}

          {/* ------------------------------------------------------------
              RECLASSIFICAÇÕES INTERNAS
              ------------------------------------------------------------ */}
          {relatorio.divergenciasDetalhe.length > 0 && (
            <section className="reclass mt-6">
              <h2>Reclassificações internas</h2>
              <p className="lede">
                Contas em que os totais de grupo batem mas a distribuição
                interna difere entre Domínio e ECD — típico de plano de contas
                classificado de forma diferente entre os dois sistemas. Não é
                erro; pode ser reclassificação intencional.
              </p>
              <ul>
                {relatorio.divergenciasDetalhe.map((d) => (
                  <li key={d.campo}>
                    <span>{d.rotulo}</span>
                    <span className="val">
                      {d.diferenca === null ? "—" : moeda(d.diferenca)}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Linha da DRE (tabela plana)
// ---------------------------------------------------------------------------
function LinhaDre({ l }: { l: LinhaConciliacao }) {
  const forte = l.categoria === "total";
  const cls = l.divergente ? "row-diverge" : forte ? "row-sub" : "row-leaf";
  return (
    <tr className={cls}>
      <td>{l.rotulo}</td>
      <Val v={l.valorDominio} forte={forte} />
      <Val v={l.valorEcd} forte={forte} />
      <Val v={l.diferenca} tone={l.divergente ? "danger" : "quiet"} />
    </tr>
  );
}

function Val({
  v,
  forte,
  tone,
}: {
  v: number | null;
  forte?: boolean;
  tone?: "danger" | "quiet" | "strong";
}) {
  if (v === null) return <td><span className="num-null">—</span></td>;
  const cls = tone
    ? `num-${tone}`
    : forte
      ? "num-strong"
      : "";
  return <td className={cls}>{moeda(v)}</td>;
}

// ---------------------------------------------------------------------------
// BalancoHierarquico — Ativo > AC > contas; Passivo+PL > PC/PNC/PL > contas
// ---------------------------------------------------------------------------
function BalancoHierarquico({ linhas }: { linhas: LinhaConciliacao[] }) {
  const buscar = (campo: string) => linhas.find((l) => l.campo === campo) ?? null;

  const estrutura: Array<{
    raiz: string;
    campoTotalRaiz: string | null;
    subgrupos: Array<{
      titulo: string;
      campoTotal: string | null;
      contas: string[];
    }>;
  }> = [
    {
      raiz: "Ativo",
      campoTotalRaiz: "ativoTotal",
      subgrupos: [
        {
          titulo: "Ativo Circulante",
          campoTotal: "ac.total",
          contas: [
            "ac.caixaEquivalentes",
            "ac.contasReceber",
            "ac.tributosRecuperar",
            "ac.estoques",
            "ac.outros",
          ],
        },
        {
          titulo: "Ativo Não Circulante",
          campoTotal: "anc.total",
          contas: ["anc.imobilizado"],
        },
      ],
    },
    {
      raiz: "Passivo + Patrimônio Líquido",
      campoTotalRaiz: "passivoMaisPL",
      subgrupos: [
        {
          titulo: "Passivo Circulante",
          campoTotal: "pc.total",
          contas: [
            "pc.emprestimosFinanciamentos",
            "pc.fornecedores",
            "pc.obrigacoesTributarias",
            "pc.obrigacoesTrabalhistas",
          ],
        },
        {
          titulo: "Passivo Não Circulante",
          campoTotal: "pnc.total",
          contas: ["pnc.emprestimosFinanciamentos", "pnc.outros"],
        },
        {
          titulo: "Patrimônio Líquido",
          campoTotal: "pl.total",
          contas: [
            "pl.capitalSocial",
            "pl.reservas",
            "pl.lucrosAcumulados",
            "pl.prejuizosAcumulados",
          ],
        },
      ],
    },
  ];

  return (
    <section>
      <div className="mb-2 flex items-baseline justify-between">
        <h3 className="display text-xl">Balanço Patrimonial</h3>
        <span className="eyebrow">BP · comparativo</span>
      </div>
      <table className="ledger">
        <thead>
          <tr>
            <th>Conta</th>
            <th>Domínio</th>
            <th>ECD</th>
            <th>Diferença</th>
          </tr>
        </thead>
        <tbody>
          {estrutura.map((raiz) => {
            const total = raiz.campoTotalRaiz ? buscar(raiz.campoTotalRaiz) : null;
            return (
              <Fragment key={raiz.raiz}>
                <tr className="row-root">
                  <td>{raiz.raiz}</td>
                  <td>
                    {total?.valorDominio != null ? moeda(total.valorDominio) : ""}
                  </td>
                  <td>
                    {total?.valorEcd != null ? moeda(total.valorEcd) : ""}
                  </td>
                  <td>
                    {total?.diferenca != null ? moeda(total.diferenca) : ""}
                  </td>
                </tr>

                {raiz.subgrupos.map((sub) => {
                  const totalSub = sub.campoTotal ? buscar(sub.campoTotal) : null;
                  const contasComValor = sub.contas
                    .map((c) => buscar(c))
                    .filter(
                      (l): l is LinhaConciliacao =>
                        l !== null &&
                        (l.valorDominio !== null || l.valorEcd !== null),
                    );
                  if (!totalSub && contasComValor.length === 0) return null;

                  return (
                    <Fragment key={`${raiz.raiz}-${sub.titulo}`}>
                      <tr className="row-sub">
                        <td>{sub.titulo}</td>
                        <Val v={totalSub?.valorDominio ?? null} forte />
                        <Val v={totalSub?.valorEcd ?? null} forte />
                        <Val
                          v={totalSub?.diferenca ?? null}
                          tone={totalSub?.divergente ? "danger" : "quiet"}
                        />
                      </tr>
                      {contasComValor.map((c) => (
                        <tr
                          key={c.campo}
                          className={c.divergente ? "row-diverge" : "row-leaf"}
                        >
                          <td>{c.rotulo}</td>
                          <Val v={c.valorDominio} />
                          <Val v={c.valorEcd} />
                          <Val
                            v={c.diferenca}
                            tone={c.divergente ? "danger" : "quiet"}
                          />
                        </tr>
                      ))}
                    </Fragment>
                  );
                })}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </section>
  );
}
