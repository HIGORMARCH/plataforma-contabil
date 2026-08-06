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
 * ⚠️ REGRA DO CONFRONTO — comparar só o que é comparável.
 *
 * O Segmento E da GIAM traz o ICMS a recolher QUEBRADO POR TIPO:
 *   N = normal da apuração   D = diferencial de alíquota das entradas
 *   S = substituição tributária   C = complementação   F = difal saídas   P = fundo pobreza
 *
 * O registro E110 do SPED Fiscal corresponde APENAS ao tipo N — a apuração
 * normal. O difal de entradas (D) e o ST (S) são apurados fora do E110.
 *
 * Comparar o E110 contra o TOTAL do Segmento E acusa divergência em todo mês
 * que tenha difal — falso alarme. Validado com a PALMAS HALL 2022: comparando
 * contra o total, os 10 meses "divergiam"; contra o tipo N, 8 batem exatamente.
 *
 * ⇒ Confronto: SPED E110 (VL_ICMS_RECOLHER) × GIAM Segmento E, LINHA TIPO "N".
 *   Os demais tipos aparecem como informação, nunca como divergência.
 */

const TOLERANCIA = 0.01; // centavo — diferença abaixo disso é arredondamento
const TIPO_NORMAL = "N";

type LinhaCompetencia = {
  competencia: string; // MM/AAAA
  sped: number | null;
  giam: number | null; // só o tipo N
  outrosTipos: number; // difal, ST etc. — informativo
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
        select: {
          periodoApuracao: true,
          // Precisa do detalhe por tipo: só o "N" é comparável com o E110 do SPED.
          icmsARecolher: { select: { tipo: true, valor: true } },
        },
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
        outrosTipos: 0,
        diferenca: null,
      });
    }
    for (const g of c.giamApuracoes) {
      const k = chave(g.periodoApuracao);
      // Só o tipo N (apuração normal) é comparável com o E110 do SPED.
      const normal = g.icmsARecolher
        .filter((l) => l.tipo === TIPO_NORMAL)
        .reduce((s, l) => s + Number(l.valor), 0);
      const outros = g.icmsARecolher
        .filter((l) => l.tipo !== TIPO_NORMAL)
        .reduce((s, l) => s + Number(l.valor), 0);

      const atual = porCompetencia.get(k);
      if (atual) {
        atual.giam = normal;
        atual.outrosTipos = outros;
      } else {
        porCompetencia.set(k, {
          competencia: k,
          sped: null,
          giam: normal,
          outrosTipos: outros,
          diferenca: null,
        });
      }
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

      <div className="rounded-xl border border-amber-200 bg-amber-50 px-5 py-4">
        <p className="text-sm font-semibold text-amber-900">
          Duas etapas de auditoria ICMS
        </p>
        <p className="mt-1.5 text-sm leading-relaxed text-amber-800">
          <b>Etapa 1</b> — SPED Fiscal × GIAM (arquivo do Domínio): prova que a escrituração é
          <strong> coerente</strong>. Ambos saem do Domínio.
        </p>
        <p className="mt-1.5 text-sm leading-relaxed text-amber-800">
          <b>Etapa 2</b> — GIAM (Domínio) × GIAM SEFAZ: prova <strong>integridade</strong> — se
          alguém alterar o arquivo do Domínio depois de transmitir, a divergência com o portal
          aparece linha a linha por CFOP. Robô Playwright pronto — sincronize por competência no
          botão &quot;Buscar no portal SEFAZ&quot; da tela SPED-Fiscal do cliente.
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
                  <th className="px-4 py-3 text-center font-semibold">
                    GIAM (arquivo do Domínio)
                  </th>
                  <th className="px-4 py-3 font-semibold">Competências</th>
                  <th className="px-4 py-3 font-semibold">Resultado</th>
                </tr>
              </thead>
              <tbody>
                {comDados.map((l) => (
                  <tr key={l.cliente.id} className="border-b border-slate-100 last:border-0 align-top">
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
                    <td className="px-4 py-3">
                      <ChipsCompetencia clienteId={l.cliente.id} competencias={l.competencias} />
                    </td>
                    <td className="px-4 py-3">
                      <Resultado
                        conferidas={l.conferidas}
                        divergentes={l.divergentes}
                        soUmLado={l.soUmLado}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-xs leading-relaxed text-slate-600">
            <p>
              O confronto compara o <strong>ICMS a recolher da apuração normal</strong>: registro
              E110 do SPED Fiscal × Segmento E da GIAM, <strong>linha do tipo &quot;N&quot;</strong>.
              Diferenças de até um centavo contam como arredondamento.
            </p>
            <p className="mt-1.5">
              O <strong>diferencial de alíquota</strong> e a <strong>substituição tributária</strong>{" "}
              aparecem na GIAM em linhas próprias e <strong>não existem no E110</strong> — por isso
              não entram na comparação. Somá-los acusaria divergência em todo mês que tivesse difal.
            </p>
            <p className="mt-1.5">Clique no cliente para ver competência por competência.</p>
          </div>
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

/**
 * Chips clicáveis por competência — cada um leva pro confronto detalhado
 * daquele mês. Cor indica o resultado (verde = bate, âmbar = divergente,
 * cinza = só um lado). Máximo de 24 chips (2 anos) na primeira dobra.
 */
function ChipsCompetencia({
  clienteId,
  competencias,
}: {
  clienteId: string;
  competencias: LinhaCompetencia[];
}) {
  if (competencias.length === 0) {
    return <span className="text-xs text-slate-400">—</span>;
  }
  return (
    <div className="flex max-w-md flex-wrap gap-1">
      {competencias.map((c) => {
        const [mes, ano] = c.competencia.split("/");
        const href = `/painel/auditoria-obrigacoes-acessorias/${clienteId}/${ano}/${mes}`;
        const status =
          c.sped === null || c.giam === null
            ? "sem-par"
            : Math.abs(c.diferenca ?? 0) > TOLERANCIA
              ? "divergente"
              : "ok";
        const cls =
          status === "ok"
            ? "bg-emerald-50 text-emerald-800 hover:bg-emerald-100 border-emerald-200"
            : status === "divergente"
              ? "bg-amber-50 text-amber-800 hover:bg-amber-100 border-amber-200"
              : "bg-slate-50 text-slate-500 hover:bg-slate-100 border-slate-200";
        const titulo =
          status === "ok"
            ? "SPED e GIAM Domínio batem — abrir detalhes"
            : status === "divergente"
              ? `Divergência de ${new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(c.diferenca ?? 0)} — abrir detalhes`
              : "Só um lado importado — abrir detalhes";
        return (
          <Link
            key={c.competencia}
            href={href}
            title={titulo}
            className={`rounded border px-2 py-0.5 font-mono text-xs ${cls}`}
          >
            {c.competencia}
          </Link>
        );
      })}
    </div>
  );
}
