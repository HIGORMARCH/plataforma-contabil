import Link from "next/link";
import { requireSessao, PAPEIS_INTERNOS } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { redirect } from "next/navigation";

/**
 * Auditoria de Obrigações Acessórias — visão RETROSPECTIVA ("o que já foi
 * auditado"), não um fluxo de trabalho.
 *
 * Motor único de dados no menu FISCAL: mostra, por cliente, quais SPEDs e GIAMs
 * já foram importados e se as declarações batem entre si (SPED × GIAM).
 *
 * Filosofia de auditoria em cascata (decisão do Higor):
 *   1. FISCAL   — as declarações batem entre si?  Se não, pára aqui.
 *   2. FOLHA    — encargos calculados × pagos.
 *   3. CONTÁBIL — última barreira; a contabilidade descobre o que passou.
 *
 * O confronto usado aqui é o ICMS a recolher: SPED (E110 VL_ICMS_RECOLHER)
 * × GIAM (Segmento E consolidado).
 */

const TOLERANCIA = 0.01; // centavo — diferença abaixo disso é arredondamento

type LinhaCompetencia = {
  competencia: string; // MM/AAAA
  sped: number | null;
  giam: number | null;
  diferenca: number | null;
};

export default async function AuditoriaObrigacoesAcessoriasPage() {
  const sessao = await requireSessao();
  if (!PAPEIS_INTERNOS.includes(sessao.papel)) redirect("/painel");

  const clientes = await prisma.cliente.findMany({
    where: { escritorioId: sessao.escritorioId },
    orderBy: { razaoSocial: "asc" },
    select: {
      id: true,
      razaoSocial: true,
      nomeFantasia: true,
      cnpj: true,
      inscricaoEstadual: true,
      spedApuracoes: {
        select: { periodoApuracao: true, icmsARecolher: true },
        orderBy: { periodoApuracao: "asc" },
      },
      giamApuracoes: {
        select: { periodoApuracao: true, icmsARecolherTotal: true },
        orderBy: { periodoApuracao: "asc" },
      },
    },
  });

  const linhas = clientes.map((c) => {
    const porCompetencia = new Map<string, LinhaCompetencia>();

    const chave = (d: Date) =>
      `${String(d.getUTCMonth() + 1).padStart(2, "0")}/${d.getUTCFullYear()}`;

    for (const a of c.spedApuracoes) {
      const k = chave(a.periodoApuracao);
      porCompetencia.set(k, {
        competencia: k,
        sped: Number(a.icmsARecolher),
        giam: null,
        diferenca: null,
      });
    }
    for (const g of c.giamApuracoes) {
      const k = chave(g.periodoApuracao);
      const atual = porCompetencia.get(k);
      const valor = Number(g.icmsARecolherTotal);
      if (atual) atual.giam = valor;
      else
        porCompetencia.set(k, { competencia: k, sped: null, giam: valor, diferenca: null });
    }
    for (const l of porCompetencia.values()) {
      if (l.sped !== null && l.giam !== null) l.diferenca = l.sped - l.giam;
    }

    const competencias = [...porCompetencia.values()].sort((a, b) =>
      ordenavel(a.competencia).localeCompare(ordenavel(b.competencia)),
    );
    const conferidas = competencias.filter((l) => l.diferenca !== null);
    const divergentes = conferidas.filter((l) => Math.abs(l.diferenca!) > TOLERANCIA);
    const soUmLado = competencias.filter((l) => l.sped === null || l.giam === null);

    return {
      cliente: c,
      competencias,
      totalSped: c.spedApuracoes.length,
      totalGiam: c.giamApuracoes.length,
      conferidas: conferidas.length,
      divergentes: divergentes.length,
      soUmLado: soUmLado.length,
    };
  });

  const comDados = linhas.filter((l) => l.totalSped > 0 || l.totalGiam > 0);
  const totais = {
    clientes: comDados.length,
    sped: comDados.reduce((s, l) => s + l.totalSped, 0),
    giam: comDados.reduce((s, l) => s + l.totalGiam, 0),
    conferidas: comDados.reduce((s, l) => s + l.conferidas, 0),
    divergentes: comDados.reduce((s, l) => s + l.divergentes, 0),
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-800">Auditoria de Obrigações Acessórias</h1>
        <p className="mt-1 text-sm text-slate-500">
          O que já foi auditado, por cliente — as declarações fiscais conferidas entre si
        </p>
      </div>

      {comDados.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white px-6 py-10 text-center">
          <p className="font-semibold text-slate-700">Nenhuma declaração importada ainda</p>
          <p className="mx-auto mt-2 max-w-xl text-sm text-slate-500">
            Esta tela mostra o resultado das auditorias já feitas. Para começar, abra a ficha de um
            cliente e importe os arquivos de <strong>SPED Fiscal</strong> e <strong>GIAM</strong> —
            ou aponte a pasta onde eles ficam, que o sistema varre sozinho.
          </p>
          <Link
            href="/painel/clientes"
            className="mt-5 inline-block rounded-lg bg-slate-800 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700"
          >
            Ir para Clientes
          </Link>
        </div>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <Indicador rotulo="Clientes com dados" valor={totais.clientes} />
            <Indicador rotulo="SPEDs importados" valor={totais.sped} />
            <Indicador rotulo="GIAMs importadas" valor={totais.giam} />
            <Indicador rotulo="Competências conferidas" valor={totais.conferidas} />
            <Indicador
              rotulo="Divergências"
              valor={totais.divergentes}
              alerta={totais.divergentes > 0}
            />
          </div>

          <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
            <table className="w-full min-w-[820px] text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                  <th className="px-4 py-3 font-semibold">Cliente</th>
                  <th className="px-4 py-3 font-semibold">Insc. Estadual</th>
                  <th className="px-4 py-3 text-center font-semibold">SPED</th>
                  <th className="px-4 py-3 text-center font-semibold">GIAM</th>
                  <th className="px-4 py-3 font-semibold">Período coberto</th>
                  <th className="px-4 py-3 font-semibold">Resultado</th>
                </tr>
              </thead>
              <tbody>
                {comDados.map((l) => {
                  const primeira = l.competencias[0]?.competencia;
                  const ultima = l.competencias[l.competencias.length - 1]?.competencia;
                  return (
                    <tr key={l.cliente.id} className="border-b border-slate-100 last:border-0">
                      <td className="px-4 py-3">
                        <Link
                          href={`/painel/clientes/${l.cliente.id}/sped`}
                          className="font-medium text-slate-800 hover:underline"
                        >
                          {l.cliente.nomeFantasia || l.cliente.razaoSocial}
                        </Link>
                        <div className="text-xs text-slate-400">{l.cliente.cnpj}</div>
                      </td>
                      <td className="px-4 py-3 text-slate-600">
                        {l.cliente.inscricaoEstadual || (
                          <span className="text-slate-400">não cadastrada</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-center tabular-nums text-slate-700">
                        {l.totalSped}
                      </td>
                      <td className="px-4 py-3 text-center tabular-nums text-slate-700">
                        {l.totalGiam}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-slate-600">
                        {primeira === ultima ? primeira : `${primeira} a ${ultima}`}
                      </td>
                      <td className="px-4 py-3">
                        <Resultado
                          conferidas={l.conferidas}
                          divergentes={l.divergentes}
                          soUmLado={l.soUmLado}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <p className="text-xs text-slate-500">
            O confronto compara o <strong>ICMS a recolher</strong> declarado no SPED Fiscal (registro
            E110) com o da GIAM (Segmento E). Diferenças de até um centavo são tratadas como
            arredondamento. Clique no cliente para ver competência por competência.
          </p>
        </>
      )}
    </div>
  );
}

function Indicador({
  rotulo,
  valor,
  alerta = false,
}: {
  rotulo: string;
  valor: number;
  alerta?: boolean;
}) {
  return (
    <div
      className={`rounded-xl border px-4 py-3 ${
        alerta ? "border-amber-200 bg-amber-50" : "border-slate-200 bg-white"
      }`}
    >
      <div
        className={`text-2xl font-bold tabular-nums ${
          alerta ? "text-amber-700" : "text-slate-800"
        }`}
      >
        {valor}
      </div>
      <div className="mt-0.5 text-xs text-slate-500">{rotulo}</div>
    </div>
  );
}

function Resultado({
  conferidas,
  divergentes,
  soUmLado,
}: {
  conferidas: number;
  divergentes: number;
  soUmLado: number;
}) {
  const partes: React.ReactNode[] = [];

  if (divergentes > 0) {
    partes.push(
      <span
        key="div"
        className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800"
      >
        {divergentes} divergente{divergentes > 1 ? "s" : ""}
      </span>,
    );
  }
  if (conferidas - divergentes > 0) {
    partes.push(
      <span
        key="ok"
        className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-800"
      >
        {conferidas - divergentes} conferida{conferidas - divergentes > 1 ? "s" : ""}
      </span>,
    );
  }
  if (soUmLado > 0) {
    partes.push(
      <span
        key="falta"
        className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600"
      >
        {soUmLado} sem par
      </span>,
    );
  }
  if (partes.length === 0) {
    return <span className="text-xs text-slate-400">—</span>;
  }
  return <div className="flex flex-wrap gap-1.5">{partes}</div>;
}

/** "07/2026" -> "2026-07", para ordenar cronologicamente. */
function ordenavel(competencia: string): string {
  const [mes, ano] = competencia.split("/");
  return `${ano}-${mes}`;
}
