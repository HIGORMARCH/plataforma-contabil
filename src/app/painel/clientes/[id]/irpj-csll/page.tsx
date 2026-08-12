import path from "node:path";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePapel, PAPEIS_INTERNOS } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { pastaCliente } from "@/lib/storage/filesystem";
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
    select: { id: true, razaoSocial: true, cnpj: true, regimeTributario: true },
  });
  if (!cliente) notFound();

  // Pasta única padronizada: C:\PlataformaContabil\<CLIENTE>_<CNPJ>\SPED-ECF
  // A varredura é recursiva, então pega todos os anos dentro dessa raiz.
  const pastaEcf = path.join(
    pastaCliente({ razaoSocial: cliente.razaoSocial, cnpj: cliente.cnpj }),
    "SPED-ECF",
  );

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

  // Busca as 4 apurações trimestrais do ECF e as DCTFs do ano
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
    ecfPresente: boolean;
    dctfPresente: boolean; // ao menos 1 dos 3 meses do trim tem DCTF importada
    regime?: string;
    irpjEcf: number;
    irpjDctf: number;
    csllEcf: number;
    csllDctf: number;
  };
  const linhas: Record<1 | 2 | 3 | 4, Linha> = {
    1: { trimestre: 1, ecfPresente: false, dctfPresente: false, irpjEcf: 0, irpjDctf: 0, csllEcf: 0, csllDctf: 0 },
    2: { trimestre: 2, ecfPresente: false, dctfPresente: false, irpjEcf: 0, irpjDctf: 0, csllEcf: 0, csllDctf: 0 },
    3: { trimestre: 3, ecfPresente: false, dctfPresente: false, irpjEcf: 0, irpjDctf: 0, csllEcf: 0, csllDctf: 0 },
    4: { trimestre: 4, ecfPresente: false, dctfPresente: false, irpjEcf: 0, irpjDctf: 0, csllEcf: 0, csllDctf: 0 },
  };

  for (const e of ecfs) {
    const t = e.trimestre as 1 | 2 | 3 | 4;
    linhas[t].ecfPresente = true;
    linhas[t].regime = e.regime;
    linhas[t].irpjEcf += Number(e.irpjApurado.toString());
    linhas[t].csllEcf += Number(e.csllApurada.toString());
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

  const totIrpjEcf = Object.values(linhas).reduce((s, l) => s + l.irpjEcf, 0);
  const totIrpjDctf = Object.values(linhas).reduce((s, l) => s + l.irpjDctf, 0);
  const totCsllEcf = Object.values(linhas).reduce((s, l) => s + l.csllEcf, 0);
  const totCsllDctf = Object.values(linhas).reduce((s, l) => s + l.csllDctf, 0);

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

      {/* Ações */}
      <div className="grid gap-3 md:grid-cols-2">
        <VarrerPastaEcfButton clienteId={id} pastaSugerida={pastaEcf} />
        <UploadEcfForm clienteId={id} />
      </div>

      {/* Tabela de confronto trimestral */}
      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-slate-50">
            <tr>
              <th className="px-3 py-2 text-left font-semibold text-slate-600">Trimestre</th>
              <th className="px-3 py-2 text-right font-semibold text-blue-700">IRPJ ECF</th>
              <th className="px-3 py-2 text-right font-semibold text-blue-700">IRPJ DCTF/DCTFWeb</th>
              <th className="px-3 py-2 text-center font-semibold text-slate-600">Divergência IRPJ</th>
              <th className="px-3 py-2 text-right font-semibold text-purple-700">CSLL ECF</th>
              <th className="px-3 py-2 text-right font-semibold text-purple-700">CSLL DCTF/DCTFWeb</th>
              <th className="px-3 py-2 text-center font-semibold text-slate-600">Divergência CSLL</th>
            </tr>
          </thead>
          <tbody>
            {Object.values(linhas).map((l) => {
              const divIrpj = calcularDivergencia(l.irpjEcf, l.irpjDctf, l.ecfPresente, l.dctfPresente);
              const divCsll = calcularDivergencia(l.csllEcf, l.csllDctf, l.ecfPresente, l.dctfPresente);
              const nada = !l.ecfPresente && !l.dctfPresente;
              return (
                <tr key={l.trimestre} className={`border-t border-slate-100 ${nada ? "text-slate-400" : ""}`}>
                  <td className="px-3 py-2 font-medium">
                    T0{l.trimestre}/{String(ano).slice(2)}
                    {l.regime && (
                      <span className="ml-1 text-[10px] uppercase tracking-wide text-slate-400">
                        {l.regime === "PRESUMIDO" ? "Pres." : l.regime === "REAL_TRIMESTRAL" ? "Real T" : "Real A"}
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right font-mono">
                    {l.ecfPresente ? brl(l.irpjEcf) : AUSENTE}
                  </td>
                  <td className="px-3 py-2 text-right font-mono">
                    {l.dctfPresente ? brl(l.irpjDctf) : AUSENTE}
                  </td>
                  <td className={`px-3 py-2 text-center text-xs ${divIrpj.classe}`}>{divIrpj.rotulo}</td>
                  <td className="px-3 py-2 text-right font-mono">
                    {l.ecfPresente ? brl(l.csllEcf) : AUSENTE}
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
              <td className="px-3 py-2 text-right font-mono">{brl(totIrpjEcf)}</td>
              <td className="px-3 py-2 text-right font-mono">{brl(totIrpjDctf)}</td>
              <td className={`px-3 py-2 text-center text-xs ${calcularDivergencia(totIrpjEcf, totIrpjDctf, true, true).classe}`}>
                {calcularDivergencia(totIrpjEcf, totIrpjDctf, true, true).rotulo}
              </td>
              <td className="px-3 py-2 text-right font-mono">{brl(totCsllEcf)}</td>
              <td className="px-3 py-2 text-right font-mono">{brl(totCsllDctf)}</td>
              <td className={`px-3 py-2 text-center text-xs ${calcularDivergencia(totCsllEcf, totCsllDctf, true, true).classe}`}>
                {calcularDivergencia(totCsllEcf, totCsllDctf, true, true).rotulo}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      {ecfs.length === 0 && dctfs.length === 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <b>Nenhum dado ainda pra {ano}.</b> Varra a pasta ECF pra importar a apuração anual do
          IRPJ/CSLL, ou envie o arquivo .txt manualmente. Os débitos da DCTF/DCTFWeb são
          reaproveitados do módulo PIS/COFINS (mesmo arquivo).
        </div>
      )}
    </div>
  );
}
