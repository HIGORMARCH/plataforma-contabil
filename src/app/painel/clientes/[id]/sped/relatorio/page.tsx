import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePapel, PAPEIS_INTERNOS } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { listarEstabelecimentos } from "@/lib/estabelecimento";
import { PrintHeaderMarch } from "@/components/print/PrintHeaderMarch";
import {
  anosComDadosIcms,
  levantarDivergenciasIcms,
  totaisPorAno,
  CAMPOS,
  ROTULO_FONTE,
  type CompetenciaIcms,
  type Fonte,
  type StatusCompetencia,
  type TotalFonte,
} from "@/lib/icms/divergenciasPeriodo";
import { BotaoImprimir } from "../../impostos-declarados/_components/BotaoImprimir";

/**
 * Relatório — Divergências de ICMS no período (SPED-Fiscal × GIAM).
 *
 * A tela "Auditoria ICMS" mostra um ano por vez e as três fontes em tabelas
 * separadas. Este relatório varre o período inteiro e lista só o que não bate,
 * pronto para imprimir no papel timbrado. Regras do confronto no cabeçalho de
 * `src/lib/icms/divergenciasPeriodo.ts`.
 */

const fmtBrl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const MESES = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
const ROTULO_CURTO: Record<Fonte, string> = {
  sped: "SPED",
  siagri: "Siagri",
  dominio: "GIAM Domínio",
  sefaz: "GIAM SEFAZ",
};

export default async function RelatorioIcmsPeriodo({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ anoInicial?: string; anoFinal?: string; movimento?: string; estab?: string }>;
}) {
  const sessao = await requirePapel(PAPEIS_INTERNOS);
  const { id } = await params;
  const q = await searchParams;

  const cliente = await prisma.cliente.findFirst({
    where: { id, escritorioId: sessao.escritorioId },
    select: {
      id: true,
      razaoSocial: true,
      nomeFantasia: true,
      cnpj: true,
      inscricaoEstadual: true,
      regimeTributario: true,
    },
  });
  if (!cliente) notFound();

  const escritorio = await prisma.escritorio.findUnique({
    where: { id: sessao.escritorioId },
    select: {
      razaoSocial: true,
      nomeFantasia: true,
      cnpj: true,
      crc: true,
      endereco: true,
      telefone: true,
      email: true,
      site: true,
      logoDataUrl: true,
    },
  });

  // ICMS é por estabelecimento: o relatório é de um de cada vez (matriz por padrão).
  const estabelecimentos = await listarEstabelecimentos(id);
  const estab = estabelecimentos.find((e) => e.id === q.estab) ?? estabelecimentos[0];
  const temFiliais = estabelecimentos.length > 1;
  const qsEstab = temFiliais ? `?estab=${estab.id}` : "";
  const cnpjEstab = estab.cnpj.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5");
  const ieEstab = estab.inscricaoEstadual;

  // Período padrão: do primeiro ao último ano com apuração importada.
  const anos = await anosComDadosIcms(id, estab.id);
  const anoCorrente = new Date().getUTCFullYear();
  const anoInicial = Number(q.anoInicial) || anos[0] || anoCorrente;
  const anoFinal = Number(q.anoFinal) || anos[anos.length - 1] || anoCorrente;
  // Compras e vendas entram por padrão; o filtro existe porque o SPED soma só
  // as notas do C100 e a GIAM soma o valor contábil de tudo — diferença de
  // construção que se repete todo mês.
  const incluirMovimento = q.movimento !== "0";

  const relatorio = await levantarDivergenciasIcms({
    clienteId: id,
    estabelecimentoId: estab.id,
    anoInicial,
    anoFinal,
  });
  // Colunas: só as fontes que existem para este estabelecimento.
  const fontes = relatorio.fontesExibidas;
  const competencias = incluirMovimento
    ? relatorio.competencias
    : relatorio.competencias.map(semMovimento);

  const analisadas = competencias.filter((c) => c.status !== "vazio" && c.status !== "futuro" && c.status !== "fora");
  const divergentes = competencias.filter((c) => c.status === "divergente");
  const conferem = competencias.filter((c) => c.status === "confere");
  const comFalta = competencias.filter((c) => c.faltando.length > 0);
  // Competências cuja GIAM SEFAZ foi lida pelo robô antigo: saldo credor,
  // deduções e imposto a recolher não existem nelas e ficam fora do confronto.
  const semLeituraNova = competencias.filter((c) => c.presentes.sefaz && !c.sefazApuracaoLida).length;
  const porCampo = relatorio.porCampo.filter((c) => incluirMovimento || c.grupo !== "movimento");

  // Totais anuais sempre sobre as competências cheias: mesmo escondendo compras
  // e vendas do confronto, o valor declarado continua interessando.
  const totais = totaisPorAno(relatorio.competencias);
  const periodo = anoInicial === anoFinal ? `${anoInicial}` : `${anoInicial} a ${anoFinal}`;
  const anosDoMapa = Array.from({ length: anoFinal - anoInicial + 1 }, (_, i) => anoInicial + i);

  return (
    <div className="icms-periodo">
      <PrintHeaderMarch
        escritorio={escritorio}
        cliente={cliente.razaoSocial}
        cnpj={temFiliais ? cnpjEstab : cliente.cnpj}
        titulo="Divergências de ICMS — SPED-Fiscal × GIAM"
        subtitulo="Confronto, competência a competência, do ICMS declarado à Receita Federal (SPED-Fiscal, registro E110) e à SEFAZ-TO (GIAM). Lista apenas o que não bate e as declarações que não foram localizadas."
        meta={[
          ...(temFiliais ? [{ label: "Estabelecimento", valor: `${estab.rotulo}${estab.uf ? ` · ${estab.uf}` : ""}` }] : []),
          ...(ieEstab ? [{ label: "IE", valor: ieEstab }] : []),
          ...(cliente.regimeTributario ? [{ label: "Regime", valor: cliente.regimeTributario }] : []),
          { label: "Período", valor: periodo },
        ]}
      />

      <div className="mb-6 no-print">
        <Link href={`/painel/clientes/${id}/sped${qsEstab}`} className="text-sm text-slate-500 hover:underline">
          ← Voltar para Auditoria ICMS
        </Link>
        <div className="mt-1 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-slate-800">
              Divergências de ICMS no período — SPED-Fiscal × GIAM
            </h1>
            <p className="text-sm text-slate-500">
              {cliente.razaoSocial}
              {temFiliais && <> · {estab.rotulo}</>} · CNPJ {temFiliais ? cnpjEstab : cliente.cnpj}
              {ieEstab && <> · IE {ieEstab}</>}
              {cliente.regimeTributario && <> · {cliente.regimeTributario}</>}
            </p>
          </div>
          <BotaoImprimir />
        </div>
      </div>

      <div className="mb-6 rounded-xl border border-slate-200 bg-white p-4 no-print">
        <form className="flex flex-wrap items-end gap-3">
          {temFiliais && (
            <label className="flex flex-col text-sm">
              <span className="mb-1 text-xs text-slate-500">Estabelecimento</span>
              <select name="estab" defaultValue={estab.id} className="rounded border border-slate-300 px-2 py-1">
                {estabelecimentos.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.rotulo}
                    {e.uf ? ` · ${e.uf}` : ""}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label className="flex flex-col text-sm">
            <span className="mb-1 text-xs text-slate-500">Ano inicial</span>
            <input
              type="number"
              name="anoInicial"
              defaultValue={anoInicial}
              min={2010}
              max={anoCorrente}
              className="w-28 rounded border border-slate-300 px-2 py-1"
            />
          </label>
          <label className="flex flex-col text-sm">
            <span className="mb-1 text-xs text-slate-500">Ano final</span>
            <input
              type="number"
              name="anoFinal"
              defaultValue={anoFinal}
              min={2010}
              max={anoCorrente + 1}
              className="w-28 rounded border border-slate-300 px-2 py-1"
            />
          </label>
          <label className="flex flex-col text-sm">
            <span className="mb-1 text-xs text-slate-500">Compras e vendas</span>
            <select
              name="movimento"
              defaultValue={incluirMovimento ? "1" : "0"}
              className="rounded border border-slate-300 px-2 py-1"
            >
              <option value="1">Incluir no confronto</option>
              <option value="0">Só a apuração do ICMS</option>
            </select>
          </label>
          <button type="submit" className="btn btn-primary">
            Atualizar
          </button>
          <Link href={`/painel/clientes/${id}/sped/relatorio${qsEstab}`} className="btn text-sm">
            Período completo
          </Link>
        </form>
        {anos.length > 0 && (
          <p className="mt-2 text-xs text-slate-500">
            Há apuração importada de {anos[0]} a {anos[anos.length - 1]}. O relatório abre com o
            período completo; os campos acima servem para recortar um pedaço.
          </p>
        )}
      </div>

      {/* Resumo */}
      <div className="icms-resumo mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Cartao rotulo="Competências analisadas" valor={analisadas.length} />
        <Cartao rotulo="Conferem" valor={conferem.length} tom="ok" />
        <Cartao rotulo="Com divergência" valor={divergentes.length} tom="div" />
        <Cartao rotulo="Declaração não localizada" valor={comFalta.length} tom="falta" />
      </div>

      {/* Mapa do período */}
      <section className="icms-bloco mb-6 rounded-xl border border-slate-200 bg-white p-4">
        <h2 className="icms-titulo mb-3 text-sm font-bold uppercase tracking-wide text-slate-500">
          Mapa do período
        </h2>
        <div className="overflow-x-auto">
          <table className="icms-mapa w-full min-w-[760px] text-xs">
            <thead>
              <tr className="text-slate-500">
                <th className="px-2 py-1 text-left">Ano</th>
                {MESES.map((m) => (
                  <th key={m} className="px-1 py-1 text-center">
                    {m}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {anosDoMapa.map((ano) => (
                <tr key={ano}>
                  <td className="px-2 py-1 font-semibold text-slate-700">{ano}</td>
                  {competencias
                    .filter((c) => c.ano === ano)
                    .map((c) => (
                      <td key={c.label} className="p-0.5">
                        <CelulaMapa clienteId={id} c={c} />
                      </td>
                    ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-[11px] text-slate-500">
          <b>OK</b> SPED e GIAM (SEFAZ) batem · <b>DIV</b> algum campo diverge · <b>S/ SPED</b> ou{" "}
          <b>S/ GIAM</b> declaração não localizada na plataforma · <b>—</b> sem dado a cobrar (ano
          sem apuração importada, fora do atendimento ou competência ainda não vencida).
        </p>
      </section>

      {/* Totais de compras e vendas por ano */}
      <section className="icms-bloco mb-6 rounded-xl border border-slate-200 bg-white p-4">
        <h2 className="icms-titulo mb-3 text-sm font-bold uppercase tracking-wide text-slate-500">
          Compras e vendas por ano
        </h2>
        <div className="overflow-x-auto">
          <table className="icms-tabela icms-totais w-full min-w-[860px] text-sm">
            <thead>
              <tr className="text-left text-xs uppercase text-slate-500">
                <th className="py-1 pr-3" rowSpan={2}>
                  Ano
                </th>
                <th className="border-b border-slate-200 py-1 pr-3 text-center" colSpan={fontes.length + 1}>
                  Total de compras
                </th>
                <th className="border-b border-slate-200 py-1 text-center" colSpan={fontes.length + 1}>
                  Total de vendas
                </th>
              </tr>
              <tr className="border-b border-slate-200 text-left text-[10px] uppercase text-slate-400">
                {fontes.map((f) => (
                  <th key={`c-${f}`} className="py-1 pr-3 text-right">{ROTULO_CURTO[f]}</th>
                ))}
                <th className="py-1 pr-3 text-right">Dif.</th>
                {fontes.map((f) => (
                  <th key={`v-${f}`} className="py-1 pr-3 text-right">{ROTULO_CURTO[f]}</th>
                ))}
                <th className="py-1 text-right">Dif.</th>
              </tr>
            </thead>
            <tbody>
              {totais.map((t) => (
                <tr
                  key={t.ano ?? "periodo"}
                  className={
                    t.ano === null
                      ? "border-t-2 border-slate-300 font-semibold text-slate-800"
                      : "border-b border-slate-100"
                  }
                >
                  <td className="py-1.5 pr-3 font-medium text-slate-700">
                    {t.ano ?? `${periodo} (total)`}
                  </td>
                  {fontes.map((f) => (
                    <CelTotal key={`c-${f}`} t={t.compras[f]} />
                  ))}
                  <CelDiferenca v={t.difCompras} />
                  {fontes.map((f) => (
                    <CelTotal key={`v-${f}`} t={t.vendas[f]} />
                  ))}
                  <CelDiferenca v={t.difVendas} ultima />
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-[11px] text-slate-500">
          O número pequeno ao lado do valor é a quantidade de meses somados naquela fonte. A coluna
          <b> Dif.</b> só é calculada quando as fontes cobrem o mesmo número de meses — somar 12 meses
          de SPED contra 11 de GIAM mediria a competência que falta, não uma divergência.
        </p>
      </section>

      {/* Divergências por campo */}
      <section className="icms-bloco mb-6 rounded-xl border border-slate-200 bg-white p-4">
        <h2 className="icms-titulo mb-3 text-sm font-bold uppercase tracking-wide text-slate-500">
          Divergências por campo
        </h2>
        <table className="icms-tabela w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-xs uppercase text-slate-500">
              <th className="py-2 pr-3">Campo</th>
              <th className="py-2 pr-3">Fontes comparadas</th>
              <th className="py-2 pr-3 text-right">Competências</th>
              <th className="py-2 pr-3 text-right">Soma das diferenças</th>
            </tr>
          </thead>
          <tbody>
            {porCampo.map((c) => {
              const def = CAMPOS.find((x) => x.campo === c.campo)!;
              return (
                <tr key={c.campo} className="border-b border-slate-100">
                  <td className="py-2 pr-3 font-medium text-slate-700">{c.rotulo}</td>
                  <td className="py-2 pr-3 text-xs text-slate-500">
                    {fontes.map((f) => ROTULO_CURTO[f]).join(" · ")}
                    {def.exigeSefazAtualizada && semLeituraNova > 0 && (
                      <span className="ml-1 text-amber-700">
                        (SEFAZ fora em {semLeituraNova} competência{semLeituraNova === 1 ? "" : "s"} não relida{semLeituraNova === 1 ? "" : "s"})
                      </span>
                    )}
                  </td>
                  <td className="py-2 pr-3 text-right tabular-nums">
                    {c.competencias === 0 ? <span className="text-slate-400">nenhuma</span> : c.competencias}
                  </td>
                  <td className="py-2 pr-3 text-right tabular-nums">
                    {c.competencias === 0 ? "—" : fmtBrl.format(c.somaDiferencas)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>

      {/* Detalhe das divergências */}
      <section className="icms-bloco mb-6 rounded-xl border border-slate-200 bg-white p-4">
        <h2 className="icms-titulo mb-3 text-sm font-bold uppercase tracking-wide text-slate-500">
          Detalhe das divergências — {divergentes.length} competência{divergentes.length === 1 ? "" : "s"}
        </h2>
        {divergentes.length === 0 ? (
          <p className="text-sm text-slate-500">Nenhuma divergência no período.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="icms-tabela icms-detalhe w-full min-w-[900px] text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-xs uppercase text-slate-500">
                  <th className="py-2 pr-3">Competência</th>
                  <th className="py-2 pr-3">Campo</th>
                  {fontes.map((f) => (
                    <th key={f} className="py-2 pr-3 text-right">{ROTULO_FONTE[f]}</th>
                  ))}
                  <th className="py-2 pr-3 text-right">Diferença</th>
                  <th className="print-only py-2 text-center">Conferido</th>
                </tr>
              </thead>
              {divergentes.map((c) => (
                <tbody key={c.label} className="icms-grupo">
                  {c.divergencias.map((d, i) => (
                    <tr key={d.campo} className={i === c.divergencias.length - 1 ? "border-b border-slate-300" : ""}>
                      <td className="py-1.5 pr-3 align-top font-mono text-xs text-slate-700">
                        {i === 0 && (
                          <>
                            <Link
                              href={`/painel/auditoria-obrigacoes-acessorias/${id}/${c.ano}/${c.mes}`}
                              className="font-semibold hover:underline"
                            >
                              {c.label}
                            </Link>
                            {c.faltando.length > 0 && (
                              <span className="block text-[10px] text-amber-700">
                                sem {c.faltando.map((f) => ROTULO_FONTE[f]).join(" e ")}
                              </span>
                            )}
                          </>
                        )}
                      </td>
                      <td className="py-1.5 pr-3 text-slate-700">{d.rotulo}</td>
                      {fontes.map((f) => (
                        <ValorFonte
                          key={f}
                          v={d.valores[f]}
                          naoLido={
                            f === "sefaz" &&
                            c.presentes.sefaz &&
                            !c.sefazApuracaoLida &&
                            CAMPOS.find((x) => x.campo === d.campo)!.exigeSefazAtualizada
                          }
                        />
                      ))}
                      <td className="py-1.5 pr-3 text-right font-semibold tabular-nums text-red-700">
                        {fmtBrl.format(d.diferenca)}
                      </td>
                      <td className="print-only py-1.5 text-center">
                        {i === 0 && <span className="caixa-conferido" aria-hidden />}
                      </td>
                    </tr>
                  ))}
                </tbody>
              ))}
            </table>
          </div>
        )}
      </section>

      {/* Declarações não localizadas */}
      <section className="icms-bloco mb-6 rounded-xl border border-slate-200 bg-white p-4">
        <h2 className="icms-titulo mb-3 text-sm font-bold uppercase tracking-wide text-slate-500">
          Declarações não localizadas — {comFalta.length}
        </h2>
        {comFalta.length === 0 ? (
          <p className="text-sm text-slate-500">SPED e GIAM (SEFAZ) presentes em todas as competências.</p>
        ) : (
          <table className="icms-tabela w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs uppercase text-slate-500">
                <th className="py-2 pr-3">Competência</th>
                <th className="py-2 pr-3">Não localizado</th>
                <th className="py-2 pr-3">Presente</th>
                <th className="print-only py-2 text-center">Conferido</th>
              </tr>
            </thead>
            <tbody>
              {comFalta.map((c) => (
                <tr key={c.label} className="border-b border-slate-100">
                  <td className="py-1.5 pr-3 font-mono text-xs text-slate-700">{c.label}</td>
                  <td className="py-1.5 pr-3 text-amber-800">
                    {c.faltando.map((f) => ROTULO_FONTE[f]).join(" e ")}
                  </td>
                  <td className="py-1.5 pr-3 text-slate-500">
                    {fontes
                      .filter((f) => c.presentes[f])
                      .map((f) => ROTULO_FONTE[f])
                      .join(", ") || "nenhuma fonte"}
                  </td>
                  <td className="print-only py-1.5 text-center">
                    <span className="caixa-conferido" aria-hidden />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <p className="mt-2 text-[11px] text-slate-500">
          &quot;Não localizada&quot; quer dizer que a declaração não está importada na plataforma — pode
          ter sido entregue e ainda não ter sido buscada na pasta ou no portal.
        </p>
      </section>

      <div className="icms-nota rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-xs leading-relaxed text-slate-600">
        <p>
          <b>Critério.</b> Um campo diverge quando, entre as fontes que têm aquele valor, o maior e o
          menor se afastam mais de R$ 0,01. A diferença mostrada é maior − menor. Para as GIAMs vale
          a última retificação importada. <i>ICMS a recolher</i> da GIAM considera só o tipo
          &quot;N&quot; (normal) do Segmento E — difal e ST não têm equivalente no E110 do SPED.
        </p>
        <p className="mt-1.5">
          <b>GIAM (SEFAZ).</b> Saldo credor anterior, deduções e imposto a recolher vêm dos itens
          6.4, 7.2 e 7.3 do espelho — o robô passou a lê-los em 19/09/2026.
          {semLeituraNova > 0 ? (
            <>
              {" "}
              Neste período há <b>{semLeituraNova} competência{semLeituraNova === 1 ? "" : "s"}</b>{" "}
              sincronizada{semLeituraNova === 1 ? "" : "s"} antes disso: nelas esses três campos
              aparecem como &quot;não lido&quot; e ficam fora do confronto até a releitura no portal
              (botão <i>Buscar no portal SEFAZ</i>, na tela da Auditoria ICMS).
            </>
          ) : (
            " Todas as competências deste período já foram lidas pelo robô novo."
          )}
        </p>
        <p className="mt-1.5">
          <b>Compras e vendas.</b> O SPED soma as notas regulares do registro C100; a GIAM soma o
          valor contábil de todas as entradas e saídas (inclui frete, energia, comunicação). Diferenças
          pequenas e recorrentes aqui tendem a ser de construção, não de declaração.
        </p>
      </div>
    </div>
  );
}

/** Mesma competência com o confronto restrito aos campos da apuração. */
function semMovimento(c: CompetenciaIcms): CompetenciaIcms {
  const divergencias = c.divergencias.filter((d) => d.grupo !== "movimento");
  if (c.status !== "divergente" || divergencias.length > 0) return { ...c, divergencias };
  return { ...c, divergencias, status: c.faltando.length > 0 ? "falta" : "confere" };
}

function Cartao({ rotulo, valor, tom }: { rotulo: string; valor: number; tom?: "ok" | "div" | "falta" }) {
  const cor =
    tom === "ok" ? "text-sky-800" : tom === "div" ? "text-red-700" : tom === "falta" ? "text-amber-700" : "text-slate-800";
  return (
    <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
      <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">{rotulo}</div>
      <div className={`mt-1 text-2xl font-bold tabular-nums ${cor}`}>{valor}</div>
    </div>
  );
}

const ESTILO_STATUS: Record<StatusCompetencia, string> = {
  confere: "bg-sky-50 text-sky-800 border-sky-200",
  divergente: "bg-red-50 text-red-700 border-red-200 font-semibold",
  falta: "bg-amber-50 text-amber-800 border-amber-200",
  fora: "bg-white text-slate-300 border-slate-100",
  futuro: "bg-white text-slate-300 border-slate-100",
  vazio: "bg-white text-slate-300 border-slate-100",
};

function textoStatus(c: CompetenciaIcms): string {
  if (c.status === "confere") return "OK";
  if (c.status === "divergente") return "DIV";
  if (c.status === "falta") {
    if (c.faltando.length === 2) return "S/ AMBAS";
    return c.faltando[0] === "sped" ? "S/ SPED" : "S/ GIAM";
  }
  return "—";
}

function CelulaMapa({ clienteId, c }: { clienteId: string; c: CompetenciaIcms }) {
  const conteudo = (
    <span
      className={`icms-cel icms-cel-${c.status} block rounded border px-1 py-1 text-center text-[10px] ${ESTILO_STATUS[c.status]}`}
      title={c.divergencias.map((d) => d.rotulo).join(", ") || undefined}
    >
      {textoStatus(c)}
    </span>
  );
  if (c.status === "vazio" || c.status === "futuro" || c.status === "fora") return conteudo;
  return (
    <Link href={`/painel/auditoria-obrigacoes-acessorias/${clienteId}/${c.ano}/${c.mes}`} className="block">
      {conteudo}
    </Link>
  );
}

/** Total anual de uma fonte, com o nº de meses somados em miúdo ao lado. */
function CelTotal({ t }: { t: TotalFonte | undefined }) {
  if (!t) {
    return (
      <td className="py-1.5 pr-3 text-right">
        <span className="text-slate-300">—</span>
      </td>
    );
  }
  return (
    <td className="py-1.5 pr-3 text-right tabular-nums text-slate-700">
      {fmtBrl.format(t.valor)}
      <span className="ml-1 text-[10px] text-slate-400">{t.meses}m</span>
    </td>
  );
}

function CelDiferenca({ v, ultima = false }: { v: number | null; ultima?: boolean }) {
  const cls = ultima ? "py-1.5 text-right tabular-nums" : "py-1.5 pr-3 text-right tabular-nums";
  if (v === null) {
    return (
      <td className={cls}>
        <span className="text-[10px] italic text-slate-400" title="Meses diferentes entre as fontes">
          meses ≠
        </span>
      </td>
    );
  }
  if (v <= 0.01) {
    return (
      <td className={`${cls} text-sky-800`}>
        <span title="As fontes somam o mesmo">confere</span>
      </td>
    );
  }
  return <td className={`${cls} font-semibold text-red-700`}>{fmtBrl.format(v)}</td>;
}

function ValorFonte({ v, naoLido = false }: { v: number | undefined; naoLido?: boolean }) {
  return (
    <td className="py-1.5 pr-3 text-right tabular-nums text-slate-700">
      {v !== undefined ? (
        fmtBrl.format(v)
      ) : naoLido ? (
        <span className="text-[10px] italic text-slate-400">não lido</span>
      ) : (
        <span className="text-slate-300">—</span>
      )}
    </td>
  );
}
