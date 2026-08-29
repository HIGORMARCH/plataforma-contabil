import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePapel, PAPEIS_INTERNOS } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { inventariarRazao } from "@/lib/razao/varrerPastaRazao";
import { conciliarRazaoComPagamentos, tributoDoCodigoReceita } from "@/lib/razao/conciliar";
import { resumirPagamentosPorCodigo } from "@/lib/razao/pagamentosEcac";
import {
  TRIBUTOS_RAZAO,
  ROTULO_TRIBUTO_RAZAO,
  FONTE_PAGAMENTO,
  recolheSeparadamente,
  type TributoRazao,
} from "@/lib/razao/tributos";
import { ehSimples } from "@/lib/regime";

/**
 * Conciliação de Impostos — razão contábil × pagamento, por tributo.
 *
 * Escopo definido pelo Higor em 29/08/2026: o confronto não é só de ICMS. São os
 * nove tributos que aparecem na contabilidade (Simples, INSS, FGTS, IRRF, PIS,
 * COFINS, ICMS, IRPJ, CSLL), e cada empresa entra com os razões que tem.
 *
 * O razão vem de PDF, numa pasta `RAZAO` dentro da pasta do cliente, um arquivo
 * por tributo ("Razao ICMS", "Razao INSS"...). O nome do arquivo é o de-para.
 *
 * Esta tela mostra, hoje, os dois lados que já existem:
 *   - o que a plataforma tem de PAGAMENTO por tributo (comprovantes + e-CAC);
 *   - quais razões estão na pasta, prontos para leitura.
 * A extração dos lançamentos do razão entra quando houver um PDF real para
 * validar o layout — chutar layout foi o que fez o parser do PGDAS trocar
 * receita bruta por imposto.
 */

const fmtBrl = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});
const fmtData = new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC" });


export default async function ConciliacaoImpostosPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ anoInicial?: string; anoFinal?: string; divergencias?: string }>;
}) {
  const sessao = await requirePapel(PAPEIS_INTERNOS);
  const { id } = await params;
  const q = await searchParams;

  const anoCorrente = new Date().getUTCFullYear();
  const anoInicial = Number(q.anoInicial) || anoCorrente - 1;
  const anoFinal = Number(q.anoFinal) || anoCorrente;
  // A tela é dos NÚMEROS. A leitura das divergências é um relatório à parte,
  // pedido de propósito — regra do Higor em 29/08/2026.
  const mostrarDivergencias = q.divergencias === "1";

  const cliente = await prisma.cliente.findFirst({
    where: { id, escritorioId: sessao.escritorioId },
    select: {
      id: true,
      razaoSocial: true,
      nomeFantasia: true,
      cnpj: true,
      regimeTributario: true,
      pastaLocal: true,
    },
  });
  if (!cliente) notFound();

  const de = new Date(Date.UTC(anoInicial, 0, 1));
  const ate = new Date(Date.UTC(anoFinal, 11, 31));

  const [inventario, conciliacoes, porCodigo, pagamentos, desmembramentos, giams] =
    await Promise.all([
    inventariarRazao(id),
    conciliarRazaoComPagamentos({ clienteId: id, anoInicial, anoFinal }),
    resumirPagamentosPorCodigo({ clienteId: id, de, ate }),
    prisma.ecacPagamento.findMany({
      where: { clienteId: id, periodoApuracao: { gte: de, lte: ate } },
      orderBy: { periodoApuracao: "asc" },
    }),
    prisma.ecacDesmembramento.findMany({
      where: {
        pagamento: { clienteId: id },
        periodoApuracao: { gte: de, lte: ate },
      },
    }),
    // ICMS não passa pelo e-CAC: o lado "declarado" dele é a GIAM.
    prisma.giamApuracao.findMany({
      where: { clienteId: id, retificacao: "00", periodoApuracao: { gte: de, lte: ate } },
      select: { periodoApuracao: true, icmsARecolherTotal: true },
    }),
  ]);

  // Pago por tributo — pelo desmembramento quando existe (é o nível que separa
  // INSS de IRRF dentro do mesmo DARF); senão pelo código principal do documento.
  const pagoPorTributo = new Map<TributoRazao, { valor: number; docs: number; ultimo: Date | null }>();
  const somar = (t: TributoRazao, valor: number, data: Date | null) => {
    const atual = pagoPorTributo.get(t) ?? { valor: 0, docs: 0, ultimo: null };
    atual.valor += valor;
    atual.docs++;
    if (data && (!atual.ultimo || data > atual.ultimo)) atual.ultimo = data;
    pagoPorTributo.set(t, atual);
  };
  // Mesma classificação usada na conciliação — inclusive a normalização do
  // código ("561" do e-CAC é o mesmo "0561" do comprovante).
  const tributoDoCodigo = tributoDoCodigoReceita;

  const pagamentoPorId = new Map(pagamentos.map((p) => [p.id, p]));
  const comDesmembramento = new Set(desmembramentos.map((d) => d.pagamentoId));
  for (const d of desmembramentos) {
    const t = tributoDoCodigo(d.codigoReceita);
    if (!t) continue;
    somar(t, Number(d.valorTotal), pagamentoPorId.get(d.pagamentoId)?.dataArrecadacao ?? null);
  }
  for (const p of pagamentos) {
    if (comDesmembramento.has(p.id)) continue; // já contado pelo desmembramento
    const t = tributoDoCodigo(p.codigoReceitaPrincipal);
    if (!t) continue;
    somar(t, Number(p.valorTotal), p.dataArrecadacao);
  }
  // ICMS: o pagamento é DARE estadual, que não entra no e-CAC. O que a
  // plataforma tem hoje é o declarado na GIAM.
  const icmsDeclarado = giams.reduce((s, g) => s + Number(g.icmsARecolherTotal), 0);

  // No Simples, IRPJ/CSLL/PIS/COFINS estão dentro do DAS — não existe razão nem
  // guia própria. Listar como "sem arquivo" seria cobrar o que não há.
  const clienteEhSimples = ehSimples(cliente.regimeTributario);

  return (
    <div>
      <div className="mb-6">
        <Link href={`/painel/clientes/${id}`} className="text-sm text-slate-500 hover:underline">
          ← Voltar para {cliente.nomeFantasia || cliente.razaoSocial}
        </Link>
        <h1 className="mt-1 text-2xl font-bold text-slate-800">
          Conciliação de Impostos — razão × pago
        </h1>
        <p className="text-sm text-slate-500">
          {cliente.razaoSocial} · CNPJ {cliente.cnpj}
          {cliente.regimeTributario && <> · {cliente.regimeTributario}</>}
        </p>
      </div>

      <div className="mb-6 rounded-xl border border-slate-200 bg-white p-4">
        <form className="flex flex-wrap items-end gap-3">
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
          <button type="submit" className="btn btn-primary">
            Atualizar período
          </button>
          {mostrarDivergencias && <input type="hidden" name="divergencias" value="1" />}
        </form>

        {conciliacoes.length > 0 && (
          <div className="mt-3 border-t border-slate-100 pt-3">
            <Link
              href={`/painel/clientes/${id}/conciliacao-impostos?anoInicial=${anoInicial}&anoFinal=${anoFinal}${
                mostrarDivergencias ? "" : "&divergencias=1"
              }`}
              className="btn btn-accent text-sm"
            >
              {mostrarDivergencias ? "← Voltar aos números" : "Relatório de divergências"}
            </Link>
          </div>
        )}
      </div>

      <section className="mb-6 overflow-x-auto rounded-xl border border-slate-200 bg-white p-5">
        <h2 className="mb-1 text-sm font-bold uppercase tracking-wide text-slate-500">
          Os nove tributos
        </h2>
        <p className="mb-4 text-xs text-slate-500">
          Cada empresa entra com os razões que tem — tributo sem arquivo na pasta não é falha, é
          tributo que essa empresa não recolhe.
        </p>
        <table className="w-full min-w-[820px] text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
              <th className="px-3 py-2 text-left font-semibold">Tributo</th>
              <th className="px-3 text-left font-semibold">Razão na pasta</th>
              <th className="px-3 text-right font-semibold">Pago no período</th>
              <th className="px-3 text-left font-semibold">Último pagamento</th>
              <th className="px-3 text-left font-semibold">Fonte do pagamento</th>
            </tr>
          </thead>
          <tbody>
            {TRIBUTOS_RAZAO.map((t) => {
              // Um tributo pode ter mais de um razão — o ICMS da LUPO tem a
              // conta normal e a do DIFAL, contas distintas no mesmo tributo.
              const arquivos = inventario.encontrados.filter((a) => a.tributo === t);
              const arquivo = arquivos[0];
              const separado = recolheSeparadamente(t, clienteEhSimples);
              const pago = pagoPorTributo.get(t);
              const ehIcms = t === "ICMS";
              return (
                <tr key={t} className="border-b border-slate-100">
                  <td
                    className={
                      "px-3 py-2 text-left font-semibold " +
                      (separado ? "text-slate-700" : "text-slate-400")
                    }
                  >
                    {ROTULO_TRIBUTO_RAZAO[t]}
                  </td>
                  <td className="px-3 text-left text-xs">
                    {!separado && arquivos.length === 0 ? (
                      <span className="text-slate-400">dentro do DAS</span>
                    ) : arquivos.length > 0 ? (
                      <span className="text-emerald-700">
                        {arquivos.map((a) => a.nome).join(" · ")}{" "}
                        <span className="text-slate-400">
                          ({Math.round(
                            arquivos.reduce((s, a) => s + a.tamanhoBytes, 0) / 1024,
                          )}{" "}
                          KB · {fmtData.format(arquivo.modificadoEm)})
                        </span>
                      </span>
                    ) : (
                      <span className="text-slate-400">sem arquivo</span>
                    )}
                  </td>
                  <td className="px-3 text-right font-mono">
                    {ehIcms ? (
                      icmsDeclarado > 0 ? (
                        <span title="Declarado na GIAM — o DARE estadual não entra no e-CAC">
                          {fmtBrl.format(icmsDeclarado)}*
                        </span>
                      ) : (
                        <span className="text-slate-300">—</span>
                      )
                    ) : pago ? (
                      fmtBrl.format(pago.valor)
                    ) : (
                      <span className="text-slate-300">—</span>
                    )}
                  </td>
                  <td className="px-3 text-left text-xs text-slate-500">
                    {pago?.ultimo ? fmtData.format(pago.ultimo) : "—"}
                  </td>
                  <td className="px-3 text-left text-xs text-slate-500">
                    {separado
                      ? FONTE_PAGAMENTO[t]
                      : "Recolhido dentro do DAS — sem guia própria no Simples"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <p className="mt-3 text-xs text-slate-500">
          * ICMS: o valor mostrado é o <b>declarado na GIAM</b>, não o pago — o DARE estadual não
          passa pelo e-CAC. FGTS ainda não tem fonte de pagamento na plataforma (é GRF / FGTS
          Digital).
          {clienteEhSimples && (
            <>
              {" "}
              Empresa do Simples: IRPJ, CSLL, PIS e COFINS são recolhidos dentro do DAS e por isso
              não têm razão nem guia própria. O que continua à parte é INSS retido, IRRF, FGTS e o
              ICMS de complementação/difal.
            </>
          )}
        </p>
      </section>

      {porCodigo.length > 0 && (
        <section className="mb-6 overflow-x-auto rounded-xl border border-slate-200 bg-white p-5">
          <div className="mb-3 flex flex-wrap items-baseline justify-between gap-3">
            <h2 className="text-sm font-bold uppercase tracking-wide text-slate-500">
              Tudo que foi pago no e-CAC
            </h2>
            <p className="text-sm text-slate-500">
              Total:{" "}
              <span className="font-mono text-base font-semibold text-slate-800">
                {fmtBrl.format(porCodigo.reduce((s, x) => s + x.total, 0))}
              </span>
            </p>
          </div>
          <p className="mb-3 text-xs text-slate-500">
            Todo documento de arrecadação, por código de receita — inclusive o que não pertence a
            nenhum dos nove razões (dívida ativa, multa). Documento com composição é contado pelas
            linhas dela, então o DARF numerado da DCTFWeb não conta duas vezes.
          </p>
          <table className="w-full min-w-[760px] text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
                <th className="px-3 py-2 text-left font-semibold">Código</th>
                <th className="px-3 text-left font-semibold">Receita</th>
                <th className="px-3 text-left font-semibold">Entra em</th>
                <th className="px-3 text-right font-semibold">Documentos</th>
                <th className="px-3 text-right font-semibold">Total pago</th>
              </tr>
            </thead>
            <tbody>
              {porCodigo.map((x) => (
                <tr key={x.codigo} className="border-b border-slate-100">
                  <td className="px-3 py-1.5 text-left font-mono">{x.codigo}</td>
                  <td className="px-3 text-left text-xs text-slate-600">
                    {x.descricao ?? <span className="text-slate-300">—</span>}
                  </td>
                  <td
                    className={
                      "px-3 text-left text-xs " +
                      (x.tributo ? "text-slate-600" : "text-amber-700")
                    }
                  >
                    {x.destino}
                  </td>
                  <td className="px-3 text-right font-mono text-slate-500">{x.documentos}</td>
                  <td className="px-3 text-right font-mono">{fmtBrl.format(x.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {conciliacoes.map((c) => {
        const divergentes = c.linhas.filter((l) => Math.abs(l.diferenca) > 0.01);
        return (
          <section
            key={c.tributo}
            className="mb-6 overflow-x-auto rounded-xl border border-slate-200 bg-white p-5"
          >
            <div className="mb-3 flex flex-wrap items-baseline justify-between gap-3">
              <h2 className="text-sm font-bold uppercase tracking-wide text-slate-500">
                {ROTULO_TRIBUTO_RAZAO[c.tributo]} — {c.contaCodigo} {c.conta}
              </h2>
              <p className="text-xs text-slate-500">
                {c.lancamentos} lançamento(s) · {c.linhas.length} competência(s)
                {mostrarDivergencias && (
                  <>
                    {" · "}
                    {divergentes.length === 0
                      ? "todas conferem"
                      : `${divergentes.length} divergem`}
                  </>
                )}
                {c.saldoFinal !== null && (
                  <>
                    {" "}
                    · saldo final{" "}
                    <span
                      className={
                        c.saldoFinal < 0 ? "font-semibold text-amber-700" : "text-slate-600"
                      }
                    >
                      {fmtBrl.format(Math.abs(c.saldoFinal))} {c.saldoFinal < 0 ? "devedor" : "credor"}
                    </span>
                  </>
                )}
              </p>
            </div>

            {mostrarDivergencias && c.alertas.length > 0 && (
              <ul className="mb-3 list-disc pl-4 text-xs text-amber-800">
                {c.alertas.map((a, i) => (
                  <li key={i}>{a}</li>
                ))}
              </ul>
            )}

            <table className="w-full min-w-[720px] text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
                  <th className="px-3 py-2 text-left font-semibold">Competência</th>
                  <th className="px-3 text-right font-semibold">Provisionado (crédito)</th>
                  <th className="px-3 text-right font-semibold">Baixa por pagamento</th>
                  <th className="px-3 text-right font-semibold">Pago (guia)</th>
                  {mostrarDivergencias && (
                    <th className="px-3 text-right font-semibold">Diferença</th>
                  )}
                </tr>
              </thead>
              <tbody>
                {(mostrarDivergencias ? divergentes : c.linhas).map((l) => (
                  <tr key={l.competencia.getTime()} className="border-b border-slate-100">
                    <td className="px-3 py-1.5 text-left font-mono">
                      {String(l.competencia.getUTCMonth() + 1).padStart(2, "0")}/
                      {l.competencia.getUTCFullYear()}
                    </td>
                    <td className="px-3 text-right font-mono text-slate-500">
                      {l.razaoCredito === 0 ? "—" : fmtBrl.format(l.razaoCredito)}
                    </td>
                    <td className="px-3 text-right font-mono">
                      {l.razaoPagamento === 0 ? "—" : fmtBrl.format(l.razaoPagamento)}
                    </td>
                    <td className="px-3 text-right font-mono">
                      {l.pago === 0 ? (
                        <span className="text-slate-300">—</span>
                      ) : (
                        <>
                          {fmtBrl.format(l.pago)}
                          <span className="ml-1 text-[10px] text-slate-400">
                            {l.documentos} doc
                          </span>
                        </>
                      )}
                    </td>
                    {mostrarDivergencias && (
                      <td
                        className={
                          "px-3 text-right font-mono " +
                          (Math.abs(l.diferenca) < 0.01 ? "text-emerald-700" : "text-amber-700")
                        }
                      >
                        {Math.abs(l.diferenca) < 0.01 ? "confere" : fmtBrl.format(l.diferenca)}
                      </td>
                    )}
                  </tr>
                ))}
                <tr className="border-t-2 border-slate-300 font-semibold">
                  <td className="px-3 py-2 text-left">Total</td>
                  <td className="px-3 text-right font-mono text-slate-500">—</td>
                  <td className="px-3 text-right font-mono">
                    {fmtBrl.format(c.totalRazaoPagamento)}
                  </td>
                  <td className="px-3 text-right font-mono">{fmtBrl.format(c.totalPago)}</td>
                  {mostrarDivergencias && (
                    <td className="px-3 text-right font-mono">
                      {fmtBrl.format(c.totalRazaoPagamento - c.totalPago)}
                    </td>
                  )}
                </tr>
              </tbody>
            </table>
          </section>
        );
      })}

      {/* A configuração da pasta vive no cadastro do cliente. Aqui só entra
          aviso quando a falta dela é a razão de a tela estar vazia. */}
      {(!inventario.existe || inventario.naoIdentificados.length > 0) && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-900">
          {!inventario.existe && (
            <p>
              A pasta do razão ainda não existe.{" "}
              <Link href={`/painel/clientes/${id}/editar`} className="font-semibold underline">
                Definir no cadastro do cliente
              </Link>
              .
            </p>
          )}
          {inventario.naoIdentificados.length > 0 && (
            <p className={inventario.existe ? "" : "mt-2"}>
              {inventario.naoIdentificados.length} arquivo(s) na pasta sem tributo identificável:{" "}
              {inventario.naoIdentificados.map((x) => x.nome).join(", ")}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
