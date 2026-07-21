import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireSessao, PAPEIS_INTERNOS } from "@/lib/auth";
import { prisma } from "@/lib/db";

/**
 * Confronto de UMA competência (cliente × ano × mês) entre as 3 fontes:
 *
 *   SPED-Fiscal          — Receita Federal
 *   GIAM (arquivo do Domínio) — o que o Domínio guarda hoje
 *   GIAM SEFAZ           — a que o portal recepcionou  (Etapa 2 — robô pendente)
 *
 * Regra do rótulo (feedback do Higor): NUNCA escrever só "GIAM" — sempre
 * "GIAM (arquivo do Domínio)" ou "GIAM SEFAZ". Ambiguidade engana o leitor.
 *
 * Regra das colunas (feedback do Higor): as três fontes usam AS MESMAS colunas.
 * Se a fonte não tem o dado (SPED não traz Segmento B por CFOP; SEFAZ ainda
 * não foi raspada), mostra "—" na célula, MAS NÃO REMOVE A COLUNA.
 */

const fmtBrl = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

const fmtMesAno = new Intl.DateTimeFormat("pt-BR", {
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});

const TOLERANCIA = 0.01;
const TIPO_NORMAL = "N";

export default async function ConfrontoCompetencia({
  params,
}: {
  params: Promise<{ clienteId: string; ano: string; mes: string }>;
}) {
  const sessao = await requireSessao();
  if (!PAPEIS_INTERNOS.includes(sessao.papel)) redirect("/painel");

  const { clienteId, ano, mes } = await params;
  const anoNum = Number(ano);
  const mesNum = Number(mes);
  if (!Number.isFinite(anoNum) || !Number.isFinite(mesNum) || mesNum < 1 || mesNum > 12) {
    notFound();
  }
  const competencia = new Date(Date.UTC(anoNum, mesNum - 1, 1));

  const cliente = await prisma.cliente.findFirst({
    where: { id: clienteId, escritorioId: sessao.escritorioId },
    select: {
      id: true,
      razaoSocial: true,
      nomeFantasia: true,
      cnpj: true,
      inscricaoEstadual: true,
    },
  });
  if (!cliente) notFound();

  const [sped, giamDominio] = await Promise.all([
    prisma.spedApuracao.findFirst({
      where: { clienteId, periodoApuracao: competencia },
    }),
    prisma.giamApuracao.findFirst({
      where: { clienteId, periodoApuracao: competencia, retificacao: "00" },
      include: {
        icmsARecolher: true,
        linhasSegmentoB: { orderBy: [{ natureza: "asc" }, { cfop: "asc" }] },
      },
    }),
  ]);

  // Totais canônicos por fonte (SEFAZ ainda vazio — placeholder).
  const spedTotais = sped
    ? {
        totalCompras: Number(sped.totalCompras),
        totalVendas: Number(sped.totalVendas),
        creditoEntradas: Number(sped.totalCreditos),
        debitoSaidas: Number(sped.totalDebitos),
        saldoCredorAnterior: Number(sped.saldoCredorAnterior),
        deducoes: Number(sped.deducoes),
        icmsARecolher: Number(sped.icmsARecolher),
      }
    : null;

  const giamTotais = giamDominio
    ? {
        totalCompras: Number(giamDominio.totalCompras),
        totalVendas: Number(giamDominio.totalVendas),
        creditoEntradas: Number(giamDominio.creditoEntradas),
        debitoSaidas: Number(giamDominio.debitoSaidas),
        saldoCredorAnterior: Number(giamDominio.saldoCredorAnterior),
        deducoes: Number(giamDominio.deducoes),
        icmsARecolher: giamDominio.icmsARecolher
          .filter((l) => l.tipo === TIPO_NORMAL)
          .reduce((s, l) => s + Number(l.valor), 0),
      }
    : null;

  const entradas = (giamDominio?.linhasSegmentoB ?? []).filter((l) => l.natureza === "0");
  const saidas = (giamDominio?.linhasSegmentoB ?? []).filter((l) => l.natureza === "1");

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/painel/auditoria-obrigacoes-acessorias"
          className="text-sm text-slate-500 hover:underline"
        >
          ← Voltar
        </Link>
        <h1 className="mt-1 text-2xl font-bold text-slate-800">
          {cliente.nomeFantasia || cliente.razaoSocial}
        </h1>
        <p className="text-sm text-slate-500">
          Competência{" "}
          <strong className="capitalize">{fmtMesAno.format(competencia)}</strong>
          {cliente.inscricaoEstadual && (
            <> · IE {cliente.inscricaoEstadual}</>
          )}{" "}
          · CNPJ {cliente.cnpj}
        </p>
      </div>

      {/* ---- BLOCO 1: TOTAIS DE APURAÇÃO (as 3 fontes lado a lado) ---- */}
      <section className="rounded-xl border border-slate-200 bg-white p-5">
        <h2 className="mb-1 text-sm font-bold uppercase tracking-wide text-slate-500">
          Totais da apuração — comparativo entre as fontes
        </h2>
        <p className="mb-4 text-xs text-slate-400">
          Mesmas colunas nas três fontes. Divergência entre valores da mesma linha = declaração
          incoerente.
        </p>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-slate-200 text-left text-xs uppercase text-slate-500">
              <tr>
                <th className="pb-2 pr-3">Coluna</th>
                <th className="pb-2 pr-3 text-right">SPED-Fiscal</th>
                <th className="pb-2 pr-3 text-right">GIAM (arquivo Domínio)</th>
                <th className="pb-2 pr-3 text-right">GIAM SEFAZ</th>
                <th className="pb-2 pr-3 text-right">Δ SPED × Domínio</th>
              </tr>
            </thead>
            <tbody>
              <LinhaComparativa rotulo="Total Compras" sped={spedTotais?.totalCompras ?? null} giam={giamTotais?.totalCompras ?? null} />
              <LinhaComparativa rotulo="Total Vendas" sped={spedTotais?.totalVendas ?? null} giam={giamTotais?.totalVendas ?? null} />
              <LinhaComparativa rotulo="Crédito das Entradas (ICMS)" sped={spedTotais?.creditoEntradas ?? null} giam={giamTotais?.creditoEntradas ?? null} />
              <LinhaComparativa rotulo="Débito das Saídas (ICMS)" sped={spedTotais?.debitoSaidas ?? null} giam={giamTotais?.debitoSaidas ?? null} />
              <LinhaComparativa rotulo="Saldo Credor Anterior" sped={spedTotais?.saldoCredorAnterior ?? null} giam={giamTotais?.saldoCredorAnterior ?? null} />
              <LinhaComparativa rotulo="Deduções" sped={spedTotais?.deducoes ?? null} giam={giamTotais?.deducoes ?? null} />
              <LinhaComparativa rotulo="ICMS a Recolher (Normal)" sped={spedTotais?.icmsARecolher ?? null} giam={giamTotais?.icmsARecolher ?? null} destaque />
            </tbody>
          </table>
        </div>

        <p className="mt-3 text-xs text-slate-400">
          <em>ICMS a Recolher</em> na GIAM = apenas o tipo &quot;N&quot; do Segmento E (comparável
          com o E110 do SPED). Difal e ST aparecem na próxima seção.
        </p>
      </section>

      {/* ---- BLOCO 2: DETALHAMENTO POR CFOP — GIAM Domínio (fonte única hoje) ---- */}
      <section className="rounded-xl border border-slate-200 bg-white p-5">
        <h2 className="mb-1 text-sm font-bold uppercase tracking-wide text-slate-500">
          Detalhamento por CFOP — GIAM (arquivo do Domínio)
        </h2>
        <p className="mb-4 text-xs text-slate-400">
          Espelha o Quadro 4 do Espelho da GIAM emitido pela SEFAZ. Colunas idênticas às do
          portal — quando o robô da SEFAZ ficar pronto, a mesma tabela ganha uma segunda linha
          por CFOP mostrando o valor recepcionado, pra comparação direta.
        </p>

        {!giamDominio ? (
          <p className="text-sm text-slate-500">
            Nenhuma GIAM importada para esta competência.
          </p>
        ) : (
          <>
            <BlocoCFOP titulo="Entradas / Aquisições" linhas={entradas} colunaImposto="Crédito do Imposto" />
            <div className="mt-6">
              <BlocoCFOP titulo="Saídas / Prestações" linhas={saidas} colunaImposto="Débito do Imposto" />
            </div>
          </>
        )}
      </section>

      {/* ---- BLOCO 3: PLACEHOLDER GIAM SEFAZ ---- */}
      <section className="rounded-xl border border-dashed border-amber-300 bg-amber-50 p-5">
        <h2 className="mb-1 text-sm font-bold uppercase tracking-wide text-amber-900">
          GIAM SEFAZ — Etapa 2 (a construir)
        </h2>
        <p className="text-sm leading-relaxed text-amber-800">
          Aqui virá o confronto com o Espelho da GIAM lido diretamente do portal{" "}
          <span className="font-mono text-xs">giam.sefaz.to.gov.br</span> — cliente por cliente,
          competência por competência. Sem esta etapa, tudo acima é o Domínio conferindo o
          Domínio. Robô mapeado, implementação pendente (ver memória{" "}
          <code className="font-mono text-xs">projeto-robo-giam-sefaz</code>).
        </p>
      </section>

      {/* ---- BLOCO 4: ICMS a Recolher por tipo (informativo) ---- */}
      {giamDominio && giamDominio.icmsARecolher.length > 0 && (
        <section className="rounded-xl border border-slate-200 bg-white p-5">
          <h2 className="mb-1 text-sm font-bold uppercase tracking-wide text-slate-500">
            GIAM (arquivo do Domínio) — ICMS a Recolher por tipo (Segmento E)
          </h2>
          <p className="mb-4 text-xs text-slate-400">
            Difal, ST e outros tipos NÃO têm equivalente no E110 do SPED e por isso não entram na
            comparação principal — mas ficam registrados aqui como informação da declaração.
          </p>
          <table className="w-full text-sm">
            <thead className="border-b border-slate-200 text-left text-xs uppercase text-slate-500">
              <tr>
                <th className="pb-2 pr-3">Tipo</th>
                <th className="pb-2 pr-3">Vencimento</th>
                <th className="pb-2 pr-3 text-right">Valor</th>
              </tr>
            </thead>
            <tbody>
              {giamDominio.icmsARecolher.map((l) => (
                <tr key={l.id} className="border-b border-slate-100">
                  <td className="py-2 pr-3">{legendaTipoIcms(l.tipo)}</td>
                  <td className="py-2 pr-3 text-slate-500">
                    {l.dataVencimento
                      ? l.dataVencimento.toLocaleDateString("pt-BR", { timeZone: "UTC" })
                      : "—"}
                  </td>
                  <td className="py-2 pr-3 text-right font-medium text-slate-700">
                    {fmtBrl.format(Number(l.valor))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </div>
  );
}

function LinhaComparativa({
  rotulo,
  sped,
  giam,
  destaque = false,
}: {
  rotulo: string;
  sped: number | null;
  giam: number | null;
  destaque?: boolean;
}) {
  const diferenca = sped !== null && giam !== null ? sped - giam : null;
  const divergente = diferenca !== null && Math.abs(diferenca) > TOLERANCIA;
  const linhaCls = destaque ? "font-semibold text-slate-800" : "text-slate-700";
  return (
    <tr className="border-b border-slate-100">
      <td className={`py-2 pr-3 ${linhaCls}`}>{rotulo}</td>
      <td className={`py-2 pr-3 text-right tabular-nums ${linhaCls}`}>
        {sped === null ? "—" : fmtBrl.format(sped)}
      </td>
      <td className={`py-2 pr-3 text-right tabular-nums ${linhaCls}`}>
        {giam === null ? "—" : fmtBrl.format(giam)}
      </td>
      <td className="py-2 pr-3 text-right text-slate-300">—</td>
      <td
        className={
          "py-2 pr-3 text-right tabular-nums " +
          (diferenca === null
            ? "text-slate-300"
            : divergente
              ? "font-semibold text-red-600"
              : "text-emerald-600")
        }
      >
        {diferenca === null ? "—" : fmtBrl.format(diferenca)}
      </td>
    </tr>
  );
}

type LinhaB = {
  id: string;
  cfop: string;
  baseCalculo: unknown;
  isentasNaoTributadas: unknown;
  outras: unknown;
  substituicaoTributaria: unknown;
  valorContabil: unknown;
  creditoDebitoImposto: unknown;
};

function BlocoCFOP({
  titulo,
  linhas,
  colunaImposto,
}: {
  titulo: string;
  linhas: LinhaB[];
  colunaImposto: string;
}) {
  if (linhas.length === 0) {
    return (
      <div>
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
          {titulo}
        </h3>
        <p className="text-sm text-slate-400">Sem lançamentos.</p>
      </div>
    );
  }

  const totais = linhas.reduce(
    (acc, l) => ({
      valorContabil: acc.valorContabil + Number(l.valorContabil),
      baseCalculo: acc.baseCalculo + Number(l.baseCalculo),
      creditoDebitoImposto: acc.creditoDebitoImposto + Number(l.creditoDebitoImposto),
      isentasNaoTributadas: acc.isentasNaoTributadas + Number(l.isentasNaoTributadas),
      outras: acc.outras + Number(l.outras),
      substituicaoTributaria: acc.substituicaoTributaria + Number(l.substituicaoTributaria),
    }),
    { valorContabil: 0, baseCalculo: 0, creditoDebitoImposto: 0, isentasNaoTributadas: 0, outras: 0, substituicaoTributaria: 0 },
  );

  return (
    <div>
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
        {titulo}
      </h3>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="border-b border-slate-200 text-left text-xs uppercase text-slate-500">
            <tr>
              <th className="pb-2 pr-3">CFOP</th>
              <th className="pb-2 pr-3 text-right">Valor Contábil</th>
              <th className="pb-2 pr-3 text-right">Base de Cálculo</th>
              <th className="pb-2 pr-3 text-right">{colunaImposto}</th>
              <th className="pb-2 pr-3 text-right">Isentas / Não Tributadas</th>
              <th className="pb-2 pr-3 text-right">Outras</th>
              <th className="pb-2 pr-3 text-right">Substituição Tributária</th>
            </tr>
          </thead>
          <tbody>
            {linhas.map((l) => (
              <tr key={l.id} className="border-b border-slate-100">
                <td className="py-1.5 pr-3 font-mono text-xs text-slate-700">{l.cfop}</td>
                <ValRight n={Number(l.valorContabil)} />
                <ValRight n={Number(l.baseCalculo)} />
                <ValRight n={Number(l.creditoDebitoImposto)} />
                <ValRight n={Number(l.isentasNaoTributadas)} />
                <ValRight n={Number(l.outras)} />
                <ValRight n={Number(l.substituicaoTributaria)} />
              </tr>
            ))}
            <tr className="border-t-2 border-slate-300 font-semibold">
              <td className="py-2 pr-3 text-slate-800">TOTAL</td>
              <ValRight n={totais.valorContabil} bold />
              <ValRight n={totais.baseCalculo} bold />
              <ValRight n={totais.creditoDebitoImposto} bold />
              <ValRight n={totais.isentasNaoTributadas} bold />
              <ValRight n={totais.outras} bold />
              <ValRight n={totais.substituicaoTributaria} bold />
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ValRight({ n, bold = false }: { n: number; bold?: boolean }) {
  return (
    <td
      className={
        "py-1.5 pr-3 text-right tabular-nums " +
        (n === 0 ? "text-slate-300" : bold ? "text-slate-800" : "text-slate-700")
      }
    >
      {n === 0 ? "—" : fmtBrl.format(n)}
    </td>
  );
}

function legendaTipoIcms(tipo: string): string {
  switch (tipo) {
    case "N":
      return "N — Normal (apuração)";
    case "D":
      return "D — Diferencial de Alíquota (Entradas)";
    case "S":
      return "S — Substituição Tributária";
    case "C":
      return "C — Complementação de Alíquota";
    case "F":
      return "F — Diferencial de Alíquota (Saídas)";
    case "P":
      return "P — Fundo de Combate à Pobreza";
    default:
      return tipo;
  }
}
