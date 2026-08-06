import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePapel, PAPEIS_INTERNOS } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { UploadSpedContrib } from "./_components/UploadSpedContrib";
import { VarrerPastaButton } from "./_components/VarrerPastaButton";
import { VarrerPastaDctfAntigaButton } from "./_components/VarrerPastaDctfAntigaButton";
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

// Uma célula de divergência considera 4 estados: SPED e DCTF podem estar presentes
// (registro no banco) ou ausentes (não entregue / não importado). "0,00 entregue"
// e "não entregue" são semanticamente opostos pra auditoria — o rótulo tem que
// refletir isso.
function calcularDivergencia(
  sped: number,
  dctf: number,
  spedPresente: boolean,
  dctfPresente: boolean,
): { classe: string; rotulo: string } {
  if (!spedPresente && !dctfPresente) {
    return { classe: "text-slate-400", rotulo: "—" };
  }
  if (!spedPresente && dctfPresente) {
    // Confessou sem apurar (ou SPED faltando na pasta).
    return dctf > 0
      ? { classe: "text-red-600 font-semibold", rotulo: "⚠ Falta SPED" }
      : { classe: "text-amber-600", rotulo: "Falta SPED (DCTF 0)" };
  }
  if (spedPresente && !dctfPresente) {
    return sped > 0
      ? { classe: "text-red-600 font-semibold", rotulo: "⚠ Falta DCTF" }
      : { classe: "text-amber-600", rotulo: "Falta DCTF (SPED 0)" };
  }
  // Ambos presentes.
  const valor = sped - dctf;
  const pct = sped > 0 ? (valor / sped) * 100 : dctf > 0 ? -100 : 0;
  const abs = Math.abs(pct);
  if (sped === 0 && dctf === 0) return { classe: "text-green-700", rotulo: "OK (0)" };
  if (abs < 0.5) return { classe: "text-green-700", rotulo: "OK" };
  if (abs < 5)
    return { classe: "text-amber-600", rotulo: `± ${pct.toFixed(1)}%` };
  return {
    classe: "text-red-600 font-semibold",
    rotulo: pct > 0 ? `↑ ${pct.toFixed(1)}% (SPED > DCTF)` : `↓ ${pct.toFixed(1)}% (DCTF > SPED)`,
  };
}

const AUSENTE = (
  <span className="text-slate-300" title="Não entregue / não importado">
    —
  </span>
);

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

  // Anos que TÊM dados (SPED ou DCTFWeb) — pra não mostrar botão de ano vazio
  const [spedPeriodos, dctfPeriodos] = await Promise.all([
    prisma.spedContribApuracao.findMany({
      where: { clienteId: id },
      select: { periodoApuracao: true },
      distinct: ["periodoApuracao"],
    }),
    prisma.dctfWebDeclaracao.findMany({
      where: { clienteId: id },
      select: { periodoApuracao: true },
      distinct: ["periodoApuracao"],
    }),
  ]);
  const anosComDados = new Set<number>([anoAtual]); // atual sempre aparece
  for (const s of spedPeriodos) anosComDados.add(s.periodoApuracao.getFullYear());
  for (const d of dctfPeriodos) anosComDados.add(d.periodoApuracao.getFullYear());
  if (!anosComDados.has(ano)) anosComDados.add(ano); // o ano selecionado tambem
  const anosDisponiveis = [...anosComDados].sort((a, b) => b - a);

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

  // Consolida por mês. Trackear presença (registro existe) separado do valor —
  // "SPED entregue zerado" e "SPED não entregue" são casos opostos pra auditoria.
  type Linha = {
    mes: number;
    spedPresente: boolean;
    dctfPresente: boolean;
    pisSped: number;
    pisDctf: number;
    cofinsSped: number;
    cofinsDctf: number;
  };
  const linhasPorMes: Record<number, Linha> = {};
  for (let m = 0; m < 12; m++) {
    linhasPorMes[m] = {
      mes: m,
      spedPresente: false,
      dctfPresente: false,
      pisSped: 0,
      pisDctf: 0,
      cofinsSped: 0,
      cofinsDctf: 0,
    };
  }
  for (const s of sped) {
    const m = s.periodoApuracao.getMonth();
    linhasPorMes[m].spedPresente = true;
    linhasPorMes[m].pisSped += Number(s.pisContribuicaoDevida);
    linhasPorMes[m].cofinsSped += Number(s.cofinsContribuicaoDevida);
  }
  for (const d of dctf) {
    const m = d.periodoApuracao.getMonth();
    linhasPorMes[m].dctfPresente = true;
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
        {anosDisponiveis.map((a) => (
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
      <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
        <VarrerPastaButton clienteId={id} pastaSugerida={cliente.pastaFiscal} />
        <VarrerPastaDctfAntigaButton clienteId={id} />
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
              <th className="px-3 py-2 text-right font-semibold text-blue-700">PIS DCTFWeb/DCTF</th>
              <th className="px-3 py-2 text-center font-semibold text-slate-600">Divergência PIS</th>
              <th className="px-3 py-2 text-right font-semibold text-purple-700">COFINS SPED</th>
              <th className="px-3 py-2 text-right font-semibold text-purple-700">COFINS DCTFWeb/DCTF</th>
              <th className="px-3 py-2 text-center font-semibold text-slate-600">Divergência COFINS</th>
            </tr>
          </thead>
          <tbody>
            {Object.values(linhasPorMes).map((l) => {
              const divPis = calcularDivergencia(l.pisSped, l.pisDctf, l.spedPresente, l.dctfPresente);
              const divCof = calcularDivergencia(l.cofinsSped, l.cofinsDctf, l.spedPresente, l.dctfPresente);
              const nadaEntregue = !l.spedPresente && !l.dctfPresente;
              return (
                <tr key={l.mes} className={`border-t border-slate-100 ${nadaEntregue ? "text-slate-400" : ""}`}>
                  <td className="px-3 py-2 font-medium">
                    {MESES_PT[l.mes]}/{String(ano).slice(2)}
                  </td>
                  <td className="px-3 py-2 text-right font-mono">
                    {l.spedPresente ? brl(l.pisSped) : AUSENTE}
                  </td>
                  <td className="px-3 py-2 text-right font-mono">
                    {l.dctfPresente ? brl(l.pisDctf) : AUSENTE}
                  </td>
                  <td className={`px-3 py-2 text-center text-xs ${divPis.classe}`}>{divPis.rotulo}</td>
                  <td className="px-3 py-2 text-right font-mono">
                    {l.spedPresente ? brl(l.cofinsSped) : AUSENTE}
                  </td>
                  <td className="px-3 py-2 text-right font-mono">
                    {l.dctfPresente ? brl(l.cofinsDctf) : AUSENTE}
                  </td>
                  <td className={`px-3 py-2 text-center text-xs ${divCof.classe}`}>{divCof.rotulo}</td>
                </tr>
              );
            })}
          </tbody>
          <tfoot className="bg-slate-50 font-semibold">
            <tr className="border-t-2 border-slate-300">
              <td className="px-3 py-2">Total {ano}</td>
              <td className="px-3 py-2 text-right font-mono">{brl(totalPisSped)}</td>
              <td className="px-3 py-2 text-right font-mono">{brl(totalPisDctf)}</td>
              <td className={`px-3 py-2 text-center text-xs ${calcularDivergencia(totalPisSped, totalPisDctf, true, true).classe}`}>
                {calcularDivergencia(totalPisSped, totalPisDctf, true, true).rotulo}
              </td>
              <td className="px-3 py-2 text-right font-mono">{brl(totalCofinsSped)}</td>
              <td className="px-3 py-2 text-right font-mono">{brl(totalCofinsDctf)}</td>
              <td className={`px-3 py-2 text-center text-xs ${calcularDivergencia(totalCofinsSped, totalCofinsDctf, true, true).classe}`}>
                {calcularDivergencia(totalCofinsSped, totalCofinsDctf, true, true).rotulo}
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
