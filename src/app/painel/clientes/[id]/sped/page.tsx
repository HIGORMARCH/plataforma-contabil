import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePapel, PAPEIS_INTERNOS } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { listarEstabelecimentos, type EstabelecimentoInfo } from "@/lib/estabelecimento";
import { UploadSpedForm } from "./_components/UploadSpedForm";
import { VarrerPastaButton } from "./_components/VarrerPastaButton";
import { VarrerPastaGiamButton } from "./_components/VarrerPastaGiamButton";
import { BuscarNoPortalSefazButton } from "./_components/BuscarNoPortalSefazButton";
import { UploadRaicmsSiagri } from "./_components/UploadRaicmsSiagri";

const fmtBrl = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

const fmtMesAno = new Intl.DateTimeFormat("pt-BR", {
  month: "2-digit",
  year: "numeric",
  timeZone: "UTC",
});

const fmtDataHora = new Intl.DateTimeFormat("pt-BR", {
  dateStyle: "short",
  timeStyle: "short",
});

export default async function SpedCliente({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ ano?: string; estab?: string }>;
}) {
  const sessao = await requirePapel(PAPEIS_INTERNOS);
  const { id } = await params;
  const { ano: anoStr, estab: estabParam } = await searchParams;

  const existe = await prisma.cliente.findFirst({
    where: { id, escritorioId: sessao.escritorioId },
    select: { id: true },
  });
  if (!existe) notFound();

  // O ICMS é por estabelecimento: a tela mostra um de cada vez (matriz por padrão).
  const estabelecimentos = await listarEstabelecimentos(id);
  const estab = estabelecimentos.find((e) => e.id === estabParam) ?? estabelecimentos[0];
  const doEstab = { estabelecimentoId: estab.id };

  const cliente = await prisma.cliente.findFirstOrThrow({
    where: { id },
    include: {
      spedApuracoes: { where: doEstab, orderBy: { periodoApuracao: "desc" } },
      spedImportacoes: { where: doEstab, orderBy: { importadoEm: "desc" }, take: 10 },
      giamApuracoes: {
        where: doEstab,
        orderBy: [{ periodoApuracao: "desc" }, { retificacao: "desc" }],
        include: { icmsARecolher: true },
      },
      giamImportacoes: { where: doEstab, orderBy: { importadoEm: "desc" }, take: 10 },
      giamSefazApuracoes: {
        where: doEstab,
        orderBy: [{ periodoApuracao: "desc" }, { retificacao: "desc" }],
      },
      giamSefazSincronizacoes: {
        where: doEstab,
        orderBy: { executadoEm: "desc" },
        take: 10,
      },
      siagriApuracoes: { where: doEstab, orderBy: { periodoApuracao: "desc" } },
    },
  });
  // Lado "sistema da empresa" quando não é o Domínio (CONEXAO: Siagri).
  const usaSiagri = cliente.sistemaGestao === "SIAGRI" || cliente.siagriApuracoes.length > 0;
  const qsEstab = estabelecimentos.length > 1 ? `&estab=${estab.id}` : "";
  // GIAM é declaração da SEFAZ-TO: estabelecimento de outro estado não entrega.
  const entregaGiam = !estab.uf || estab.uf === "TO";

  // Um ano por vez: o que está em tela é só a competência escolhida.
  const anoDe = (d: Date) => d.getUTCFullYear();
  const anosComDados = new Set<number>([
    ...cliente.spedApuracoes.map((a) => anoDe(a.periodoApuracao)),
    ...cliente.giamApuracoes.map((a) => anoDe(a.periodoApuracao)),
    ...cliente.giamSefazApuracoes.map((a) => anoDe(a.periodoApuracao)),
  ]);
  const ano = anoStr ? Number(anoStr) : anoDefault(cliente);
  anosComDados.add(ano);
  const anosDisponiveis = [...anosComDados].sort((a, b) => b - a);

  const spedAno = cliente.spedApuracoes.filter((a) => anoDe(a.periodoApuracao) === ano);
  const giamAno = cliente.giamApuracoes.filter((a) => anoDe(a.periodoApuracao) === ano);
  const giamSefazAno = cliente.giamSefazApuracoes.filter((a) => anoDe(a.periodoApuracao) === ano);
  const siagriAno = cliente.siagriApuracoes.filter((a) => anoDe(a.periodoApuracao) === ano);

  return (
    <div>
      <div className="mb-6">
        <Link href={`/painel/clientes/${id}`} className="text-sm text-slate-500 hover:underline">
          ← Voltar para {cliente.nomeFantasia || cliente.razaoSocial}
        </Link>
        <div className="mt-1 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-slate-800">
              Auditoria ICMS — SPED-Fiscal + GIAM
            </h1>
            <p className="text-sm text-slate-500">
              Apuração declarada à Receita Federal (SPED) e à SEFAZ-TO (GIAM). Ambas devem bater —
              divergência entre elas indica que declararam valores diferentes aos dois fiscos.
            </p>
          </div>
          <Link
            href={`/painel/clientes/${id}/sped/relatorio${estabelecimentos.length > 1 ? `?estab=${estab.id}` : ""}`}
            className="btn btn-primary text-sm"
          >
            Relatório de divergências do período
          </Link>
        </div>
      </div>

      {estabelecimentos.length > 1 && (
        <SeletorEstabelecimento
          hrefBase={`/painel/clientes/${id}/sped?ano=${anoStr ?? ""}`}
          estabelecimentos={estabelecimentos}
          atual={estab}
        />
      )}

      {/* Seletor de ano */}
      <div className="mb-6 flex flex-wrap items-center gap-2">
        <span className="text-sm text-slate-600">Ano:</span>
        {anosDisponiveis.map((a) => (
          <Link
            key={a}
            href={`/painel/clientes/${id}/sped?ano=${a}${qsEstab}`}
            className={`btn text-sm ${a === ano ? "btn-primary" : "btn-ghost"}`}
          >
            {a}
          </Link>
        ))}
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <VarrerPastaButton clienteId={id} pastaFiscal={cliente.pastaSpedFiscal || cliente.pastaFiscal} ano={ano} />
        <UploadSpedForm clienteId={id} />
      </div>

      {entregaGiam && (
        <div className="mt-6">
          <VarrerPastaGiamButton
            clienteId={id}
            pastaGiam={cliente.pastaGiam}
            pastaFiscal={cliente.pastaFiscal}
            ano={ano}
          />
        </div>
      )}

      {/*
        Colunas CANÔNICAS do confronto (idênticas nas 3 tabelas — a
        divergência precisa saltar aos olhos). Ordem e nomes iguais em
        SPED, GIAM Domínio e GIAM SEFAZ.

        ICMS a Recolher = só tipo "N" do Segmento E da GIAM, que é o único
        comparável com o VL_ICMS_RECOLHER do E110 do SPED. Somar difal/ST
        acusa divergência em todo mês que tiver difal — falso alarme.

        Cada tabela leva embaixo um <details> com o histórico de importações
        daquela fonte — fechado por padrão pra não poluir a leitura.

        key={ano}: trocar de ano recria as tabelas inteiras — nenhum texto do
        ano anterior sobrevive.
      */}
      <div key={ano}>
      <section className="card mt-6 p-5">
        <h2 className="mb-1 text-sm font-bold uppercase tracking-wide text-slate-500">
          Apurações SPED-Fiscal {ano} — {spedAno.length}
        </h2>
        <p className="mb-4 text-xs text-slate-400">
          Declarado à Receita Federal (registro E110 + soma dos C100 regulares).
        </p>
        {spedAno.length === 0 ? (
          <p className="text-sm text-slate-500">
            Nenhuma apuração de {ano}. Busque os SPEDs na pasta ou faça upload do arquivo (.txt) acima.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <TabelaApuracoes
              linhas={spedAno.map((a) => ({
                key: a.id,
                competencia: a.periodoApuracao,
                revisao: null,
                totalCompras: Number(a.totalCompras),
                totalVendas: Number(a.totalVendas),
                creditoEntradas: Number(a.totalCreditos),
                debitoSaidas: Number(a.totalDebitos),
                saldoCredorAnterior: Number(a.saldoCredorAnterior),
                deducoes: Number(a.deducoes),
                icmsARecolher: Number(a.icmsARecolher),
              }))}
            />
          </div>
        )}
        <AccordionImportacoes
          tipo="sped"
          rotulo="SPED"
          importacoes={cliente.spedImportacoes.map((imp) => ({
            key: `sped-${imp.id}`,
            nome: imp.nomeArquivo,
            quando: imp.importadoEm,
            detalhes: [
              `${imp.registrosE110} apuração(ões)`,
              imp.cnpjArquivo ? `CNPJ ${imp.cnpjArquivo}` : null,
              imp.uf,
            ].filter(Boolean) as string[],
            sucesso: imp.sucesso,
            mensagem: imp.mensagem,
          }))}
        />
      </section>

      {usaSiagri && (
        <section className="card mt-6 p-5">
          <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="mb-1 text-sm font-bold uppercase tracking-wide text-slate-500">
                Apuração Siagri (sistema da empresa) {ano} — {siagriAno.length}
              </h2>
              <p className="text-xs text-slate-400">
                Livro Registro de Apuração do ICMS (RAICMS, modelo P9) gerado no Siagri. Compras e
                vendas = valor contábil de todas as entradas e saídas do livro (o SPED soma só as
                notas do C100).
              </p>
            </div>
            <UploadRaicmsSiagri clienteId={id} />
          </div>
          {siagriAno.length === 0 ? (
            <p className="text-sm text-slate-500">Nenhum RAICMS do Siagri de {ano} importado.</p>
          ) : (
            <div className="overflow-x-auto">
              <TabelaApuracoes
                linhas={siagriAno.map((a) => ({
                  key: a.id,
                  competencia: a.periodoApuracao,
                  revisao: null,
                  totalCompras: Number(a.entradasValorContabil),
                  totalVendas: Number(a.saidasValorContabil),
                  creditoEntradas: Number(a.creditoEntradas),
                  debitoSaidas: Number(a.debitoSaidas),
                  saldoCredorAnterior: Number(a.saldoCredorAnterior),
                  deducoes: Number(a.deducoes),
                  icmsARecolher: Number(a.icmsARecolher),
                }))}
              />
              {siagriAno.some((a) => Array.isArray(a.alertas) && a.alertas.length > 0) && (
                <ul className="mt-2 space-y-0.5 text-xs text-amber-800">
                  {siagriAno.flatMap((a) =>
                    (Array.isArray(a.alertas) ? (a.alertas as string[]) : []).map((t) => (
                      <li key={`${a.id}-${t}`}>⚠ {fmtMesAno.format(a.periodoApuracao)}: {t}</li>
                    )),
                  )}
                </ul>
              )}
            </div>
          )}
        </section>
      )}

      {!entregaGiam ? (
        <div className="mt-6 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
          {estab.rotulo} fica em <strong>{estab.uf}</strong>: não entrega GIAM, que é declaração
          da SEFAZ-TO. O confronto deste estabelecimento é só o SPED-Fiscal.
        </div>
      ) : (
      <>
      <section className="card mt-6 p-5">
        <h2 className="mb-1 text-sm font-bold uppercase tracking-wide text-slate-500">
          Apurações GIAM (arquivo do Domínio) {ano} — {giamAno.length}
        </h2>
        <p className="mb-4 text-xs text-slate-400">
          Declarado à SEFAZ-TO conforme o <strong>arquivo atualmente salvo no Domínio</strong>. Não
          é a GIAM que a SEFAZ recepcionou — pra isso, use o botão <b>&quot;Buscar no portal
          SEFAZ&quot;</b> (Etapa 2 — raspagem via robô Playwright).
        </p>
        {giamAno.length === 0 ? (
          <p className="text-sm text-slate-500">
            Nenhuma GIAM de {ano}. Clique em &quot;Buscar novas GIAMs na pasta&quot; acima.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <TabelaApuracoes
              linhas={giamAno.map((a) => ({
                key: a.id,
                competencia: a.periodoApuracao,
                revisao: a.retificacao,
                totalCompras: Number(a.totalCompras),
                totalVendas: Number(a.totalVendas),
                creditoEntradas: Number(a.creditoEntradas),
                debitoSaidas: Number(a.debitoSaidas),
                saldoCredorAnterior: Number(a.saldoCredorAnterior),
                deducoes: Number(a.deducoes),
                // Só o tipo N é comparável com o E110 do SPED — ver [[giam-dominio-x-sefaz]].
                icmsARecolher: a.icmsARecolher
                  .filter((l) => l.tipo === "N")
                  .reduce((s, l) => s + Number(l.valor), 0),
              }))}
            />
          </div>
        )}
        <AccordionImportacoes
          tipo="giam-dominio"
          rotulo="GIAM (Domínio)"
          importacoes={cliente.giamImportacoes.map((imp) => ({
            key: `giam-${imp.id}`,
            nome: imp.nomeArquivo,
            quando: imp.importadoEm,
            detalhes: [
              imp.periodoArquivo,
              imp.retificacaoArquivo ? `R${imp.retificacaoArquivo}` : null,
              imp.ieArquivo ? `IE ${imp.ieArquivo}` : null,
            ].filter(Boolean) as string[],
            sucesso: imp.sucesso,
            mensagem: imp.mensagem,
          }))}
        />
      </section>

      <section className="card mt-6 p-5">
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="mb-1 text-sm font-bold uppercase tracking-wide text-slate-500">
              Apurações GIAM (portal SEFAZ) {ano} — {giamSefazAno.length}
            </h2>
            <p className="text-xs text-slate-400">
              O que a SEFAZ-TO efetivamente recepcionou — lido do portal{" "}
              <span className="font-mono text-xs">giam.sefaz.to.gov.br</span> pelo robô.
            </p>
          </div>
          <BuscarNoPortalSefazButton clienteId={id} estabelecimentoId={estab.id} ano={ano} />
        </div>
        {giamSefazAno.length === 0 ? (
          <p className="text-sm text-slate-500">
            Nenhuma apuração de {ano}. Clique em &quot;Buscar no portal SEFAZ&quot; para sincronizar
            (precisa da IE + senha SEFAZ cadastrada na ficha do cliente).
          </p>
        ) : (
          <div className="overflow-x-auto">
            <TabelaApuracoes
              linhas={giamSefazAno.map((a) => ({
                key: a.id,
                competencia: a.periodoApuracao,
                revisao: a.retificacao,
                totalCompras: Number(a.totalCompras),
                totalVendas: Number(a.totalVendas),
                creditoEntradas: Number(a.creditoEntradas),
                debitoSaidas: Number(a.debitoSaidas),
                saldoCredorAnterior: Number(a.saldoCredorAnterior),
                deducoes: Number(a.deducoes),
                icmsARecolher: Number(a.icmsARecolherNormal),
              }))}
            />
          </div>
        )}
        <AccordionImportacoes
          tipo="giam-sefaz"
          rotulo="Sincronizações SEFAZ"
          importacoes={cliente.giamSefazSincronizacoes.map((s) => ({
            key: `sync-${s.id}`,
            nome: `Ano ${s.ano} · meses ${String(s.mesInicial).padStart(2, "0")}–${String(s.mesFinal).padStart(2, "0")}`,
            quando: s.executadoEm,
            detalhes: [
              `${s.competenciasImportadas} nova(s)`,
              s.competenciasSubstituidas > 0 ? `${s.competenciasSubstituidas} substituída(s)` : null,
            ].filter(Boolean) as string[],
            sucesso: s.sucesso,
            mensagem: s.mensagem,
          }))}
        />
      </section>
      </>
      )}
      </div>

      <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-xs leading-relaxed text-slate-600">
        As três tabelas usam <strong>as mesmas colunas</strong>: linhas do mesmo mês devem bater
        nas três. Divergência entre SPED e GIAM (arquivo do Domínio) indica que Receita Federal e
        SEFAZ receberam declarações diferentes; divergência entre &quot;GIAM (arquivo do
        Domínio)&quot; e &quot;GIAM (portal SEFAZ)&quot; indica alteração feita no Domínio depois
        da transmissão. <em>ICMS a Recolher</em> na GIAM = apenas o tipo &quot;N&quot; do Segmento
        E (Normal) — difal e ST não têm equivalente no E110 do SPED e ficariam com falso alarme.
      </div>

    </div>
  );
}

/**
 * Uma linha de apuração no formato canônico do confronto. As colunas são as
 * mesmas para SPED, GIAM Domínio e (futuramente) GIAM SEFAZ — comparar linha a
 * linha só funciona se o formato bater.
 */
type LinhaApuracao = {
  key: string;
  competencia: Date;
  revisao: string | null; // R00, R01... só a GIAM tem
  totalCompras: number;
  totalVendas: number;
  creditoEntradas: number;
  debitoSaidas: number;
  saldoCredorAnterior: number;
  deducoes: number;
  icmsARecolher: number;
};

function TabelaApuracoes({ linhas }: { linhas: LinhaApuracao[] }) {
  return (
    <table className="w-full text-sm">
      <thead className="border-b border-slate-200 text-left text-xs uppercase text-slate-500">
        <tr>
          <th className="pb-2 pr-3">Competência</th>
          <th className="pb-2 pr-3">Rev.</th>
          <th className="pb-2 pr-3 text-right">Total compras</th>
          <th className="pb-2 pr-3 text-right">Total vendas</th>
          <th className="pb-2 pr-3 text-right">Crédito entradas</th>
          <th className="pb-2 pr-3 text-right">Débito saídas</th>
          <th className="pb-2 pr-3 text-right">Sld. credor ant.</th>
          <th className="pb-2 pr-3 text-right">Deduções</th>
          <th className="pb-2 pr-3 text-right">ICMS a recolher</th>
        </tr>
      </thead>
      <tbody>
        {linhas.map((l) => (
          <tr key={l.key} className="border-b border-slate-100">
            <td className="py-2 pr-3 font-medium text-slate-700">
              {fmtMesAno.format(l.competencia)}
            </td>
            <td className="py-2 pr-3 text-xs text-slate-500">
              {l.revisao ? `R${l.revisao}` : "—"}
            </td>
            <Val v={l.totalCompras} />
            <Val v={l.totalVendas} />
            <Val v={l.creditoEntradas} />
            <Val v={l.debitoSaidas} />
            <Val v={l.saldoCredorAnterior} dim />
            <Val v={l.deducoes} dim />
            <td className="py-2 pr-3 text-right font-semibold text-slate-800">
              {fmtBrl.format(l.icmsARecolher)}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/**
 * Accordion de importações — mostra o histórico daquela fonte (SPED, GIAM
 * Domínio, GIAM SEFAZ) embaixo da sua tabela. Fechado por padrão pra não
 * poluir a leitura. Usa <details> HTML nativo — sem estado no servidor.
 */
type LinhaImportacao = {
  key: string;
  nome: string;
  quando: Date;
  detalhes: string[];
  sucesso: boolean;
  mensagem: string | null;
};

function AccordionImportacoes({
  tipo,
  rotulo,
  importacoes,
}: {
  tipo: "sped" | "giam-dominio" | "giam-sefaz";
  rotulo: string;
  importacoes: LinhaImportacao[];
}) {
  const badgeCls =
    tipo === "sped"
      ? "bg-slate-100 text-slate-600"
      : tipo === "giam-dominio"
        ? "bg-indigo-100 text-indigo-700"
        : "bg-amber-100 text-amber-800";
  return (
    <details className="mt-4 rounded-lg border border-slate-200 bg-slate-50">
      <summary className="cursor-pointer select-none px-4 py-2 text-xs font-semibold uppercase tracking-wide text-slate-600 hover:bg-slate-100">
        Últimas importações {rotulo} — {importacoes.length}
      </summary>
      <div className="space-y-2 px-4 pb-4 pt-2 text-sm">
        {importacoes.length === 0 ? (
          <p className="text-xs text-slate-400">
            Nenhuma importação ainda.
          </p>
        ) : (
          importacoes.map((imp) => (
            <div
              key={imp.key}
              className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-100 bg-white px-3 py-2"
            >
              <div>
                <p className="font-medium text-slate-700">
                  <span className={`mr-2 rounded px-1.5 py-0.5 text-[10px] uppercase ${badgeCls}`}>
                    {rotulo}
                  </span>
                  {imp.nome}
                </p>
                <p className="text-xs text-slate-500">
                  {fmtDataHora.format(imp.quando)}
                  {imp.detalhes.length > 0 && ` · ${imp.detalhes.join(" · ")}`}
                </p>
              </div>
              <span
                className={
                  "rounded-full px-2 py-0.5 text-xs " +
                  (imp.sucesso ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700")
                }
              >
                {imp.sucesso ? imp.mensagem ?? "importado" : "erro"}
              </span>
            </div>
          ))
        )}
      </div>
    </details>
  );
}

/**
 * Seletor de estabelecimento (só aparece quando o cadastro tem filiais). A
 * EFD ICMS/IPI e a GIAM são por inscrição estadual — cada estabelecimento tem
 * as suas, e nunca se somam na tela.
 */
function SeletorEstabelecimento({
  hrefBase,
  estabelecimentos,
  atual,
}: {
  hrefBase: string;
  estabelecimentos: EstabelecimentoInfo[];
  atual: EstabelecimentoInfo;
}) {
  const fmtCnpj = (d: string) => d.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5");
  return (
    <div className="mb-4 rounded-lg border border-slate-200 bg-white p-3">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <span className="text-sm text-slate-600">Estabelecimento:</span>
        {estabelecimentos.map((e) => (
          <Link
            key={e.id}
            href={`${hrefBase}&estab=${e.id}`}
            className={`btn text-sm ${e.id === atual.id ? "btn-primary" : "btn-ghost"}`}
          >
            {e.rotulo}
            {e.uf ? ` · ${e.uf}` : ""}
          </Link>
        ))}
      </div>
      <p className="text-xs text-slate-500">
        {atual.rotulo} · CNPJ {fmtCnpj(atual.cnpj)}
        {atual.inscricaoEstadual ? ` · IE ${atual.inscricaoEstadual}` : ""}
        {atual.uf ? ` · ${atual.uf}` : ""}
      </p>
    </div>
  );
}

/** Ano padrão: a competência mais recente que o cliente já tem em SPED ou GIAM
 *  Domínio; se não tiver nada, o ano atual. */
function anoDefault(cliente: {
  spedApuracoes: { periodoApuracao: Date }[];
  giamApuracoes: { periodoApuracao: Date }[];
}): number {
  const datas = [...cliente.spedApuracoes, ...cliente.giamApuracoes].map((a) => a.periodoApuracao);
  if (datas.length === 0) return new Date().getFullYear();
  const maisRecente = datas.reduce((a, b) => (a > b ? a : b));
  return maisRecente.getUTCFullYear();
}

function Val({ v, dim = false }: { v: number; dim?: boolean }) {
  return (
    <td
      className={
        "py-2 pr-3 text-right " + (dim ? "text-slate-400" : "text-slate-700")
      }
    >
      {v > 0 ? fmtBrl.format(v) : "—"}
    </td>
  );
}
