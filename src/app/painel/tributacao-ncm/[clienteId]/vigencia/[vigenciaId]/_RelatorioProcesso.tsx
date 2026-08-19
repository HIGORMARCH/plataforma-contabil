import {
  montarRelatorioProcesso,
  rotuloOrigem,
  rotuloRegime,
  type LinhaParaRelatorio,
} from "@/lib/tributacao-ncm/relatorioProcesso";
import { PrintHeaderNcm } from "./_PrintHeaderNcm";
import { BotaoImprimir } from "./_BotaoImprimir";

interface EscritorioTimbre {
  razaoSocial: string;
  nomeFantasia?: string | null;
  cnpj?: string | null;
  crc?: string | null;
  endereco?: string | null;
  telefone?: string | null;
  email?: string | null;
  site?: string | null;
  logoDataUrl?: string | null;
}

/**
 * Relatório do processo de classificação — server component, renderizado com
 * os dados que a página já buscou.
 *
 * Imprimível: o cabeçalho traz cliente e vigência, e os blocos evitam quebra no
 * meio (`break-inside-avoid`), porque este é um papel que o contador leva pra
 * conferência.
 */
export function RelatorioProcesso({
  linhas,
  cliente,
  cnpj,
  vigencia,
  escritorio,
}: {
  linhas: LinhaParaRelatorio[];
  cliente: string;
  cnpj: string;
  vigencia: Date;
  escritorio: EscritorioTimbre | null;
}) {
  const r = montarRelatorioProcesso(linhas);
  if (r.total === 0) return null;

  return (
    <section className="mb-6">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-lg font-bold text-slate-800">Relatório do processo</h2>
        <BotaoImprimir />
      </div>

      {/* Timbre do escritório — aparece só no papel. */}
      <PrintHeaderNcm
        cliente={cliente}
        cnpj={cnpj}
        vigencia={vigencia}
        totalNcms={r.total}
        escritorio={escritorio}
      />

      <div className="card p-5">
        <header className="mb-4 border-b border-slate-200 pb-3 no-print">
          <p className="text-sm font-semibold text-slate-800">{cliente}</p>
          <p className="text-xs text-slate-500">
            Vigência {vigencia.toLocaleDateString("pt-BR")} · {r.total} NCMs ·{" "}
            {r.codigosDoCliente} códigos na tabela do cliente
          </p>
        </header>

        {/* ---- De onde veio cada NCM ---- */}
        <div className="mb-5 grid gap-4 md:grid-cols-2">
          <div className="break-inside-avoid">
            <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">
              Origem dos NCMs
            </h3>
            <table className="w-full text-sm">
              <tbody>
                {r.porOrigem.map((o) => (
                  <tr key={o.origem} className="border-b border-slate-100">
                    <td className="py-1">{rotuloOrigem(o.origem)}</td>
                    <td className="py-1 text-right font-semibold">{o.quantidade}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="break-inside-avoid">
            <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">
              Regime segundo a nossa base
            </h3>
            <table className="w-full text-sm">
              <tbody>
                {r.porRegime.map((t) => (
                  <tr key={t.tipo} className="border-b border-slate-100">
                    <td className="py-1">{rotuloRegime(t.tipo)}</td>
                    <td className="py-1 text-right font-semibold">{t.quantidade}</td>
                  </tr>
                ))}
                {r.semClassificacao.length > 0 && (
                  <tr className="border-b border-slate-100">
                    <td className="py-1 text-amber-800">Sem classificação</td>
                    <td className="py-1 text-right font-semibold text-amber-800">
                      {r.semClassificacao.length}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* ---- Erro demonstrável no cadastro do cliente ---- */}
        <div className="mb-5 break-inside-avoid">
          <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">
            Cadastro do cliente × nossa base
          </h3>
          {r.codigosIncoerentes.length === 0 ? (
            <div className="rounded border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-900">
              ✔ Nenhum código do cliente agrupa NCMs de regimes diferentes. O cadastro dele é
              coerente com a nossa base.
            </div>
          ) : (
            <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-900">
              <p className="font-semibold">
                {r.codigosIncoerentes.length}{" "}
                {r.codigosIncoerentes.length === 1
                  ? "código do cliente agrupa NCMs de regimes diferentes"
                  : "códigos do cliente agrupam NCMs de regimes diferentes"}
              </p>
              <p className="mt-1 text-xs">
                No Domínio, cada código carrega um único conjunto de parâmetros fiscais. Como estes
                agrupam NCMs de regimes distintos, parte dos produtos está sendo tributada de forma
                errada — qualquer que seja o CST escolhido para o código.
              </p>
              {r.codigosIncoerentes.map((c) => (
                <div key={c.codigoCliente} className="mt-3 break-inside-avoid">
                  <p className="font-mono text-xs font-semibold">
                    #{c.codigoCliente} — {c.descricaoCliente}
                  </p>
                  <table className="mt-1 w-full text-xs">
                    <tbody>
                      {c.itens.map((i) => (
                        <tr key={i.ncm} className="border-t border-red-100">
                          <td className="py-1 font-mono">{i.ncm}</td>
                          <td className="py-1">{rotuloRegime(i.tipo)}</td>
                          <td className="py-1 text-right">{i.descricaoConfig}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* A lista item a item saiu daqui em 19/08/2026.
            A vigência passou a espelhar a base inteira, e a tabela de "regime
            especial" virou 3.093 linhas despejadas na tela — deixou de ser
            conferência e virou ruído. A contagem por regime acima já dá o
            número; para ver os NCMs, a lista por regime logo abaixo abre com um
            clique. */}

        {/* ---- O que falta ---- */}
        {r.semClassificacao.length > 0 && (
          <div className="break-inside-avoid rounded border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            <p className="font-semibold">
              {r.semClassificacao.length}{" "}
              {r.semClassificacao.length === 1 ? "NCM ainda sem classificação" : "NCMs ainda sem classificação"}
            </p>
            <p className="mt-1 font-mono text-xs">{r.semClassificacao.join(" ")}</p>
            <p className="mt-1 text-xs">
              Não estão na base da plataforma. Precisam de consulta à Econet.
            </p>
          </div>
        )}
      </div>
    </section>
  );
}
