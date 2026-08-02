import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePapel, PAPEIS_INTERNOS } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { UploadSpedContrib } from "./_components/UploadSpedContrib";
import { VarrerPastaButton } from "./_components/VarrerPastaButton";
import { SincronizarDctfWebButton } from "./_components/SincronizarDctfWebButton";

const MESES_PT = [
  "Jan",
  "Fev",
  "Mar",
  "Abr",
  "Mai",
  "Jun",
  "Jul",
  "Ago",
  "Set",
  "Out",
  "Nov",
  "Dez",
];

function brl(v: number): string {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 2 });
}

function calcularDivergencia(sped: number, dctf: number): {
  valor: number;
  pct: number;
  classe: string;
  rotulo: string;
} {
  const valor = sped - dctf;
  const pct = sped > 0 ? (valor / sped) * 100 : dctf > 0 ? -100 : 0;
  const abs = Math.abs(pct);
  let classe = "text-slate-500";
  let rotulo = "OK";
  if (sped === 0 && dctf === 0) {
    rotulo = "—";
  } else if (abs < 0.5) {
    classe = "text-green-700";
    rotulo = "OK";
  } else if (abs < 5) {
    classe = "text-amber-600";
    rotulo = `± ${pct.toFixed(1)}%`;
  } else {
    classe = "text-red-600 font-semibold";
    rotulo = pct > 0 ? `↑ ${pct.toFixed(1)}% (SPED > DCTF)` : `↓ ${pct.toFixed(1)}% (DCTF > SPED)`;
  }
  return { valor, pct, classe, rotulo };
}

export default async function PisCofinsPage({
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
    select: { id: true, razaoSocial: true, cnpj: true, regimeTributario: true, pastaFiscal: true },
  });
  if (!cliente) notFound();

  // Busca apurações do ano
  const inicio = new Date(ano, 0, 1);
  const fim = new Date(ano, 11, 31);

  const [sped, dctf] = await Promise.all([
    prisma.spedContribApuracao.findMany({
      where: { clienteId: id, periodoApuracao: { gte: inicio, lte: fim } },
      orderBy: { periodoApuracao: "asc" },
    }),
    prisma.dctfWebDeclaracao.findMany({
      where: { clienteId: id, periodoApuracao: { gte: inicio, lte: fim } },
      orderBy: { periodoApuracao: "asc" },
    }),
  ]);

  // Consolida por mês
  type Linha = {
    mes: number;
    pisSped: number;
    pisDctf: number;
    cofinsSped: number;
    cofinsDctf: number;
  };
  const linhasPorMes: Record<number, Linha> = {};
  for (let m = 0; m < 12; m++) {
    linhasPorMes[m] = { mes: m, pisSped: 0, pisDctf: 0, cofinsSped: 0, cofinsDctf: 0 };
  }
  for (const s of sped) {
    const m = s.periodoApuracao.getMonth();
    linhasPorMes[m].pisSped += Number(s.pisContribuicaoDevida);
    linhasPorMes[m].cofinsSped += Number(s.cofinsContribuicaoDevida);
  }
  for (const d of dctf) {
    const m = d.periodoApuracao.getMonth();
    linhasPorMes[m].pisDctf += Number(d.pisConfessado);
    linhasPorMes[m].cofinsDctf += Number(d.cofinsConfessado);
  }

  const totalPisSped = sped.reduce((a, s) => a + Number(s.pisContribuicaoDevida), 0);
  const totalPisDctf = dctf.reduce((a, d) => a + Number(d.pisConfessado), 0);
  const totalCofinsSped = sped.reduce((a, s) => a + Number(s.cofinsContribuicaoDevida), 0);
  const totalCofinsDctf = dctf.reduce((a, d) => a + Number(d.cofinsConfessado), 0);

  return (
    <div className="space-y-6">
      <div>
        <Link href={`/painel/clientes/${id}`} className="text-sm text-slate-500 hover:underline">
          ← Voltar para {cliente.razaoSocial}
        </Link>
        <h1 className="mt-1 text-2xl font-bold text-slate-800">
          Auditoria PIS/COFINS — {cliente.razaoSocial}
        </h1>
        <p className="text-sm text-slate-500">
          CNPJ {cliente.cnpj} · Regime: <b>{cliente.regimeTributario ?? "não definido"}</b>
        </p>
      </div>

      {/* Seletor de ano */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm text-slate-600">Ano:</span>
        {[anoAtual, anoAtual - 1, anoAtual - 2, anoAtual - 3].map((a) => (
          <Link
            key={a}
            href={`/painel/clientes/${id}/pis-cofins?ano=${a}`}
            className={`btn text-sm ${a === ano ? "btn-primary" : "btn-ghost"}`}
          >
            {a}
          </Link>
        ))}
      </div>

      {/* Ações */}
      <div className="grid gap-3 md:grid-cols-3">
        <VarrerPastaButton clienteId={id} pastaSugerida={cliente.pastaFiscal} />
        <UploadSpedContrib clienteId={id} />
        <SincronizarDctfWebButton clienteId={id} ano={ano} />
      </div>

      {/* Tabela de confronto */}
      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-slate-50">
            <tr>
              <th className="px-3 py-2 text-left font-semibold text-slate-600">Competência</th>
              <th className="px-3 py-2 text-right font-semibold text-blue-700">PIS SPED</th>
              <th className="px-3 py-2 text-right font-semibold text-blue-700">PIS DCTFWeb</th>
              <th className="px-3 py-2 text-center font-semibold text-slate-600">Divergência PIS</th>
              <th className="px-3 py-2 text-right font-semibold text-purple-700">COFINS SPED</th>
              <th className="px-3 py-2 text-right font-semibold text-purple-700">COFINS DCTFWeb</th>
              <th className="px-3 py-2 text-center font-semibold text-slate-600">Divergência COFINS</th>
            </tr>
          </thead>
          <tbody>
            {Object.values(linhasPorMes).map((l) => {
              const divPis = calcularDivergencia(l.pisSped, l.pisDctf);
              const divCof = calcularDivergencia(l.cofinsSped, l.cofinsDctf);
              const vazio = l.pisSped === 0 && l.pisDctf === 0 && l.cofinsSped === 0 && l.cofinsDctf === 0;
              return (
                <tr key={l.mes} className={`border-t border-slate-100 ${vazio ? "text-slate-400" : ""}`}>
                  <td className="px-3 py-2 font-medium">
                    {MESES_PT[l.mes]}/{String(ano).slice(2)}
                  </td>
                  <td className="px-3 py-2 text-right font-mono">{vazio ? "—" : brl(l.pisSped)}</td>
                  <td className="px-3 py-2 text-right font-mono">{vazio ? "—" : brl(l.pisDctf)}</td>
                  <td className={`px-3 py-2 text-center text-xs ${divPis.classe}`}>{vazio ? "—" : divPis.rotulo}</td>
                  <td className="px-3 py-2 text-right font-mono">{vazio ? "—" : brl(l.cofinsSped)}</td>
                  <td className="px-3 py-2 text-right font-mono">{vazio ? "—" : brl(l.cofinsDctf)}</td>
                  <td className={`px-3 py-2 text-center text-xs ${divCof.classe}`}>{vazio ? "—" : divCof.rotulo}</td>
                </tr>
              );
            })}
          </tbody>
          <tfoot className="bg-slate-50 font-semibold">
            <tr className="border-t-2 border-slate-300">
              <td className="px-3 py-2">Total {ano}</td>
              <td className="px-3 py-2 text-right font-mono">{brl(totalPisSped)}</td>
              <td className="px-3 py-2 text-right font-mono">{brl(totalPisDctf)}</td>
              <td className={`px-3 py-2 text-center text-xs ${calcularDivergencia(totalPisSped, totalPisDctf).classe}`}>
                {calcularDivergencia(totalPisSped, totalPisDctf).rotulo}
              </td>
              <td className="px-3 py-2 text-right font-mono">{brl(totalCofinsSped)}</td>
              <td className="px-3 py-2 text-right font-mono">{brl(totalCofinsDctf)}</td>
              <td className={`px-3 py-2 text-center text-xs ${calcularDivergencia(totalCofinsSped, totalCofinsDctf).classe}`}>
                {calcularDivergencia(totalCofinsSped, totalCofinsDctf).rotulo}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      {sped.length === 0 && dctf.length === 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <b>Nenhum dado ainda pra {ano}.</b> Comece importando um arquivo SPED-Contribuições
          (.txt) pra ver os valores apurados. A sincronização DCTFWeb (via SERPRO) ainda está
          em modo mock — a estrutura está pronta em <code>src/lib/serpro/dctfweb.ts</code>,
          falta plugar a chamada real quando quiser testar em CNPJ ativo.
        </div>
      )}
    </div>
  );
}
