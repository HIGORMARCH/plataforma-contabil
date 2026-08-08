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

const AUSENTE = (
  <span className="text-slate-300" title="Não entregue / não importado">
    —
  </span>
);

// Estruturas usadas pelo componente TabelaTributo. LinhaTribUI espelha o
// tipo Linha do server component. Guarda os dois lados (SPED e DCTF) já
// com Débito e Crédito — pra que o cabeçalho mostre a origem completa
// da apuração (não só o consolidado).
//
// Nota: hoje o schema DctfWebDeclaracao só tem pisConfessado (consolidado).
// Enquanto o parser não separa débitos e créditos declarados, "dctfDebito"
// recebe o confessado e "dctfCredito" fica 0. Trocar quando o parser detalhar.
interface LinhaTribUI {
  spedDebito: number;
  spedCredito: number;
  spedSaldo: number;
  dctfDebito: number;
  dctfCredito: number;
  dctfSaldo: number;
}
interface LinhaMes {
  mes: number;
  spedPresente: boolean;
  spedVazio: boolean;
  dctfPresente: boolean;
  pis: LinhaTribUI;
  cofins: LinhaTribUI;
}

/** Formata saldo como "X,XX D" (devedor / a recolher) ou "X,XX C" (credor /
 *  a compensar), ou "0,00 D/C" quando o saldo é zero (não é devedor nem
 *  credor). Padrão que o contador reconhece do balancete. */
function brlDC(v: number): string {
  const abs = Math.abs(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 2 });
  if (Math.abs(v) < 0.005) return `${abs} D/C`;
  return v > 0 ? `${abs} D` : `${abs} C`;
}

/**
 * Uma tabela de auditoria por tributo (PIS ou COFINS). Cabeçalho em dois
 * níveis: "SPED - X" agrupa Débito+Crédito do SPED, depois "SALDO - X"
 * mostra o saldo com indicador D/C; mesma estrutura pra "DCTFWeb/DCTF - X".
 * Assim o contador vê a estrutura completa e não só o consolidado.
 */
function TabelaTributo({
  titulo,
  corHeader,
  ano,
  linhas,
  selecionar,
  totais,
}: {
  titulo: string; // "PIS" ou "COFINS"
  corHeader: string;
  ano: number;
  linhas: LinhaMes[];
  selecionar: (l: LinhaMes) => LinhaTribUI;
  totais: LinhaTribUI;
}) {
  return (
    <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
      <div className={`border-b border-slate-200 bg-slate-50 px-3 py-2 text-sm font-bold uppercase tracking-wide ${corHeader}`}>
        {titulo}
      </div>
      <table className="w-full text-sm">
        <thead className="bg-slate-50 text-xs">
          <tr>
            <th rowSpan={2} className="border-r border-slate-200 px-3 py-2 text-left font-semibold text-slate-600">
              Competência
            </th>
            <th colSpan={2} className="border-l border-r border-slate-200 px-3 py-1 text-center font-semibold text-blue-700">
              SPED — {titulo}
            </th>
            <th rowSpan={2} className="border-r border-slate-200 bg-emerald-50 px-3 py-2 text-right font-semibold text-emerald-800">
              Saldo — {titulo}
            </th>
            <th colSpan={2} className="border-r border-slate-200 px-3 py-1 text-center font-semibold text-purple-700">
              DCTFWeb/DCTF — {titulo}
            </th>
            <th rowSpan={2} className="border-r border-slate-200 bg-emerald-50 px-3 py-2 text-right font-semibold text-emerald-800">
              Saldo — {titulo}
            </th>
            <th rowSpan={2} className="px-3 py-2 text-right font-semibold text-slate-700">
              Divergência
            </th>
          </tr>
          <tr>
            <th className="border-l border-slate-200 px-3 py-1 text-right font-semibold text-slate-600">Débito</th>
            <th className="border-r border-slate-200 px-3 py-1 text-right font-semibold text-slate-600">Crédito</th>
            <th className="px-3 py-1 text-right font-semibold text-slate-600">Débito</th>
            <th className="border-r border-slate-200 px-3 py-1 text-right font-semibold text-slate-600">Crédito</th>
          </tr>
        </thead>
        <tbody>
          {linhas.map((l) => {
            const t = selecionar(l);
            const nadaEntregue = !l.spedPresente && !l.dctfPresente;
            const divergencia = t.spedSaldo - t.dctfSaldo;
            const divergeSaldos = l.spedPresente && l.dctfPresente && Math.abs(divergencia) > 0.01;
            return (
              <tr
                key={l.mes}
                className={`border-t border-slate-100 ${nadaEntregue ? "text-slate-400" : ""} ${
                  divergeSaldos ? "bg-red-50" : ""
                }`}
              >
                <td className="border-r border-slate-100 px-3 py-2 font-medium">
                  {MESES_PT[l.mes]}/{String(ano).slice(2)}
                </td>
                <td className="border-l border-slate-100 px-3 py-2 text-right font-mono">
                  {l.spedPresente ? brl(t.spedDebito) : AUSENTE}
                </td>
                <td className="border-r border-slate-100 px-3 py-2 text-right font-mono">
                  {l.spedPresente ? brl(t.spedCredito) : AUSENTE}
                </td>
                <td className="border-r border-slate-100 px-3 py-2 text-right font-mono font-semibold">
                  {l.spedPresente ? brlDC(t.spedSaldo) : AUSENTE}
                </td>
                <td className="px-3 py-2 text-right font-mono">
                  {l.dctfPresente ? brl(t.dctfDebito) : AUSENTE}
                </td>
                <td className="border-r border-slate-100 px-3 py-2 text-right font-mono">
                  {l.dctfPresente ? brl(t.dctfCredito) : AUSENTE}
                </td>
                <td className="border-r border-slate-100 px-3 py-2 text-right font-mono font-semibold">
                  {l.dctfPresente ? brlDC(t.dctfSaldo) : AUSENTE}
                </td>
                <td className={`px-3 py-2 text-right font-mono font-bold ${
                  divergeSaldos ? "text-red-700" : "text-slate-400"
                }`}>
                  {l.spedPresente && l.dctfPresente ? brl(divergencia) : AUSENTE}
                </td>
              </tr>
            );
          })}
        </tbody>
        <tfoot className="bg-slate-50 font-semibold">
          <tr className="border-t-2 border-slate-300">
            <td className="border-r border-slate-200 px-3 py-2">Total {ano}</td>
            <td className="border-l border-slate-100 px-3 py-2 text-right font-mono">{brl(totais.spedDebito)}</td>
            <td className="border-r border-slate-100 px-3 py-2 text-right font-mono">{brl(totais.spedCredito)}</td>
            <td className="border-r border-slate-100 px-3 py-2 text-right font-mono">{brlDC(totais.spedSaldo)}</td>
            <td className="px-3 py-2 text-right font-mono">{brl(totais.dctfDebito)}</td>
            <td className="border-r border-slate-100 px-3 py-2 text-right font-mono">{brl(totais.dctfCredito)}</td>
            <td className="border-r border-slate-100 px-3 py-2 text-right font-mono">{brlDC(totais.dctfSaldo)}</td>
            <td className={`px-3 py-2 text-right font-mono font-bold ${
              Math.abs(totais.spedSaldo - totais.dctfSaldo) > 0.01 ? "text-red-700" : "text-slate-500"
            }`}>
              {brl(totais.spedSaldo - totais.dctfSaldo)}
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
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

  // Detecção de declarações MOCK — a chamada real ao SERPRO Integra Contador
  // ainda não está implementada (dctfwebClient.ts:135), então tudo que vem
  // via "Sincronizar DCTFWeb" é sintético. Registros mock têm numeroRecibo
  // começando com "MOCK-". Se qualquer um dos registros do ano for mock, o
  // aviso aparece — não dá pra tratar valores fictícios como base de auditoria.
  const dctfMockCount = dctf.filter((d) => d.numeroRecibo?.startsWith("MOCK-")).length;
  const dctfRealCount = dctf.length - dctfMockCount;

  // Consolida por mês. Modelo por tributo (PIS ou COFINS):
  //  - débito = contribuição apurada bruta do período (pisApuradaPeriodo)
  //  - crédito = créditos descontados + créditos de período anterior
  //  - saldo = contribuição efetivamente devida (pisContribuicaoDevida)
  //  → saldo == débito − crédito ± ajustes; se saldo = 0 e débito > 0 = zerou
  //     por crédito (legítimo SOMENTE se DCTF também for zero).
  //
  // spedVazio: SPED presente mas transmitido totalmente em branco (débito +
  // crédito + saldo em zero pros DOIS tributos) — sinal de arquivo enviado
  // sem dados, não é apuração legítima.
  type LinhaTrib = LinhaTribUI;
  type Linha = LinhaMes;
  const trib0 = (): LinhaTrib => ({
    spedDebito: 0,
    spedCredito: 0,
    spedSaldo: 0,
    dctfDebito: 0,
    dctfCredito: 0,
    dctfSaldo: 0,
  });
  const linhasPorMes: Record<number, Linha> = {};
  for (let m = 0; m < 12; m++) {
    linhasPorMes[m] = {
      mes: m,
      spedPresente: false,
      spedVazio: false,
      dctfPresente: false,
      pis: trib0(),
      cofins: trib0(),
    };
  }
  for (const s of sped) {
    const m = s.periodoApuracao.getMonth();
    const l = linhasPorMes[m];
    l.spedPresente = true;
    // Débito BRUTO do período = contribuição não-cumulativa + cumulativa
    // apuradas, ANTES do desconto de créditos. Cuidado: pisApuradaPeriodo
    // (VL_TOT_CONT_APU_PER) já vem pós-crédito no SPED — não usar aqui.
    l.pis.spedDebito += Number(s.pisNaoCumulativaPeriodo) + Number(s.pisCumulativaPeriodo);
    l.cofins.spedDebito += Number(s.cofinsNaoCumulativaPeriodo) + Number(s.cofinsCumulativaPeriodo);
    // Crédito = descontados no período + crédito de período anterior utilizado.
    l.pis.spedCredito += Number(s.pisCreditosDescontados) + Number(s.pisCreditoAnterior);
    l.cofins.spedCredito += Number(s.cofinsCreditosDescontados) + Number(s.cofinsCreditoAnterior);
    // Saldo = o que efetivamente vai pra guia (já considera ajustes de ac/red).
    l.pis.spedSaldo += Number(s.pisContribuicaoDevida);
    l.cofins.spedSaldo += Number(s.cofinsContribuicaoDevida);
  }
  for (const l of Object.values(linhasPorMes)) {
    if (
      l.spedPresente &&
      l.pis.spedDebito === 0 && l.pis.spedCredito === 0 && l.pis.spedSaldo === 0 &&
      l.cofins.spedDebito === 0 && l.cofins.spedCredito === 0 && l.cofins.spedSaldo === 0
    ) {
      l.spedVazio = true;
    }
  }
  // Extrai débitos + créditos vinculados detalhados do payloadBruto quando
  // disponível (parser DCTFWeb XML SERPRO já popula isso). Fallback pra
  // pisConfessado/cofinsConfessado consolidado se não houver detalhe (DCTF
  // antiga .dec ainda não tem detalhe).
  interface DebitoBruto { codigo?: string; valor?: number; creditosVinculados?: Array<{ valor?: number }> }
  function extrairPisCofinsDoPayload(payload: unknown): { pisDeb: number; pisCred: number; cofDeb: number; cofCred: number } | null {
    if (!payload || typeof payload !== "object") return null;
    const p = payload as { debitos?: DebitoBruto[] };
    if (!Array.isArray(p.debitos)) return null;
    let pisDeb = 0, pisCred = 0, cofDeb = 0, cofCred = 0;
    for (const d of p.debitos) {
      const cod = String(d.codigo ?? "");
      const val = Number(d.valor ?? 0);
      const cred = (d.creditosVinculados ?? []).reduce((s, c) => s + Number(c.valor ?? 0), 0);
      if (cod === "8109" || cod === "6912") { pisDeb += val; pisCred += cred; }
      else if (cod === "2172" || cod === "5856") { cofDeb += val; cofCred += cred; }
    }
    return { pisDeb, pisCred, cofDeb, cofCred };
  }

  for (const d of dctf) {
    const m = d.periodoApuracao.getMonth();
    const l = linhasPorMes[m];
    l.dctfPresente = true;
    const detalhe = extrairPisCofinsDoPayload(d.payloadBruto);
    if (detalhe && (detalhe.pisDeb > 0 || detalhe.cofDeb > 0)) {
      // Parser detalhou: Débito ≠ Crédito, saldo é a diferença.
      l.pis.dctfDebito += detalhe.pisDeb;
      l.pis.dctfCredito += detalhe.pisCred;
      l.pis.dctfSaldo += detalhe.pisDeb - detalhe.pisCred;
      l.cofins.dctfDebito += detalhe.cofDeb;
      l.cofins.dctfCredito += detalhe.cofCred;
      l.cofins.dctfSaldo += detalhe.cofDeb - detalhe.cofCred;
    } else {
      // Fallback: só o consolidado (débito = saldo confessado, crédito = 0).
      l.pis.dctfDebito += Number(d.pisConfessado);
      l.cofins.dctfDebito += Number(d.cofinsConfessado);
      l.pis.dctfSaldo += Number(d.pisConfessado);
      l.cofins.dctfSaldo += Number(d.cofinsConfessado);
    }
  }

  // Detecta incoerências pra alerta no topo da página.
  const alertas: string[] = [];
  const spedZeradoComDctf: number[] = []; // meses onde saldo SPED=0 e DCTF>0 (apurou zero, confessou débito)
  const spedVazioMeses: number[] = []; // meses onde SPED foi transmitido totalmente vazio
  const spedZeradoDctfNeg: number[] = []; // meses onde saldo SPED=0 e DCTF<0 (retificação c/ SPED sem base)
  const dctfInexata: number[] = []; // meses onde DCTF vem 1/1/0 (declaração "sem movimento" protocolar) mas SPED tem movimento real
  for (const l of Object.values(linhasPorMes)) {
    if (l.spedVazio) spedVazioMeses.push(l.mes);
    if (l.spedPresente && l.pis.spedSaldo === 0 && l.cofins.spedSaldo === 0 && l.dctfPresente) {
      const dctfTotal = l.pis.dctfSaldo + l.cofins.dctfSaldo;
      if (dctfTotal > 0) spedZeradoComDctf.push(l.mes);
      else if (dctfTotal < 0) spedZeradoDctfNeg.push(l.mes);
    }
    // DCTF INEXATA: padrão 1/1/0 (débito e crédito simbólicos, saldo zero)
    // ver reference_dctf_valor_simbolico. Se SPED tem movimento significativo
    // (débito > R$ 100), é declaração inexata — o correto era informar os
    // valores reais. Só dispara quando os créditos vinculados vieram detalhados
    // (parser da DCTFWeb XML SERPRO); DCTF antiga fica de fora (Débito=Confessado, Crédito=0).
    const ehSimbolica = (deb: number, cred: number) => Math.abs(deb - 1) < 0.5 && Math.abs(cred - 1) < 0.5;
    const pisSimbolico = ehSimbolica(l.pis.dctfDebito, l.pis.dctfCredito);
    const cofSimbolico = ehSimbolica(l.cofins.dctfDebito, l.cofins.dctfCredito);
    if (l.dctfPresente && l.spedPresente && (pisSimbolico || cofSimbolico) && (l.pis.spedDebito > 100 || l.cofins.spedDebito > 100)) {
      dctfInexata.push(l.mes);
    }
  }
  if (spedVazioMeses.length > 0) {
    alertas.push(
      `⚠ SPED transmitido VAZIO em ${spedVazioMeses.length} competência(s): ${spedVazioMeses.map((m) => `${MESES_PT[m]}/${String(ano).slice(2)}`).join(", ")}. Nenhum valor de base OU devido — sinal de arquivo enviado em branco.`,
    );
  }
  if (spedZeradoComDctf.length > 0) {
    alertas.push(
      `⚠ SPED apurou ZERO mas DCTFWeb confessou DÉBITO em ${spedZeradoComDctf.length} competência(s): ${spedZeradoComDctf.map((m) => `${MESES_PT[m]}/${String(ano).slice(2)}`).join(", ")}. Não há crédito legítimo que justifique — se houvesse, a DCTF também seria zero. É apuração errada ou omissão no SPED.`,
    );
  }
  if (spedZeradoDctfNeg.length > 0) {
    alertas.push(
      `ℹ SPED em zero com DCTFWeb NEGATIVA (retificação/estorno) em ${spedZeradoDctfNeg.length} competência(s): ${spedZeradoDctfNeg.map((m) => `${MESES_PT[m]}/${String(ano).slice(2)}`).join(", ")}. Verificar se o SPED original também foi retificado.`,
    );
  }
  if (dctfInexata.length > 0) {
    alertas.push(
      `⚠ DCTFWeb INEXATA (padrão 1/1/0 "sem movimento") em ${dctfInexata.length} competência(s): ${dctfInexata.map((m) => `${MESES_PT[m]}/${String(ano).slice(2)}`).join(", ")}. SPED tem movimento real. Declaração passível de auto de infração (art. 32 Lei 9.430/96) — retificar a DCTFWeb com os valores reais mesmo que o saldo final feche em zero.`,
    );
  }

  const totais: { pis: LinhaTribUI; cofins: LinhaTribUI } = {
    pis: {
      spedDebito: sped.reduce((a, s) => a + Number(s.pisNaoCumulativaPeriodo) + Number(s.pisCumulativaPeriodo), 0),
      spedCredito: sped.reduce((a, s) => a + Number(s.pisCreditosDescontados) + Number(s.pisCreditoAnterior), 0),
      spedSaldo: sped.reduce((a, s) => a + Number(s.pisContribuicaoDevida), 0),
      dctfDebito: dctf.reduce((a, d) => a + Number(d.pisConfessado), 0),
      dctfCredito: 0,
      dctfSaldo: dctf.reduce((a, d) => a + Number(d.pisConfessado), 0),
    },
    cofins: {
      spedDebito: sped.reduce((a, s) => a + Number(s.cofinsNaoCumulativaPeriodo) + Number(s.cofinsCumulativaPeriodo), 0),
      spedCredito: sped.reduce((a, s) => a + Number(s.cofinsCreditosDescontados) + Number(s.cofinsCreditoAnterior), 0),
      spedSaldo: sped.reduce((a, s) => a + Number(s.cofinsContribuicaoDevida), 0),
      dctfDebito: dctf.reduce((a, d) => a + Number(d.cofinsConfessado), 0),
      dctfCredito: 0,
      dctfSaldo: dctf.reduce((a, d) => a + Number(d.cofinsConfessado), 0),
    },
  };

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

      {/* Aviso de DCTFWeb SIMULADA — evita que valores fictícios sejam
          tratados como base de auditoria. O modo real da SERPRO ainda não
          está implementado (ver dctfwebClient.ts). */}
      {dctfMockCount > 0 && (
        <div className="rounded-lg border-2 border-orange-400 bg-orange-50 px-4 py-3 text-sm text-orange-900">
          <div className="font-bold">⚠ DCTFWeb SIMULADA (MOCK)</div>
          <div className="mt-1">
            {dctfMockCount} de {dctf.length} declaração(ões) desta tela vieram do
            gerador MOCK, não da Receita. Os valores confessados são
            <b> fictícios </b>e não devem ser usados como base de auditoria. A
            chamada real ao SERPRO Integra Contador ainda não está
            implementada (<code>SERPRO_DCTFWEB_MODE=real</code> lança erro em
            <code>dctfwebClient.ts</code>).
            {dctfRealCount > 0 && ` (${dctfRealCount} registro(s) desta tela vieram do parser real .dec — não mock.)`}
          </div>
        </div>
      )}

      {/* Alertas de incoerência no topo (SPED vazio, apurou 0 mas confessou débito, retificação) */}
      {alertas.length > 0 && (
        <div className="space-y-2">
          {alertas.map((a, i) => {
            const critico = a.startsWith("⚠");
            return (
              <div
                key={i}
                className={`rounded-lg border px-4 py-3 text-sm ${
                  critico
                    ? "border-red-300 bg-red-50 text-red-900"
                    : "border-amber-300 bg-amber-50 text-amber-900"
                }`}
              >
                {a}
              </div>
            );
          })}
        </div>
      )}

      {/* Tabela PIS — Débito / Crédito / Saldo / DCTFWeb / Divergência */}
      <TabelaTributo
        titulo="PIS"
        corHeader="text-blue-700"
        ano={ano}
        linhas={Object.values(linhasPorMes)}
        selecionar={(l) => l.pis}
        totais={totais.pis}
      />

      {/* Tabela COFINS — mesma estrutura */}
      <TabelaTributo
        titulo="COFINS"
        corHeader="text-purple-700"
        ano={ano}
        linhas={Object.values(linhasPorMes)}
        selecionar={(l) => l.cofins}
        totais={totais.cofins}
      />

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
