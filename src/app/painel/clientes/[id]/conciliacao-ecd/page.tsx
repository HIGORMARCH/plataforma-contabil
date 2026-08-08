/**
 * Conciliação Domínio × ECD — exibe o quadro comparativo por ano.
 *
 * Aplica-se a clientes do Lucro Real/Presumido. Simples Nacional deve usar
 * a conciliação × DEFIS (ver [[project-conciliacao-balanco-por-regime]]).
 */
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

  // Aviso: DEFIS quando o regime é Simples.
  const ehSimples = /simples/i.test(cliente.regimeTributario ?? "");

  let relatorio: ReturnType<typeof conciliar> | null = null;
  let arqEcd: string | null = null;
  let erro: string | null = null;
  const exercicio = cliente.exercicios.find((e) => e.ano === anoSelecionado);
  if (exercicio) {
    // Resolve o SPED-ECD via pasta única (C:\PlataformaContabil\<cliente>\SPED-ECD\<ano>\<ano>.txt).
    // Se ainda não estiver lá mas houver Cliente.pastaFiscal legado, copia
    // da origem ReceitanetBX/ECD/ pra pasta única automaticamente.
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
    <div>
      <div className="mb-6">
        <Link href={`/painel/clientes/${id}`} className="text-sm text-slate-500 hover:underline">
          ← Voltar para {cliente.razaoSocial}
        </Link>
        <h1 className="mt-1 text-2xl font-bold text-slate-800">
          Conciliação Domínio × ECD
        </h1>
        <p className="text-sm text-slate-500">
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

      <div className="mb-4 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
        Fonte única de arquivos: <code>{pastaClienteAbs}\SPED-ECD\</code>. Se um arquivo não
        estiver aqui mas houver <code>pastaFiscal</code> legado com ECD/, a plataforma copia
        automaticamente na primeira leitura.
      </div>

      {anosImportados.length === 0 && (
        <div className="mb-4 rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-sm text-slate-700">
          Nenhum exercício importado ainda pra este cliente. Importe balanços/DREs em{" "}
          <Link href={`/painel/clientes/${id}/exercicios`} className="text-[var(--brand)] underline">
            Adicionar documentos
          </Link>.
        </div>
      )}

      {anosImportados.length > 0 && (
        <div className="mb-6 flex flex-wrap gap-2">
          <span className="self-center text-sm text-slate-600">Exercício:</span>
          {anosImportados.map((a) => (
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

      {relatorio && (
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
    </div>
  );
}
