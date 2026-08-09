/**
 * Conciliação Domínio × ECD — exibe o quadro comparativo por ano.
 *
 * Aplica-se a clientes do Lucro Real/Presumido. Simples Nacional deve usar
 * a conciliação × DEFIS (ver [[project-conciliacao-balanco-por-regime]]).
 */
import Link from "next/link";
import { notFound } from "next/navigation";
import { existsSync, readdirSync } from "node:fs";
import path from "node:path";
import { requirePapel, PAPEIS_INTERNOS } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { parseExercicio } from "@/lib/service";
import { extrairExercicioAnual, caminhoEcdDoAno } from "@/lib/ecd/parseSpedEcd";
import {
  conciliar,
  conciliarPorCodigoDominio,
  conciliarPorSintetica,
  type LinhaConciliacao,
  type LinhaContaConciliacao,
  type BlocoSintetica,
  type RelatorioSinteticasConciliacao,
} from "@/lib/accounting/conciliacaoEcd";
import {
  contasAnaliticasDominioDoAno,
  contasAnaliticasEcdDoAno,
  contasAnaliticasEcdViaI155DoAno,
} from "@/lib/accounting/contasAnaliticas";
import { moeda } from "@/lib/accounting/format";
import { pastaCliente } from "@/lib/storage/filesystem";
import { BotaoImprimir } from "@/components/BotaoImprimir";

type Aba = "totais" | "contas";

/**
 * Lê as subpastas de `<pastaCliente>\SPED-ECD\` e devolve os anos (números)
 * que têm arquivo `<ano>.txt` dentro. Usado pra popular o seletor de exercício
 * com anos que ainda não foram formalmente importados no banco — Higor pode só
 * ter colocado o arquivo na pasta pra investigar.
 */
function listarAnosComEcdNaPasta(pastaClienteAbs: string): number[] {
  const raiz = path.join(pastaClienteAbs, "SPED-ECD");
  if (!existsSync(raiz)) return [];
  try {
    return readdirSync(raiz)
      .filter((nome) => /^\d{4}$/.test(nome))
      .map((nome) => Number(nome))
      .filter((ano) => {
        // Aceita `<ano>.txt` (padrão) OU qualquer .txt cujo nome contenha
        // `<ano>0101-<ano>1231` (nome longo original do SPED).
        const pasta = path.join(raiz, String(ano));
        if (!existsSync(pasta)) return false;
        try {
          const arquivos = readdirSync(pasta);
          return arquivos.some(
            (f) =>
              f === `${ano}.txt` ||
              (f.toLowerCase().endsWith(".txt") && f.includes(`${ano}0101-${ano}1231`)),
          );
        } catch {
          return false;
        }
      });
  } catch {
    return [];
  }
}

function CelulaValor({ valor, forte }: { valor: number | null; forte?: boolean }) {
  const cls = forte ? "font-bold" : "";
  return (
    <td className={`px-3 py-1.5 text-right tabular-nums ${cls}`}>
      {valor === null ? <span className="text-slate-400">—</span> : moeda(valor)}
    </td>
  );
}

function LinhaTabela({ l }: { l: LinhaConciliacao }) {
  const forte = l.categoria === "total";
  const rowBg = l.divergente
    ? "bg-red-50 text-red-900"
    : forte
      ? "bg-slate-50 font-semibold text-slate-800"
      : "text-slate-700";
  return (
    <tr className={rowBg}>
      <td className="px-3 py-1.5">
        {l.divergente && <span className="mr-1 font-bold text-red-600">✗</span>}
        {l.rotulo}
      </td>
      <CelulaValor valor={l.valorDominio} forte={forte} />
      <CelulaValor valor={l.valorEcd} forte={forte} />
      <td className={`px-3 py-1.5 text-right tabular-nums ${l.divergente ? "font-bold text-red-700" : "text-slate-500"}`}>
        {l.diferenca === null ? <span className="text-slate-400">—</span> : moeda(l.diferenca)}
      </td>
    </tr>
  );
}

export default async function ConciliacaoEcdPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ ano?: string; aba?: string; filtro?: string }>;
}) {
  const sessao = await requirePapel(PAPEIS_INTERNOS);
  const { id } = await params;
  const { ano: anoQ, aba: abaQ, filtro: filtroQ } = await searchParams;
  const aba: Aba = abaQ === "contas" ? "contas" : "totais";
  const filtroContas = filtroQ === "todas" ? "todas" : "divergentes";

  const cliente = await prisma.cliente.findFirst({
    where: { id, escritorioId: sessao.escritorioId },
    include: { exercicios: { orderBy: { ano: "desc" } } },
  });
  if (!cliente) notFound();

  const clienteRef = { razaoSocial: cliente.razaoSocial, cnpj: cliente.cnpj };
  const pastaClienteAbs = pastaCliente(clienteRef);
  const anosImportados = cliente.exercicios.map((e) => e.ano);
  // Anos com SPED-ECD na pasta única, mesmo que ainda não tenham exercício
  // no banco. Isso destrava a aba "Contas divergentes" pra anos históricos
  // (ex.: 2018 baixado só pra investigar saldo inicial de 2019).
  const anosComEcdNaPasta = listarAnosComEcdNaPasta(pastaClienteAbs);
  const todosAnos = Array.from(new Set([...anosImportados, ...anosComEcdNaPasta])).sort((a, b) => b - a);
  const anoSelecionado = anoQ ? Number(anoQ) : todosAnos[0];

  // Aviso: DEFIS quando o regime é Simples.
  const ehSimples = /simples/i.test(cliente.regimeTributario ?? "");

  let relatorio: ReturnType<typeof conciliar> | null = null;
  let relatorioContas: RelatorioSinteticasConciliacao | null = null;
  let arqEcd: string | null = null;
  let erro: string | null = null;
  let avisoContas: string | null = null;
  const exercicio = cliente.exercicios.find((e) => e.ano === anoSelecionado);

  // Resolve o SPED-ECD via pasta única (C:\PlataformaContabil\<cliente>\SPED-ECD\<ano>\<ano>.txt).
  // Se ainda não estiver lá mas houver Cliente.pastaFiscal legado, copia
  // da origem ReceitanetBX/ECD/ pra pasta única automaticamente.
  arqEcd = await caminhoEcdDoAno(clienteRef, anoSelecionado, {
    pastaFiscalLegada: cliente.pastaFiscal,
  });

  if (arqEcd) {
    try {
      // Aba "Totais e grupos" — exige exercício no banco (compara agregados
      // que estão no dadosJson do exercício importado).
      if (exercicio) {
        const ecdEx = extrairExercicioAnual(arqEcd, anoSelecionado);
        if (ecdEx) {
          const dominioEx = parseExercicio(exercicio.dadosJson);
          relatorio = conciliar(dominioEx, ecdEx);
        } else {
          erro = "SPED-ECD encontrado, mas não foi possível extrair a demonstração do ano.";
        }
      }

      // Aba "Contas divergentes" — releitura direta dos arquivos-fonte pra
      // obter analíticas. NÃO depende de exercício no banco: basta o balanço
      // PDF do Domínio + SPED-ECD .txt estarem na pasta única do cliente.
      // Assim funciona pra anos históricos que nunca foram importados via
      // "Extrair PDF" (ex.: 2018 baixado só pra investigar saldo anterior).

      // Matching preferencial: DETERMINÍSTICO por CÓDIGO DOMÍNIO (bloco I155
      // do SPED-ECD tem saldos analíticos com COD_CTA do plano da empresa —
      // mesmo código que aparece no PDF do Domínio). Resolve reagrupamento
      // (1 conta Dom = várias na ECD) e variação textual.
      // Fallback: matching por descrição (J100) se I155 não trouxer dados.
      if (aba === "contas") {
        const [contasDom, contasEcdI155] = await Promise.all([
          contasAnaliticasDominioDoAno(clienteRef, anoSelecionado),
          contasAnaliticasEcdViaI155DoAno(clienteRef, anoSelecionado),
        ]);
        if (contasDom.length === 0) {
          avisoContas = `Balanço PDF do Domínio não encontrado em ${pastaClienteAbs}\\BALANCOS-DOMINIO\\${anoSelecionado}\\balanco.pdf. Coloque o arquivo nessa pasta pra habilitar a conciliação por conta.`;
        } else if (contasEcdI155.length > 0) {
          relatorioContas = conciliarPorCodigoDominio(contasDom, contasEcdI155, anoSelecionado);
        } else {
          const contasEcdJ100 = await contasAnaliticasEcdDoAno(clienteRef, anoSelecionado);
          if (contasEcdJ100.length === 0) {
            avisoContas = "SPED-ECD parseado mas sem contas analíticas (nem I155 nem J100).";
          } else {
            relatorioContas = conciliarPorSintetica(contasDom, contasEcdJ100, anoSelecionado);
          }
        }
      }
    } catch (e) {
      erro = `Erro ao processar SPED-ECD: ${(e as Error).message}`;
    }
  }

  return (
    <div>
      {/* Impressão: esconde sidebar, breadcrumbs, abas e filtros. Preserva
          cores das linhas (vermelho pra divergente, âmbar pra só-um-lado).
          Tabelas quebram entre páginas (sem espaço em branco), mas linhas
          não cortam no meio e o thead repete no topo da nova página. */}
      <style>{`
        @media print {
          aside { display: none !important; }
          .no-print { display: none !important; }
          @page { size: A4 landscape; margin: 8mm; }
          body { -webkit-print-color-adjust: exact; print-color-adjust: exact; margin: 0; }
          h1 { font-size: 14px; margin: 0 0 6px; }
          main > div { padding: 0 !important; }
          .card { padding: 0 !important; margin-bottom: 8px !important; box-shadow: none !important; border: 1px solid #cbd5e1 !important; }
          .card header { padding: 4px 8px !important; }
          .card header h3 { font-size: 11px; }
          .card header span { font-size: 9px; }
          table { font-size: 9px; }
          thead { display: table-header-group; }
          tr { break-inside: avoid; page-break-inside: avoid; }
          table th, table td { padding: 2px 6px !important; }
        }
      `}</style>
      <div className="mb-6">
        <Link href={`/painel/clientes/${id}`} className="text-sm text-slate-500 hover:underline no-print">
          ← Voltar para {cliente.razaoSocial}
        </Link>
        <h1 className="mt-1 text-2xl font-bold text-slate-800">
          Conciliação Domínio × ECD — {cliente.razaoSocial}
          {exercicio && <span className="text-slate-500"> · {anoSelecionado}</span>}
        </h1>
        <p className="text-sm text-slate-500 no-print">
          Cruza o balanço importado do Domínio com o SPED-ECD oficial transmitido à Receita.
          Aponta divergências de totais (críticas) e reclassificações internas.
        </p>
      </div>

      {ehSimples && (
        <div className="mb-4 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          ⚠ Cliente do Simples Nacional não entrega ECD — a conciliação correta é contra a DEFIS.
          Esta tela vai devolver vazio.
        </div>
      )}

      <div className="mb-4 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600 no-print">
        Fonte única de arquivos: <code>{pastaClienteAbs}\SPED-ECD\</code>. Se um arquivo não
        estiver aqui mas houver <code>pastaFiscal</code> legado com ECD/, a plataforma copia
        automaticamente na primeira leitura.
      </div>

      {todosAnos.length === 0 && (
        <div className="mb-4 rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-sm text-slate-700">
          Nenhum exercício importado nem SPED-ECD encontrado na pasta única. Importe balanços/DREs em{" "}
          <Link href={`/painel/clientes/${id}/exercicios`} className="text-[var(--brand)] underline">
            Adicionar documentos
          </Link>{" "}
          ou coloque o SPED-ECD em <code>{pastaClienteAbs}\SPED-ECD\&lt;ano&gt;\&lt;ano&gt;.txt</code>.
        </div>
      )}

      {todosAnos.length > 0 && (
        <div className="mb-6 flex flex-wrap gap-2 no-print">
          <span className="self-center text-sm text-slate-600">Exercício:</span>
          {todosAnos.map((a) => (
            <Link
              key={a}
              href={`/painel/clientes/${id}/conciliacao-ecd?ano=${a}`}
              className={`rounded-md border px-3 py-1 text-sm transition ${
                a === anoSelecionado
                  ? "border-[var(--brand)] bg-[var(--brand)] text-white"
                  : "border-slate-300 bg-white text-slate-700 hover:border-[var(--brand)]"
              }`}
            >
              {a}
            </Link>
          ))}
        </div>
      )}

      {arqEcd && (
        <div className="mb-3 text-xs text-slate-500">
          Arquivo ECD: <code>{path.basename(arqEcd)}</code>
        </div>
      )}

      {/* Abas: Totais (visão atual) × Contas divergentes (nova) */}
      {todosAnos.length > 0 && (
        <div className="mb-4 flex gap-1 border-b border-slate-200 no-print">
          <Link
            href={`/painel/clientes/${id}/conciliacao-ecd?ano=${anoSelecionado}&aba=totais`}
            className={`rounded-t-md px-4 py-2 text-sm font-medium transition ${
              aba === "totais"
                ? "border-b-2 border-[var(--brand)] text-[var(--brand)]"
                : "text-slate-500 hover:text-slate-800"
            }`}
          >
            Totais e grupos
          </Link>
          <Link
            href={`/painel/clientes/${id}/conciliacao-ecd?ano=${anoSelecionado}&aba=contas`}
            className={`rounded-t-md px-4 py-2 text-sm font-medium transition ${
              aba === "contas"
                ? "border-b-2 border-[var(--brand)] text-[var(--brand)]"
                : "text-slate-500 hover:text-slate-800"
            }`}
          >
            Contas divergentes
          </Link>
        </div>
      )}

      {exercicio && !arqEcd && (
        <div className="mb-4 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          SPED-ECD do exercício {anoSelecionado} não encontrado em <code>{pastaClienteAbs}\SPED-ECD\{anoSelecionado}\{anoSelecionado}.txt</code>
          {cliente.pastaFiscal && <> nem em <code>{path.join(cliente.pastaFiscal, "ECD")}</code></>}. Faça upload ou baixe do e-CAC.
        </div>
      )}

      {erro && (
        <div className="mb-4 rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800">
          {erro}
        </div>
      )}

      {aba === "totais" && relatorio && (
        <>
          {/* Cabeçalho de status */}
          <div
            className={`mb-4 flex items-center justify-between rounded-lg border-2 px-4 py-3 text-sm font-bold ${
              relatorio.fecha
                ? "border-emerald-500 bg-emerald-50 text-emerald-800"
                : "border-red-500 bg-red-50 text-red-800"
            }`}
          >
            <span>
              {relatorio.fecha
                ? `✓ Totais fecham entre Domínio e ECD (${anoSelecionado})`
                : `✗ Divergências entre Domínio e ECD em ${anoSelecionado}`}
            </span>
            <span className="text-xs font-normal">
              {relatorio.divergenciasCriticas.length} crítica(s) · {relatorio.divergenciasDetalhe.length} de detalhe
            </span>
          </div>

          {/* Divergências críticas em destaque */}
          {relatorio.divergenciasCriticas.length > 0 && (
            <section className="card mb-4 border-red-200 p-4">
              <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-red-700">
                ⚠ Divergências críticas (totais que não batem)
              </h2>
              <ul className="space-y-1 text-sm">
                {relatorio.divergenciasCriticas.map((d) => (
                  <li key={d.campo} className="flex justify-between tabular-nums">
                    <span className="font-medium text-slate-800">{d.rotulo}</span>
                    <span className="font-bold text-red-700">
                      {d.diferenca === null ? "—" : moeda(d.diferenca)}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {/* Quadro comparativo completo */}
          <section className="card p-0">
            <table className="w-full text-sm">
              <thead className="bg-slate-100 text-xs uppercase text-slate-600">
                <tr>
                  <th className="px-3 py-2 text-left">Conta / Grupo</th>
                  <th className="px-3 py-2 text-right">Domínio</th>
                  <th className="px-3 py-2 text-right">ECD</th>
                  <th className="px-3 py-2 text-right">Diferença</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {relatorio.linhas.map((l) => (
                  <LinhaTabela key={l.campo} l={l} />
                ))}
              </tbody>
            </table>
          </section>

          {relatorio.divergenciasDetalhe.length > 0 && (
            <section className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-4">
              <h2 className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-600">
                ℹ Reclassificações internas (detalhe)
              </h2>
              <p className="mb-2 text-xs text-slate-600">
                Contas em que os TOTAIS de grupo batem mas a distribuição interna difere entre
                Domínio e ECD (típico de plano de contas classificado de forma diferente entre
                os dois sistemas). Não é erro — pode ser reclassificação intencional.
              </p>
              <ul className="space-y-1 text-sm">
                {relatorio.divergenciasDetalhe.map((d) => (
                  <li key={d.campo} className="flex justify-between tabular-nums">
                    <span className="text-slate-700">{d.rotulo}</span>
                    <span className="font-medium text-slate-800">
                      {d.diferenca === null ? "—" : moeda(d.diferenca)}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}

      {/* Nova aba — Contas divergentes (analítico) */}
      {aba === "contas" && (
        <>
          {avisoContas && (
            <div className="mb-4 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800">
              {avisoContas}
            </div>
          )}

          {relatorioContas && (
            <ContasDivergentes
              relatorio={relatorioContas}
              filtro={filtroContas}
              clienteId={id}
              anoSelecionado={anoSelecionado}
            />
          )}
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Bloco "Contas divergentes" — lista analítica agrupada por grupo do BP.
// ---------------------------------------------------------------------------

function ContasDivergentes({
  relatorio,
  filtro,
  clienteId,
  anoSelecionado,
}: {
  relatorio: RelatorioSinteticasConciliacao;
  filtro: "divergentes" | "todas";
  clienteId: string;
  anoSelecionado: number;
}) {
  const linkFiltro = (f: "divergentes" | "todas") =>
    `/painel/clientes/${clienteId}/conciliacao-ecd?ano=${anoSelecionado}&aba=contas&filtro=${f}`;
  const total = relatorio.contagem;
  const blocosVisiveis =
    filtro === "divergentes" ? relatorio.blocos.filter((b) => !b.fecha) : relatorio.blocos;

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm">
        <div className="flex flex-wrap gap-4">
          <Contador rotulo="Sintéticas divergentes" valor={total.sinteticasDivergentes} cor="text-red-700" />
          <Contador rotulo="Sintéticas fechadas" valor={total.sinteticasFechadas} cor="text-emerald-700" />
          <Contador rotulo="Analíticas" valor={total.analiticas} cor="text-slate-700" />
        </div>
        <div className="flex gap-1 no-print">
          <Link
            href={linkFiltro("divergentes")}
            className={`rounded-md border px-3 py-1 text-xs transition ${
              filtro === "divergentes"
                ? "border-[var(--brand)] bg-[var(--brand)] text-white"
                : "border-slate-300 bg-white text-slate-700 hover:border-[var(--brand)]"
            }`}
          >
            Só divergentes
          </Link>
          <Link
            href={linkFiltro("todas")}
            className={`rounded-md border px-3 py-1 text-xs transition ${
              filtro === "todas"
                ? "border-[var(--brand)] bg-[var(--brand)] text-white"
                : "border-slate-300 bg-white text-slate-700 hover:border-[var(--brand)]"
            }`}
          >
            Todas
          </Link>
          <a
            href={`/api/conciliacao-ecd/exportar?clienteId=${clienteId}&ano=${anoSelecionado}&filtro=${filtro}`}
            className="rounded-md border border-slate-300 bg-white px-3 py-1 text-xs text-slate-700 transition hover:border-[var(--brand)] hover:text-[var(--brand)]"
            title="Baixa a planilha .xlsx com colunas Status (dropdown) e Observação em branco pro contador preencher."
          >
            📊 Exportar Excel
          </a>
          <BotaoImprimir />
        </div>
      </div>

      <p className="mb-3 text-xs text-slate-500">
        Agrupado pela <b>sintética da ECD</b> (plano referencial da Receita). Se a sintética
        <b> fecha</b> (Δ ≤ R$ 1), a exportação do Domínio pra ECD foi fiel naquele bloco — mesmo
        que alguma analítica interna tenha se compensado com outra. Se a sintética <b>diverge</b>,
        investigue e ajuste na <b>origem (Domínio)</b>; depois reexporte ou retifique o SPED.
      </p>

      {blocosVisiveis.map((bloco) => (
        <BlocoSinteticaCard
          key={`${bloco.grupo}-${bloco.codigoSinteticoEcd}`}
          bloco={bloco}
          filtro={filtro}
        />
      ))}

      {relatorio.soDominioSemSintetica.length > 0 && (
        <section className="card mt-6 p-4">
          <h3 className="mb-2 text-sm font-bold text-slate-800">
            ⚠ Analíticas Domínio sem sintética identificada
          </h3>
          <p className="mb-3 text-xs text-slate-500">
            Contas que existem no balanço do Domínio mas não têm analítica correspondente na ECD —
            não conseguimos apontar a sintética referencial delas. Provavelmente foram criadas no
            Domínio mas ainda não amarradas ao plano referencial.
          </p>
          {relatorio.soDominioSemSintetica.map((grupo) => (
            <div key={grupo.grupo} className="mb-3">
              <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                {grupo.rotulo}
              </h4>
              <ul className="mt-1 space-y-0.5 text-sm">
                {grupo.linhas.map((l, i) => (
                  <li key={`${l.descNorm}-${i}`} className="flex justify-between tabular-nums">
                    <span>
                      <span className="font-mono text-xs text-slate-500">{l.codigoDominio}</span>{" "}
                      {l.descricao}
                    </span>
                    <span className="text-slate-700">
                      {l.valorDominio === null ? "—" : moeda(l.valorDominio)}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </section>
      )}
    </>
  );
}

function BlocoSinteticaCard({
  bloco,
  filtro,
}: {
  bloco: BlocoSintetica;
  filtro: "divergentes" | "todas";
}) {
  const linhasFiltradas =
    filtro === "divergentes"
      ? bloco.analiticas.filter((l) => l.status !== "identica")
      : bloco.analiticas;

  // Sintética que fecha e filtro "só divergentes" — só mostra o cabeçalho.
  const mostrarAnaliticas = !bloco.fecha || filtro === "todas";

  return (
    <section
      className={`card mb-3 p-0 ${
        bloco.fecha ? "border-emerald-200" : "border-red-200"
      }`}
    >
      <header
        className={`flex flex-wrap items-center justify-between gap-2 px-4 py-2 ${
          bloco.fecha ? "bg-emerald-50" : "bg-red-50"
        }`}
      >
        <div className="flex min-w-0 items-center gap-2">
          <span className={`text-base font-bold ${bloco.fecha ? "text-emerald-700" : "text-red-700"}`}>
            {bloco.fecha ? "✓" : "✗"}
          </span>
          <div className="min-w-0">
            <div className="truncate text-sm font-bold text-slate-800">
              <span className="mr-2 font-mono text-xs text-slate-500">
                {bloco.codigoSinteticoEcd}
              </span>
              {bloco.descricaoSintetica}
            </div>
            <div className="text-[10px] uppercase tracking-wide text-slate-500">
              {ROTULO_GRUPO_UI[bloco.grupo]} · {bloco.analiticas.length} analítica(s)
            </div>
          </div>
        </div>
        <div className="flex flex-wrap items-baseline gap-3 text-xs tabular-nums">
          <span className="text-slate-600">
            Dom <b className="text-slate-800">{moeda(bloco.totalDominio)}</b>
          </span>
          <span className="text-slate-600">
            ECD <b className="text-slate-800">{moeda(bloco.totalEcd)}</b>
          </span>
          <span
            className={`rounded px-2 py-0.5 font-bold ${
              bloco.fecha ? "bg-emerald-100 text-emerald-800" : "bg-red-200 text-red-900"
            }`}
          >
            Δ {moeda(bloco.diferenca)}
          </span>
        </div>
      </header>
      {mostrarAnaliticas && linhasFiltradas.length > 0 && (
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-xs uppercase text-slate-600">
            <tr>
              <th className="w-8 px-2 py-2"></th>
              <th className="px-3 py-2 text-left">Descrição</th>
              <th className="px-3 py-2 text-left">Cód. Dom</th>
              <th className="px-3 py-2 text-right">Valor Dom</th>
              <th className="px-3 py-2 text-left">Cód. ECD</th>
              <th className="px-3 py-2 text-right">Valor ECD</th>
              <th className="px-3 py-2 text-right">Diferença</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {linhasFiltradas.map((l, idx) => (
              <LinhaContaTabela key={`${l.descNorm}-${idx}`} l={l} />
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

const ROTULO_GRUPO_UI: Record<BlocoSintetica["grupo"], string> = {
  "ativo-circulante": "Ativo Circulante",
  "ativo-nao-circulante": "Ativo Não Circulante",
  "passivo-circulante": "Passivo Circulante",
  "passivo-nao-circulante": "Passivo Não Circulante",
  "patrimonio-liquido": "Patrimônio Líquido",
  "nao-classificada": "Não classificada",
};

function Contador({ rotulo, valor, cor }: { rotulo: string; valor: number; cor: string }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wide text-slate-500">{rotulo}</div>
      <div className={`text-lg font-bold ${cor}`}>{valor}</div>
    </div>
  );
}

function LinhaContaTabela({ l }: { l: LinhaContaConciliacao }) {
  const rowBg =
    l.status === "divergente"
      ? "bg-red-50 text-red-900"
      : l.status === "so-dominio"
        ? "bg-amber-50 text-amber-900"
        : l.status === "so-ecd"
          ? "bg-amber-50 text-amber-900"
          : "text-slate-700";
  const marcador =
    l.status === "divergente"
      ? { icone: "✗", cor: "text-red-600" }
      : l.status === "so-dominio"
        ? { icone: "◐", cor: "text-amber-600", titulo: "Só no Domínio" }
        : l.status === "so-ecd"
          ? { icone: "◑", cor: "text-amber-600", titulo: "Só na ECD" }
          : { icone: "✓", cor: "text-emerald-600" };
  return (
    <tr className={rowBg}>
      <td className={`px-2 py-1.5 text-center font-bold ${marcador.cor}`} title={"titulo" in marcador ? marcador.titulo : undefined}>
        {marcador.icone}
      </td>
      <td className="px-3 py-1.5 font-medium">{l.descricao}</td>
      <td className="px-3 py-1.5 font-mono text-xs text-slate-600">{l.codigoDominio ?? "—"}</td>
      <td className="px-3 py-1.5 text-right tabular-nums">
        {l.valorDominio === null ? <span className="text-slate-400">—</span> : moeda(l.valorDominio)}
      </td>
      <td className="px-3 py-1.5 font-mono text-xs text-slate-600">{l.codigoEcd ?? "—"}</td>
      <td className="px-3 py-1.5 text-right tabular-nums">
        {l.valorEcd === null ? <span className="text-slate-400">—</span> : moeda(l.valorEcd)}
      </td>
      <td
        className={`px-3 py-1.5 text-right tabular-nums ${
          l.status === "divergente" ? "font-bold text-red-700" : "text-slate-500"
        }`}
      >
        {l.diferenca === null ? <span className="text-slate-400">—</span> : moeda(l.diferenca)}
      </td>
    </tr>
  );
}
