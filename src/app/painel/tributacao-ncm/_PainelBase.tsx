import { prisma } from "@/lib/db";
import { montarPanoramaBase } from "@/lib/relatorios/panoramaBase";
import { rotuloRegime } from "@/lib/tributacao-ncm/relatorioProcesso";

/**
 * Painel da base de NCM da plataforma.
 *
 * A base é o ativo do módulo: quanto maior, menos consulta externa o próximo
 * cliente exige. Este painel mostra o tamanho, a composição e o crescimento
 * recente — inclusive quanto do que entrou veio de consulta à Econet, que é o
 * conhecimento que a base não tinha antes.
 */

const ROTULO_ORIGEM_BASE: Record<string, string> = {
  base_plataforma: "Carga inicial",
  econet_cache: "Aprendido na Econet",
  manual: "Cadastro manual",
};

export async function PainelBase({ escritorioId }: { escritorioId: string }) {
  const registros = await prisma.ncmBase.findMany({
    select: { ncm: true, origem: true, atualizadoEm: true, configuracao: { select: { tipo: true } } },
  });

  // O OUTRO LADO DO DE-PARA: NCMs que os clientes trouxeram e a base ainda não
  // classifica. Sem isto, o cruzamento seria de mão única — a base classificaria
  // o cliente, mas não aprenderia com ele, e o mesmo NCM voltaria desconhecido
  // no próximo cliente que o tivesse.
  //
  // Não há tabela de pendências: a lista é derivada das linhas de vigência sem
  // configuração. Um registro só vira base quando tem classificação de verdade —
  // gravar NCM sem regime seria criar buraco na base, não crescimento.
  const pendentes = await prisma.ncmVigencia.findMany({
    where: { configuracaoId: null, vigencia: { cliente: { escritorioId } } },
    select: { ncm: true },
    distinct: ["ncm"],
    orderBy: { ncm: "asc" },
  });

  const p = montarPanoramaBase(
    registros.map((r) => ({
      ncm: r.ncm,
      origem: r.origem,
      tipo: r.configuracao.tipo,
      atualizadoEm: r.atualizadoEm,
    })),
    new Date(),
  );

  if (p.total === 0) return null;

  return (
    <section className="mb-8">
      <h2 className="mb-3 text-lg font-bold text-slate-800">Nossa base de NCM</h2>
      <div className="card p-5">
        <div className="mb-4 flex flex-wrap items-baseline gap-x-6 gap-y-1">
          <div>
            <span className="text-3xl font-bold text-slate-800">{p.total.toLocaleString("pt-BR")}</span>{" "}
            <span className="text-sm text-slate-500">NCMs classificados</span>
          </div>
          {p.acrescentadosRecentes > 0 && (
            <div className="text-sm text-emerald-700">
              +{p.acrescentadosRecentes} nos últimos 30 dias
            </div>
          )}
          {p.ultimaInclusao && (
            <div className="text-xs text-slate-500">
              última inclusão em {p.ultimaInclusao.toLocaleDateString("pt-BR")}
            </div>
          )}
        </div>

        <div className="grid gap-5 md:grid-cols-2">
          <div>
            <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">
              Por regime
            </h3>
            <table className="w-full text-sm">
              <tbody>
                {p.porRegime.map((r) => (
                  <tr key={r.tipo} className="border-b border-slate-100">
                    <td className="py-1">{rotuloRegime(r.tipo)}</td>
                    <td className="py-1 text-right font-semibold">
                      {r.quantidade.toLocaleString("pt-BR")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div>
            <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">
              Como entrou na base
            </h3>
            <table className="w-full text-sm">
              <tbody>
                {p.porOrigem.map((o) => (
                  <tr key={o.origem} className="border-b border-slate-100">
                    <td className="py-1">{ROTULO_ORIGEM_BASE[o.origem] ?? o.origem}</td>
                    <td className="py-1 text-right font-semibold">
                      {o.quantidade.toLocaleString("pt-BR")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-2 text-xs text-slate-500">
              Cada NCM aprendido na Econet fica na base: o próximo cliente que tiver esse produto
              já encontra classificado, sem nova consulta.
            </p>
          </div>
        </div>

        {pendentes.length > 0 && (
          <div className="mt-5 rounded border border-amber-200 bg-amber-50 px-3 py-3 text-sm text-amber-900">
            <p className="font-semibold">
              {pendentes.length}{" "}
              {pendentes.length === 1
                ? "NCM veio de cliente e a base ainda não classifica"
                : "NCMs vieram de clientes e a base ainda não classifica"}
            </p>
            <p className="mt-1 text-xs">
              Estes são o outro lado do de-para: o cliente tem, a base não. Classificar na Econet
              acrescenta cada um à base — e aí ele passa a valer para todos os clientes seguintes.
            </p>
            <p className="mt-2 font-mono text-xs">{pendentes.map((p) => p.ncm).join(" ")}</p>
          </div>
        )}
      </div>
    </section>
  );
}
