import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireSessao, PAPEIS_INTERNOS } from "@/lib/auth";
import { prisma } from "@/lib/db";

/**
 * Confronto de UMA competência (cliente × ano × mês) entre as 3 fontes:
 *
 *   SPED-Fiscal          — Receita Federal
 *   GIAM (arquivo do Domínio) — o que o Domínio guarda hoje
 *   GIAM SEFAZ           — a que o portal recepcionou (raspada via robô)
 *
 * Regra do rótulo (feedback do Higor): NUNCA escrever só "GIAM" — sempre
 * "GIAM (arquivo do Domínio)" ou "GIAM SEFAZ". Ambiguidade engana o leitor.
 *
 * Regra das colunas (feedback do Higor): as três fontes usam AS MESMAS colunas.
 * Se a fonte não tem o dado (SPED não traz Segmento B por CFOP; SEFAZ ainda não
 * foi raspada), mostra "—" na célula, MAS NÃO REMOVE A COLUNA.
 *
 * REGRA DE INTEGRIDADE (memória projeto-robo-giam-sefaz): a comparação
 * Domínio × SEFAZ linha a linha por CFOP é O QUE revela alteração pós-
 * transmissão — o arquivo local do Domínio foi mexido depois de transmitir?
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

  const [sped, giamDominio, giamSefaz] = await Promise.all([
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
    prisma.giamSefazApuracao.findFirst({
      where: { clienteId, periodoApuracao: competencia, retificacao: "00" },
      include: {
        linhasSegmentoB: { orderBy: [{ natureza: "asc" }, { cfop: "asc" }] },
      },
    }),
  ]);

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

  const sefazTotais = giamSefaz
    ? {
        totalCompras: Number(giamSefaz.totalCompras),
        totalVendas: Number(giamSefaz.totalVendas),
        creditoEntradas: Number(giamSefaz.creditoEntradas),
        debitoSaidas: Number(giamSefaz.debitoSaidas),
        saldoCredorAnterior: Number(giamSefaz.saldoCredorAnterior),
        deducoes: Number(giamSefaz.deducoes),
        icmsARecolher: Number(giamSefaz.icmsARecolherNormal),
      }
    : null;

  const entradasDominio = (giamDominio?.linhasSegmentoB ?? []).filter((l) => l.natureza === "0");
  const saidasDominio = (giamDominio?.linhasSegmentoB ?? []).filter((l) => l.natureza === "1");
  const entradasSefaz = (giamSefaz?.linhasSegmentoB ?? []).filter((l) => l.natureza === "0");
  const saidasSefaz = (giamSefaz?.linhasSegmentoB ?? []).filter((l) => l.natureza === "1");

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
          {cliente.inscricaoEstadual && <> · IE {cliente.inscricaoEstadual}</>} · CNPJ {cliente.cnpj}
        </p>
      </div>

      {/* Cabeçalho SEFAZ — evidência auditável da transmissão */}
      {giamSefaz && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
          <b>SEFAZ recepcionou esta declaração.</b>{" "}
          Nº Controle <span className="font-mono">{giamSefaz.numeroControle}</span>
          {giamSefaz.dataRecepcao && (
            <>
              {" "}· recebida em{" "}
              <span className="font-mono">
                {giamSefaz.dataRecepcao.toLocaleString("pt-BR", { timeZone: "UTC" })}
              </span>
            </>
          )}{" "}
          · consultado em{" "}
          <span className="font-mono">
            {giamSefaz.sincronizadoEm.toLocaleString("pt-BR", { timeZone: "UTC" })}
          </span>
        </div>
      )}

      {/* ---- BLOCO 1: TOTAIS DE APURAÇÃO (as 3 fontes lado a lado) ---- */}
      <section className="rounded-xl border border-slate-200 bg-white p-5">
        <h2 className="mb-1 text-sm font-bold uppercase tracking-wide text-slate-500">
          Totais da apuração — comparativo entre as fontes
        </h2>
        <p className="mb-4 text-xs text-slate-400">
          Mesmas colunas nas três fontes. <b>Δ SEFAZ × Domínio</b> em vermelho = arquivo do Domínio
          foi alterado depois de transmitido à SEFAZ.
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
                <th className="pb-2 pr-3 text-right">Δ SEFAZ × Domínio</th>
              </tr>
            </thead>
            <tbody>
              <LinhaComparativa rotulo="Total Compras" sped={spedTotais?.totalCompras ?? null} giam={giamTotais?.totalCompras ?? null} sefaz={sefazTotais?.totalCompras ?? null} />
              <LinhaComparativa rotulo="Total Vendas" sped={spedTotais?.totalVendas ?? null} giam={giamTotais?.totalVendas ?? null} sefaz={sefazTotais?.totalVendas ?? null} />
              <LinhaComparativa rotulo="Crédito das Entradas (ICMS)" sped={spedTotais?.creditoEntradas ?? null} giam={giamTotais?.creditoEntradas ?? null} sefaz={sefazTotais?.creditoEntradas ?? null} />
              <LinhaComparativa rotulo="Débito das Saídas (ICMS)" sped={spedTotais?.debitoSaidas ?? null} giam={giamTotais?.debitoSaidas ?? null} sefaz={sefazTotais?.debitoSaidas ?? null} />
              <LinhaComparativa rotulo="Saldo Credor Anterior" sped={spedTotais?.saldoCredorAnterior ?? null} giam={giamTotais?.saldoCredorAnterior ?? null} sefaz={sefazTotais?.saldoCredorAnterior ?? null} />
              <LinhaComparativa rotulo="Deduções" sped={spedTotais?.deducoes ?? null} giam={giamTotais?.deducoes ?? null} sefaz={sefazTotais?.deducoes ?? null} />
              <LinhaComparativa rotulo="ICMS a Recolher (Normal)" sped={spedTotais?.icmsARecolher ?? null} giam={giamTotais?.icmsARecolher ?? null} sefaz={sefazTotais?.icmsARecolher ?? null} destaque />
            </tbody>
          </table>
        </div>

        <p className="mt-3 text-xs text-slate-400">
          <em>ICMS a Recolher</em> na GIAM = apenas o tipo &quot;N&quot; do Segmento E (comparável
          com o E110 do SPED). Difal e ST aparecem no bloco informativo abaixo.
        </p>
      </section>

      {/* ---- BLOCO 2: CFOP × CFOP — Domínio vs SEFAZ ---- */}
      <section className="rounded-xl border border-slate-200 bg-white p-5">
        <h2 className="mb-1 text-sm font-bold uppercase tracking-wide text-slate-500">
          Detalhamento por CFOP — GIAM Domínio × GIAM SEFAZ (linha a linha)
        </h2>
        <p className="mb-4 text-xs text-slate-400">
          Quadro 4 do Espelho da GIAM. Duas linhas por CFOP: <b>Domínio</b> (arquivo local) e{" "}
          <b>SEFAZ</b> (o que o portal recepcionou). Diferença entre elas = arquivo foi mexido
          depois de transmitir.
        </p>

        {/* Aviso quando SEFAZ foi sincronizada mas as linhas por CFOP não vieram —
            limitação atual do pdf-parse (memória projeto-robo-giam-sefaz: reativar
            quando migrar pra pdfjs-dist com coordenadas X/Y explícitas). */}
        {giamSefaz && entradasSefaz.length === 0 && saidasSefaz.length === 0 && (
          <div className="mb-4 rounded border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
            <b>Totais SEFAZ confirmados</b> (bloco acima), mas o detalhamento CFOP-a-CFOP do
            Espelho ainda não foi extraído — limitação do parser <code>pdf-parse</code>. As linhas
            abaixo mostram só o lado Domínio.{" "}
            <span className="text-amber-700">
              Próximo passo: migrar pra pdfjs-dist com coordenadas X/Y (memória{" "}
              <code>projeto-robo-giam-sefaz</code>).
            </span>
          </div>
        )}

        {!giamDominio && !giamSefaz ? (
          <p className="text-sm text-slate-500">
            Nenhuma GIAM importada nem sincronizada para esta competência.
          </p>
        ) : (
          <>
            <BlocoCFOPComparativo
              titulo="Entradas / Aquisições"
              colunaImposto="Crédito do Imposto"
              linhasDominio={entradasDominio}
              linhasSefaz={entradasSefaz}
              mostrarSefaz={entradasSefaz.length > 0 || saidasSefaz.length > 0}
            />
            <div className="mt-6">
              <BlocoCFOPComparativo
                titulo="Saídas / Prestações"
                colunaImposto="Débito do Imposto"
                linhasDominio={saidasDominio}
                linhasSefaz={saidasSefaz}
                mostrarSefaz={entradasSefaz.length > 0 || saidasSefaz.length > 0}
              />
            </div>
          </>
        )}
      </section>

      {/* ---- Se SEFAZ ainda não foi sincronizada, chama a ação ---- */}
      {!giamSefaz && (
        <section className="rounded-xl border border-dashed border-amber-300 bg-amber-50 px-5 py-4 text-sm text-amber-900">
          <p>
            <b>GIAM SEFAZ ainda não sincronizada para esta competência.</b> Para preencher a coluna
            e as linhas SEFAZ acima, vá em{" "}
            <Link
              href={`/painel/clientes/${clienteId}/sped`}
              className="font-medium text-amber-800 underline"
            >
              {cliente.nomeFantasia || cliente.razaoSocial} → SPED-Fiscal
            </Link>{" "}
            e clique em <b>Buscar no portal SEFAZ</b> (robô Playwright — cifra a senha SEFAZ do
            cliente e raspa o Espelho da GIAM).
          </p>
        </section>
      )}

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
  sefaz,
  destaque = false,
}: {
  rotulo: string;
  sped: number | null;
  giam: number | null;
  sefaz: number | null;
  destaque?: boolean;
}) {
  const dSpedDom = sped !== null && giam !== null ? sped - giam : null;
  const dSefazDom = sefaz !== null && giam !== null ? sefaz - giam : null;
  const spedDomDivergente = dSpedDom !== null && Math.abs(dSpedDom) > TOLERANCIA;
  const sefazDomDivergente = dSefazDom !== null && Math.abs(dSefazDom) > TOLERANCIA;
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
      <td className={`py-2 pr-3 text-right tabular-nums ${linhaCls}`}>
        {sefaz === null ? "—" : fmtBrl.format(sefaz)}
      </td>
      <td
        className={
          "py-2 pr-3 text-right tabular-nums " +
          (dSpedDom === null
            ? "text-slate-300"
            : spedDomDivergente
              ? "font-semibold text-red-600"
              : "text-emerald-600")
        }
      >
        {dSpedDom === null ? "—" : fmtBrl.format(dSpedDom)}
      </td>
      <td
        className={
          "py-2 pr-3 text-right tabular-nums " +
          (dSefazDom === null
            ? "text-slate-300"
            : sefazDomDivergente
              ? "font-semibold text-red-600"
              : "text-emerald-600")
        }
      >
        {dSefazDom === null ? "—" : fmtBrl.format(dSefazDom)}
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

function BlocoCFOPComparativo({
  titulo,
  colunaImposto,
  linhasDominio,
  linhasSefaz,
  mostrarSefaz,
}: {
  titulo: string;
  colunaImposto: string;
  linhasDominio: LinhaB[];
  linhasSefaz: LinhaB[];
  mostrarSefaz: boolean;
}) {
  // Coleta todos os CFOPs presentes em qualquer das fontes
  const cfops = new Set<string>();
  for (const l of linhasDominio) cfops.add(l.cfop);
  for (const l of linhasSefaz) cfops.add(l.cfop);
  const cfopsSorted = [...cfops].sort();

  if (cfopsSorted.length === 0) {
    return (
      <div>
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
          {titulo}
        </h3>
        <p className="text-sm text-slate-400">Sem lançamentos.</p>
      </div>
    );
  }

  const mapDom = new Map(linhasDominio.map((l) => [l.cfop, l]));
  const mapSef = new Map(linhasSefaz.map((l) => [l.cfop, l]));

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
              {mostrarSefaz && <th className="pb-2 pr-3">Fonte</th>}
              <th className="pb-2 pr-3 text-right">Valor Contábil</th>
              <th className="pb-2 pr-3 text-right">Base de Cálculo</th>
              <th className="pb-2 pr-3 text-right">{colunaImposto}</th>
              <th className="pb-2 pr-3 text-right">Isentas / Não Trib.</th>
              <th className="pb-2 pr-3 text-right">Outras</th>
              <th className="pb-2 pr-3 text-right">Sub. Tributária</th>
            </tr>
          </thead>
          <tbody>
            {cfopsSorted.map((cfop) => {
              const dom = mapDom.get(cfop);
              const sef = mapSef.get(cfop);
              return (
                <LinhaComparativaCFOP
                  key={cfop}
                  cfop={cfop}
                  dominio={dom}
                  sefaz={sef}
                  mostrarSefaz={mostrarSefaz}
                />
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function LinhaComparativaCFOP({
  cfop,
  dominio,
  sefaz,
  mostrarSefaz,
}: {
  cfop: string;
  dominio?: LinhaB;
  sefaz?: LinhaB;
  mostrarSefaz: boolean;
}) {
  // Se não tem lado SEFAZ pra mostrar (parser indisponível), renderiza 1 linha
  // por CFOP só com o Domínio — sem a coluna Fonte, layout mais limpo.
  if (!mostrarSefaz) {
    return (
      <tr className="border-b border-slate-100">
        <td className="py-1.5 pr-3 font-mono text-xs text-slate-700">{cfop}</td>
        <CelValor v={dominio ? Number(dominio.valorContabil) : null} div={false} />
        <CelValor v={dominio ? Number(dominio.baseCalculo) : null} div={false} />
        <CelValor v={dominio ? Number(dominio.creditoDebitoImposto) : null} div={false} />
        <CelValor v={dominio ? Number(dominio.isentasNaoTributadas) : null} div={false} />
        <CelValor v={dominio ? Number(dominio.outras) : null} div={false} />
        <CelValor v={dominio ? Number(dominio.substituicaoTributaria) : null} div={false} />
      </tr>
    );
  }

  // Detecta divergência em qualquer coluna (usada pra colorir)
  const cols: Array<keyof LinhaB> = [
    "valorContabil",
    "baseCalculo",
    "creditoDebitoImposto",
    "isentasNaoTributadas",
    "outras",
    "substituicaoTributaria",
  ];
  const divergencias = new Set<string>();
  if (dominio && sefaz) {
    for (const k of cols) {
      const d = Number(dominio[k]);
      const s = Number(sefaz[k]);
      if (Math.abs(d - s) > TOLERANCIA) divergencias.add(k);
    }
  }
  const soUmLado = !dominio || !sefaz;

  const linhaDom = (
    <tr className="border-b border-slate-50">
      <td rowSpan={2} className="py-1.5 pr-3 font-mono text-xs text-slate-700 align-top">
        {cfop}
      </td>
      <td className="py-1.5 pr-3 text-xs text-slate-500">
        Domínio {!dominio && <span className="text-amber-600">(ausente)</span>}
      </td>
      <CelValor v={dominio ? Number(dominio.valorContabil) : null} div={divergencias.has("valorContabil")} />
      <CelValor v={dominio ? Number(dominio.baseCalculo) : null} div={divergencias.has("baseCalculo")} />
      <CelValor v={dominio ? Number(dominio.creditoDebitoImposto) : null} div={divergencias.has("creditoDebitoImposto")} />
      <CelValor v={dominio ? Number(dominio.isentasNaoTributadas) : null} div={divergencias.has("isentasNaoTributadas")} />
      <CelValor v={dominio ? Number(dominio.outras) : null} div={divergencias.has("outras")} />
      <CelValor v={dominio ? Number(dominio.substituicaoTributaria) : null} div={divergencias.has("substituicaoTributaria")} />
    </tr>
  );
  const linhaSef = (
    <tr className="border-b border-slate-200">
      <td className="py-1.5 pr-3 text-xs text-slate-500">
        SEFAZ {!sefaz && <span className="text-amber-600">(ausente)</span>}
        {soUmLado && sefaz && <span className="ml-1 text-red-600">⚠ falta no Domínio</span>}
        {soUmLado && dominio && <span className="ml-1 text-red-600">⚠ falta na SEFAZ</span>}
      </td>
      <CelValor v={sefaz ? Number(sefaz.valorContabil) : null} div={divergencias.has("valorContabil")} />
      <CelValor v={sefaz ? Number(sefaz.baseCalculo) : null} div={divergencias.has("baseCalculo")} />
      <CelValor v={sefaz ? Number(sefaz.creditoDebitoImposto) : null} div={divergencias.has("creditoDebitoImposto")} />
      <CelValor v={sefaz ? Number(sefaz.isentasNaoTributadas) : null} div={divergencias.has("isentasNaoTributadas")} />
      <CelValor v={sefaz ? Number(sefaz.outras) : null} div={divergencias.has("outras")} />
      <CelValor v={sefaz ? Number(sefaz.substituicaoTributaria) : null} div={divergencias.has("substituicaoTributaria")} />
    </tr>
  );

  return (
    <>
      {linhaDom}
      {linhaSef}
    </>
  );
}

function CelValor({ v, div }: { v: number | null; div: boolean }) {
  const base = "py-1.5 pr-3 text-right tabular-nums ";
  if (v === null) return <td className={base + "text-slate-300"}>—</td>;
  if (v === 0) return <td className={base + "text-slate-300"}>—</td>;
  const cor = div ? "font-semibold text-red-600" : "text-slate-700";
  return <td className={base + cor}>{fmtBrl.format(v)}</td>;
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
