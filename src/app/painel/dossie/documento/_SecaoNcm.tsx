import { prisma } from "@/lib/db";
import {
  montarRelatorioProcesso,
  rotuloOrigem,
  rotuloRegime,
} from "@/lib/tributacao-ncm/relatorioProcesso";

/**
 * Seção "Classificação de NCM" do dossiê.
 *
 * Usa a MESMA função de análise da tela do módulo (`montarRelatorioProcesso`),
 * então o que sai aqui e o que sai lá não podem divergir.
 *
 * Pega a vigência mais recente que tenha NCMs — é a que representa o estado
 * atual da tributação do cliente.
 */
export async function SecaoNcm({ clienteId }: { clienteId: string }) {
  const vigencia = await prisma.vigenciaNcm.findFirst({
    where: { clienteId, ncms: { some: {} } },
    include: { ncms: { include: { configuracao: true } } },
    orderBy: { dataVigencia: "desc" },
  });

  if (!vigencia) {
    return (
      <section className="card mb-6 break-inside-avoid p-5">
        <h2 className="mb-2 text-lg font-bold text-slate-800">Classificação de NCM — PIS/COFINS</h2>
        <p className="text-sm text-amber-800">
          Este cliente ainda não tem vigência de NCM com dados. Nada a relatar.
        </p>
      </section>
    );
  }

  const r = montarRelatorioProcesso(
    vigencia.ncms.map((n) => ({
      ncm: n.ncm,
      origem: n.origem,
      codigoCliente: n.codigoCliente,
      descricaoCliente: n.descricaoCliente,
      tipo: n.configuracao?.tipo ?? null,
      codigoConfig: n.configuracao?.codigo ?? null,
      descricaoConfig: n.configuracao?.descricao ?? null,
    })),
  );

  return (
    <section className="card mb-6 p-5">
      <h2 className="mb-1 text-lg font-bold text-slate-800">Classificação de NCM — PIS/COFINS</h2>
      <p className="mb-4 text-xs text-slate-500">
        Vigência {vigencia.dataVigencia.toLocaleDateString("pt-BR")} · {r.total} NCMs
      </p>

      <div className="mb-4 grid gap-4 md:grid-cols-2">
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
            Regime apurado
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

      {r.codigosIncoerentes.length > 0 && (
        <div className="mb-4 break-inside-avoid rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-900">
          <p className="font-semibold">
            {r.codigosIncoerentes.length}{" "}
            {r.codigosIncoerentes.length === 1
              ? "código do cliente agrupa NCMs de regimes diferentes"
              : "códigos do cliente agrupam NCMs de regimes diferentes"}
          </p>
          <p className="mt-1 text-xs">
            Cada código carrega um único conjunto de parâmetros fiscais no Domínio; agrupando
            regimes distintos, parte dos produtos é tributada de forma errada.
          </p>
          {r.codigosIncoerentes.map((c) => (
            <div key={c.codigoCliente} className="mt-2 break-inside-avoid">
              <p className="font-mono text-xs font-semibold">
                #{c.codigoCliente} — {c.descricaoCliente}
              </p>
              {c.itens.map((i) => (
                <p key={i.ncm} className="font-mono text-xs">
                  {i.ncm} · {rotuloRegime(i.tipo)} · {i.descricaoConfig}
                </p>
              ))}
            </div>
          ))}
        </div>
      )}

      {r.regimesEspeciais.length > 0 && (
        <div className="mb-4 break-inside-avoid">
          <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">
            NCMs em regime especial — conferir ({r.regimesEspeciais.length})
          </h3>
          <div className="overflow-x-auto rounded border border-slate-200">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-3 py-2">NCM</th>
                  <th className="px-3 py-2">Descrição no cliente</th>
                  <th className="px-3 py-2">Regime</th>
                </tr>
              </thead>
              <tbody>
                {r.regimesEspeciais.map((i) => (
                  <tr key={i.ncm} className="border-t border-slate-100">
                    <td className="px-3 py-2 font-mono">{i.ncm}</td>
                    <td className="px-3 py-2 text-slate-600">{i.descricaoCliente ?? "—"}</td>
                    <td className="px-3 py-2 font-semibold text-amber-800">
                      {rotuloRegime(i.tipo)} · {i.descricaoConfig}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {r.semClassificacao.length > 0 && (
        <div className="break-inside-avoid rounded border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          <p className="font-semibold">
            {r.semClassificacao.length}{" "}
            {r.semClassificacao.length === 1
              ? "NCM ainda sem classificação"
              : "NCMs ainda sem classificação"}
          </p>
          <p className="mt-1 font-mono text-xs">{r.semClassificacao.join(" ")}</p>
        </div>
      )}
    </section>
  );
}
