import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePapel, PAPEIS_INTERNOS } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { VarrerPastaEcfButton } from "./_components/VarrerPastaEcfButton";
import { UploadEcfForm } from "./_components/UploadEcfForm";

// Códigos de receita da DCTF/DCTFWeb correspondentes a IRPJ/CSLL.
// Presumido: 2089 (IRPJ) / 2372 (CSLL).
// Real trimestral: 2362 (IRPJ) / 2484 (CSLL).
// Real anual - estimativa mensal: 2456 (IRPJ) / 2469 (CSLL).
// Real anual - ajuste: 6106 (IRPJ) / 6773 (CSLL).
const CODIGOS_IRPJ = new Set(["2089", "2362", "2456", "6106"]);
const CODIGOS_CSLL = new Set(["2372", "2484", "2469", "6773"]);

function brl(v: number): string {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 2 });
}

function trimestreDoMes(m: number): 1 | 2 | 3 | 4 {
  return (Math.floor(m / 3) + 1) as 1 | 2 | 3 | 4;
}

// Mesma semântica da tela PIS/COFINS: presença de registro é diferente de valor 0.
function calcularDivergencia(
  ecf: number,
  dctf: number,
  ecfPresente: boolean,
  dctfPresente: boolean,
): { classe: string; rotulo: string } {
  if (!ecfPresente && !dctfPresente) return { classe: "text-slate-400", rotulo: "—" };
  if (!ecfPresente && dctfPresente) {
    return dctf > 0
      ? { classe: "text-red-600 font-semibold", rotulo: "⚠ Falta ECF" }
      : { classe: "text-amber-600", rotulo: "Falta ECF (DCTF 0)" };
  }
  if (ecfPresente && !dctfPresente) {
    return ecf > 0
      ? { classe: "text-red-600 font-semibold", rotulo: "⚠ Falta DCTF" }
      : { classe: "text-amber-600", rotulo: "Falta DCTF (ECF 0)" };
  }
  if (ecf === 0 && dctf === 0) return { classe: "text-green-700", rotulo: "OK (0)" };
  const valor = ecf - dctf;
  const pct = ecf > 0 ? (valor / ecf) * 100 : dctf > 0 ? -100 : 0;
  const abs = Math.abs(pct);
  if (abs < 0.5) return { classe: "text-green-700", rotulo: "OK" };
  if (abs < 5) return { classe: "text-amber-600", rotulo: `± ${pct.toFixed(1)}%` };
  return {
    classe: "text-red-600 font-semibold",
    rotulo: pct > 0 ? `↑ ${pct.toFixed(1)}% (ECF > DCTF)` : `↓ ${pct.toFixed(1)}% (DCTF > ECF)`,
  };
}

const AUSENTE = (
  <span className="text-slate-300" title="Não entregue / não importado">—</span>
);

/** Valor da ECF do Domínio: vermelho quando difere da transmitida. */
function CelulaDominio({ valor, presente, sped, spedPresente }: { valor: number; presente: boolean; sped: number; spedPresente: boolean }) {
  if (!presente) return AUSENTE;
  const difere = spedPresente && Math.abs(valor - sped) > 0.01;
  return (
    <span
      className={difere ? "font-semibold text-red-600" : undefined}
      title={difere ? `Diferente da ECF transmitida (${brl(sped)})` : undefined}
    >
      {brl(valor)}
    </span>
  );
}

export default async function IrpjCsllPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ ano?: string }>;
}) {
  const sessao = await requirePapel(PAPEIS_INTERNOS);
  const { id } = await params;
  const { ano: anoStr } = await searchParams;
  const anoAtual = new Date().getFullYear();
  const ano = anoStr ? Number(anoStr) : anoAtual;

  const cliente = await prisma.cliente.findFirst({
    where: { id, escritorioId: sessao.escritorioId },
    select: {
      id: true,
      razaoSocial: true,
      cnpj: true,
      regimeTributario: true,
      pastaFiscal: true,
      pastaSpedEcf: true,
      pastaDominioEcf: true,
    },
  });
  if (!cliente) notFound();

  // As pastas vêm do cadastro (Pastas do cliente → Fiscal) — a mesma regra que a
  // ação de varredura usa: transmitida = ECF do SPED (ou a pasta dos SPED
  // transmitidos); Domínio = ECF do Domínio.
  const pastaEcfSped = cliente.pastaSpedEcf || cliente.pastaFiscal || null;
  const pastaEcfDominio = cliente.pastaDominioEcf || null;

  // Anos com dados (ECF ou DCTF) — não mostra ano vazio no seletor
  const [ecfAnos, dctfPeriodos] = await Promise.all([
    prisma.ecfApuracao.findMany({
      where: { clienteId: id },
      select: { ano: true },
      distinct: ["ano"],
    }),
    prisma.dctfWebDeclaracao.findMany({
      where: { clienteId: id },
      select: { periodoApuracao: true },
      distinct: ["periodoApuracao"],
    }),
  ]);
  const anosComDados = new Set<number>([anoAtual]);
  for (const e of ecfAnos) anosComDados.add(e.ano);
  for (const d of dctfPeriodos) anosComDados.add(d.periodoApuracao.getFullYear());
  if (!anosComDados.has(ano)) anosComDados.add(ano);
  const anosDisponiveis = [...anosComDados].sort((a, b) => b - a);

  // Busca as apurações trimestrais do ECF (as duas fontes) e as DCTFs do ano
  const inicio = new Date(ano, 0, 1);
  const fim = new Date(ano, 11, 31);
  const [ecfs, dctfs] = await Promise.all([
    prisma.ecfApuracao.findMany({
      where: { clienteId: id, ano },
      orderBy: { trimestre: "asc" },
    }),
    prisma.dctfWebDeclaracao.findMany({
      where: { clienteId: id, periodoApuracao: { gte: inicio, lte: fim } },
      orderBy: { periodoApuracao: "asc" },
    }),
  ]);

  // Consolida por trimestre
  type Linha = {
    trimestre: 1 | 2 | 3 | 4;
    spedPresente: boolean;
    dominioPresente: boolean;
    dctfPresente: boolean; // ao menos 1 dos 3 meses do trim tem DCTF importada
    regime?: string;
    irpjSped: number;
    irpjDominio: number;
    irpjDctf: number;
    csllSped: number;
    csllDominio: number;
    csllDctf: number;
  };
  const vazia = (t: 1 | 2 | 3 | 4): Linha => ({
    trimestre: t,
    spedPresente: false,
    dominioPresente: false,
    dctfPresente: false,
    irpjSped: 0,
    irpjDominio: 0,
    irpjDctf: 0,
    csllSped: 0,
    csllDominio: 0,
    csllDctf: 0,
  });
  const linhas: Record<1 | 2 | 3 | 4, Linha> = { 1: vazia(1), 2: vazia(2), 3: vazia(3), 4: vazia(4) };

  // Lucro Real anual (A00 + estimativas A01..A12) vai para a tabela mensal abaixo.
  const ecfsAnuais = ecfs.filter((e) => e.trimestre === 0);
  // Ano só com Real anual: a tabela trimestral ficaria vazia com "Total OK (0)".
  const soAnual = ecfsAnuais.length > 0 && ecfs.every((e) => e.trimestre === 0);
  for (const e of ecfs) {
    if (e.trimestre === 0) continue;
    const l = linhas[e.trimestre as 1 | 2 | 3 | 4];
    l.regime ??= e.regime;
    const irpj = Number(e.irpjApurado.toString());
    const csll = Number(e.csllApurada.toString());
    if (e.fonte === "DOMINIO") {
      l.dominioPresente = true;
      l.irpjDominio += irpj;
      l.csllDominio += csll;
    } else {
      l.spedPresente = true;
      l.irpjSped += irpj;
      l.csllSped += csll;
    }
  }

  for (const d of dctfs) {
    const t = trimestreDoMes(d.periodoApuracao.getMonth());
    linhas[t].dctfPresente = true;
    if (d.payloadBruto && typeof d.payloadBruto === "object") {
      const pb = d.payloadBruto as { debitos?: Array<{ codigo: string; valor: number }> };
      for (const deb of pb.debitos ?? []) {
        if (CODIGOS_IRPJ.has(deb.codigo)) linhas[t].irpjDctf += Number(deb.valor);
        if (CODIGOS_CSLL.has(deb.codigo)) linhas[t].csllDctf += Number(deb.valor);
      }
    }
  }

  const soma = (k: keyof Pick<Linha, "irpjSped" | "irpjDominio" | "irpjDctf" | "csllSped" | "csllDominio" | "csllDctf">) =>
    Object.values(linhas).reduce((s, l) => s + l[k], 0);
  const algumDominio = Object.values(linhas).some((l) => l.dominioPresente);
  const algumSped = Object.values(linhas).some((l) => l.spedPresente);

  return (
    <div className="space-y-6">
      <div>
        <Link href={`/painel/clientes/${id}`} className="text-sm text-slate-500 hover:underline">
          ← Voltar para {cliente.razaoSocial}
        </Link>
        <h1 className="mt-1 text-2xl font-bold text-slate-800">
          Auditoria IRPJ/CSLL — {cliente.razaoSocial}
        </h1>
        <p className="text-sm text-slate-500">
          CNPJ {cliente.cnpj} · Regime: <b>{cliente.regimeTributario ?? "não definido"}</b>
        </p>
      </div>

      {/* Seletor de ano */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm text-slate-600">Ano:</span>
        {anosDisponiveis.map((a) => (
          <Link
            key={a}
            href={`/painel/clientes/${id}/irpj-csll?ano=${a}`}
            className={`btn text-sm ${a === ano ? "btn-primary" : "btn-ghost"}`}
          >
            {a}
          </Link>
        ))}
      </div>

      {/* Ações: uma varredura por fonte */}
      <div className="grid gap-3 md:grid-cols-3">
        <VarrerPastaEcfButton clienteId={id} fonte="TRANSMITIDO" titulo="ECF transmitida (SPED)" pasta={pastaEcfSped} ano={ano} />
        <VarrerPastaEcfButton clienteId={id} fonte="DOMINIO" titulo="ECF do Domínio" pasta={pastaEcfDominio} ano={ano} />
        <UploadEcfForm clienteId={id} />
      </div>

      {/* Tabela de confronto trimestral */}
      {/* key={ano}: troca de ano recria a tabela inteira — nenhum texto do ano
          anterior sobrevive (nem a cópia que o tradutor do Chrome congela). */}
      {!soAnual && (
      <div key={ano} className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-slate-50">
            <tr>
              <th className="px-3 py-2 text-left font-semibold text-slate-600" rowSpan={2}>Trimestre</th>
              <th className="border-l border-slate-200 px-3 py-1 text-center font-semibold text-blue-700" colSpan={4}>IRPJ</th>
              <th className="border-l border-slate-200 px-3 py-1 text-center font-semibold text-purple-700" colSpan={4}>CSLL</th>
            </tr>
            <tr className="text-xs">
              <th className="border-l border-slate-200 px-3 py-2 text-right font-semibold text-blue-700">ECF SPED</th>
              <th className="px-3 py-2 text-right font-semibold text-blue-700">ECF Domínio</th>
              <th className="px-3 py-2 text-right font-semibold text-blue-700">DCTF/DCTFWeb</th>
              <th className="px-3 py-2 text-center font-semibold text-slate-600">SPED × DCTF</th>
              <th className="border-l border-slate-200 px-3 py-2 text-right font-semibold text-purple-700">ECF SPED</th>
              <th className="px-3 py-2 text-right font-semibold text-purple-700">ECF Domínio</th>
              <th className="px-3 py-2 text-right font-semibold text-purple-700">DCTF/DCTFWeb</th>
              <th className="px-3 py-2 text-center font-semibold text-slate-600">SPED × DCTF</th>
            </tr>
          </thead>
          <tbody>
            {Object.values(linhas).map((l) => {
              const divIrpj = calcularDivergencia(l.irpjSped, l.irpjDctf, l.spedPresente, l.dctfPresente);
              const divCsll = calcularDivergencia(l.csllSped, l.csllDctf, l.spedPresente, l.dctfPresente);
              const nada = !l.spedPresente && !l.dominioPresente && !l.dctfPresente;
              return (
                <tr key={l.trimestre} className={`border-t border-slate-100 ${nada ? "text-slate-400" : ""}`}>
                  <td className="px-3 py-2 font-medium">
                    T0{l.trimestre}/{ano}
                    <span className="ml-1 text-[11px] font-normal text-slate-500">
                      {["jan–mar", "abr–jun", "jul–set", "out–dez"][l.trimestre - 1]}/{ano}
                    </span>
                    {l.regime && (
                      <span className="ml-1 text-[10px] uppercase tracking-wide text-slate-400">
                        {l.regime === "PRESUMIDO" ? "Pres." : l.regime === "REAL_TRIMESTRAL" ? "Real T" : "Real A"}
                      </span>
                    )}
                  </td>
                  <td className="border-l border-slate-100 px-3 py-2 text-right font-mono">
                    {l.spedPresente ? brl(l.irpjSped) : AUSENTE}
                  </td>
                  <td className="px-3 py-2 text-right font-mono">
                    <CelulaDominio valor={l.irpjDominio} presente={l.dominioPresente} sped={l.irpjSped} spedPresente={l.spedPresente} />
                  </td>
                  <td className="px-3 py-2 text-right font-mono">
                    {l.dctfPresente ? brl(l.irpjDctf) : AUSENTE}
                  </td>
                  <td className={`px-3 py-2 text-center text-xs ${divIrpj.classe}`}>{divIrpj.rotulo}</td>
                  <td className="border-l border-slate-100 px-3 py-2 text-right font-mono">
                    {l.spedPresente ? brl(l.csllSped) : AUSENTE}
                  </td>
                  <td className="px-3 py-2 text-right font-mono">
                    <CelulaDominio valor={l.csllDominio} presente={l.dominioPresente} sped={l.csllSped} spedPresente={l.spedPresente} />
                  </td>
                  <td className="px-3 py-2 text-right font-mono">
                    {l.dctfPresente ? brl(l.csllDctf) : AUSENTE}
                  </td>
                  <td className={`px-3 py-2 text-center text-xs ${divCsll.classe}`}>{divCsll.rotulo}</td>
                </tr>
              );
            })}
          </tbody>
          <tfoot className="bg-slate-50 font-semibold">
            <tr className="border-t-2 border-slate-300">
              <td className="px-3 py-2">Total {ano}</td>
              <td className="border-l border-slate-200 px-3 py-2 text-right font-mono">{brl(soma("irpjSped"))}</td>
              <td className="px-3 py-2 text-right font-mono">
                <CelulaDominio valor={soma("irpjDominio")} presente={algumDominio} sped={soma("irpjSped")} spedPresente={algumSped} />
              </td>
              <td className="px-3 py-2 text-right font-mono">{brl(soma("irpjDctf"))}</td>
              <td className={`px-3 py-2 text-center text-xs ${calcularDivergencia(soma("irpjSped"), soma("irpjDctf"), true, true).classe}`}>
                {calcularDivergencia(soma("irpjSped"), soma("irpjDctf"), true, true).rotulo}
              </td>
              <td className="border-l border-slate-200 px-3 py-2 text-right font-mono">{brl(soma("csllSped"))}</td>
              <td className="px-3 py-2 text-right font-mono">
                <CelulaDominio valor={soma("csllDominio")} presente={algumDominio} sped={soma("csllSped")} spedPresente={algumSped} />
              </td>
              <td className="px-3 py-2 text-right font-mono">{brl(soma("csllDctf"))}</td>
              <td className={`px-3 py-2 text-center text-xs ${calcularDivergencia(soma("csllSped"), soma("csllDctf"), true, true).classe}`}>
                {calcularDivergencia(soma("csllSped"), soma("csllDctf"), true, true).rotulo}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
      )}

      {ecfsAnuais.length > 0 && (
        <TabelaRealAnual ano={ano} ecfs={ecfsAnuais} dctfs={dctfs} />
      )}

      {ecfs.length === 0 && dctfs.length === 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <b>Nenhum dado ainda pra {ano}.</b> Varra a pasta da ECF transmitida e a do Domínio, ou envie o
          arquivo .txt manualmente. Os débitos da DCTF/DCTFWeb são reaproveitados do módulo PIS/COFINS
          (mesmo arquivo).
        </div>
      )}
    </div>
  );
}

const MESES = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

/**
 * Lucro Real ANUAL: a ECF traz a estimativa de cada mês (A01..A12 — N620 26 /
 * N660 18) e o ajuste do ano (A00 — N630 26 / N670 21). A estimativa é
 * confessada na DCTF/DCTFWeb do próprio mês, então o confronto é mês a mês.
 * O ajuste anual vence no ano seguinte — fica só com o valor da ECF.
 */
function TabelaRealAnual({
  ano,
  ecfs,
  dctfs,
}: {
  ano: number;
  ecfs: Array<{ periodo: string; fonte: string; irpjApurado: { toString(): string }; csllApurada: { toString(): string } }>;
  dctfs: Array<{ periodoApuracao: Date; payloadBruto: unknown }>;
}) {
  type Mes = { ecf?: { irpj: number; csll: number }; dom?: { irpj: number; csll: number }; dctf?: { irpj: number; csll: number } };
  const meses: Mes[] = Array.from({ length: 12 }, () => ({}));
  let ajuste: { irpj: number; csll: number } | undefined;
  let ajusteDom: { irpj: number; csll: number } | undefined;

  for (const e of ecfs) {
    const v = { irpj: Number(e.irpjApurado.toString()), csll: Number(e.csllApurada.toString()) };
    const dominio = e.fonte === "DOMINIO";
    if (e.periodo === "A00") {
      if (dominio) ajusteDom = v;
      else ajuste = v;
      continue;
    }
    const m = Number(e.periodo.slice(1)) - 1;
    if (m < 0 || m > 11) continue;
    if (dominio) meses[m].dom = v;
    else meses[m].ecf = v;
  }
  for (const d of dctfs) {
    const m = d.periodoApuracao.getMonth();
    const acc = (meses[m].dctf ??= { irpj: 0, csll: 0 });
    const pb = d.payloadBruto as { debitos?: Array<{ codigo: string; valor: number }> } | null;
    for (const deb of pb?.debitos ?? []) {
      if (CODIGOS_IRPJ.has(deb.codigo)) acc.irpj += Number(deb.valor);
      if (CODIGOS_CSLL.has(deb.codigo)) acc.csll += Number(deb.valor);
    }
  }

  const temDominio = meses.some((m) => m.dom) || Boolean(ajusteDom);
  const celula = (v: number | undefined) => (v === undefined ? AUSENTE : brl(v));

  return (
    <div key={`anual-${ano}`} className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
      <p className="border-b border-slate-100 px-3 py-2 text-sm font-semibold text-slate-700">
        Lucro Real anual — estimativas mensais e ajuste de {ano}
        <span className="ml-2 text-xs font-normal text-slate-500">
          ECF: estimativa = N620 item 26 / N660 item 18; ajuste = N630 item 26 / N670 item 21
        </span>
      </p>
      <table className="w-full text-sm">
        <thead className="bg-slate-50 text-xs">
          <tr>
            <th className="px-3 py-2 text-left font-semibold text-slate-600">Período</th>
            <th className="border-l border-slate-200 px-3 py-2 text-right font-semibold text-blue-700">IRPJ · ECF</th>
            {temDominio && <th className="px-3 py-2 text-right font-semibold text-blue-700">IRPJ · Domínio</th>}
            <th className="px-3 py-2 text-right font-semibold text-blue-700">IRPJ · DCTF</th>
            <th className="px-3 py-2 text-center font-semibold text-slate-600">ECF × DCTF</th>
            <th className="border-l border-slate-200 px-3 py-2 text-right font-semibold text-purple-700">CSLL · ECF</th>
            {temDominio && <th className="px-3 py-2 text-right font-semibold text-purple-700">CSLL · Domínio</th>}
            <th className="px-3 py-2 text-right font-semibold text-purple-700">CSLL · DCTF</th>
            <th className="px-3 py-2 text-center font-semibold text-slate-600">ECF × DCTF</th>
          </tr>
        </thead>
        <tbody>
          {meses.map((m, i) => {
            const dI = calcularDivergencia(m.ecf?.irpj ?? 0, m.dctf?.irpj ?? 0, Boolean(m.ecf), Boolean(m.dctf));
            const dC = calcularDivergencia(m.ecf?.csll ?? 0, m.dctf?.csll ?? 0, Boolean(m.ecf), Boolean(m.dctf));
            return (
              <tr key={i} className="border-t border-slate-100">
                <td className="px-3 py-2 font-medium">
                  A{String(i + 1).padStart(2, "0")} <span className="text-[11px] font-normal text-slate-500">{MESES[i]}/{ano} · estimativa</span>
                </td>
                <td className="border-l border-slate-100 px-3 py-2 text-right font-mono">{celula(m.ecf?.irpj)}</td>
                {temDominio && <td className="px-3 py-2 text-right font-mono">{celula(m.dom?.irpj)}</td>}
                <td className="px-3 py-2 text-right font-mono">{celula(m.dctf?.irpj)}</td>
                <td className={`px-3 py-2 text-center text-xs ${dI.classe}`}>{dI.rotulo}</td>
                <td className="border-l border-slate-100 px-3 py-2 text-right font-mono">{celula(m.ecf?.csll)}</td>
                {temDominio && <td className="px-3 py-2 text-right font-mono">{celula(m.dom?.csll)}</td>}
                <td className="px-3 py-2 text-right font-mono">{celula(m.dctf?.csll)}</td>
                <td className={`px-3 py-2 text-center text-xs ${dC.classe}`}>{dC.rotulo}</td>
              </tr>
            );
          })}
        </tbody>
        <tfoot className="bg-slate-50 font-semibold">
          <tr className="border-t-2 border-slate-300">
            <td className="px-3 py-2">
              A00 <span className="text-[11px] font-normal text-slate-500">ajuste anual {ano}</span>
            </td>
            <td className="border-l border-slate-200 px-3 py-2 text-right font-mono">{celula(ajuste?.irpj)}</td>
            {temDominio && <td className="px-3 py-2 text-right font-mono">{celula(ajusteDom?.irpj)}</td>}
            <td className="px-3 py-2 text-right text-xs font-normal text-slate-400">vence em {ano + 1}</td>
            <td />
            <td className="border-l border-slate-200 px-3 py-2 text-right font-mono">{celula(ajuste?.csll)}</td>
            {temDominio && <td className="px-3 py-2 text-right font-mono">{celula(ajusteDom?.csll)}</td>}
            <td className="px-3 py-2 text-right text-xs font-normal text-slate-400">vence em {ano + 1}</td>
            <td />
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
