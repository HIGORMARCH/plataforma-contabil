import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePapel, PAPEIS_INTERNOS } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { UploadSpedForm } from "./_components/UploadSpedForm";
import { VarrerPastaButton } from "./_components/VarrerPastaButton";
import { VarrerPastaGiamButton } from "./_components/VarrerPastaGiamButton";
import { BuscarNoPortalSefazButton } from "./_components/BuscarNoPortalSefazButton";

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

export default async function SpedCliente({ params }: { params: Promise<{ id: string }> }) {
  const sessao = await requirePapel(PAPEIS_INTERNOS);
  const { id } = await params;

  const cliente = await prisma.cliente.findFirst({
    where: { id, escritorioId: sessao.escritorioId },
    include: {
      spedApuracoes: { orderBy: { periodoApuracao: "desc" } },
      spedImportacoes: { orderBy: { importadoEm: "desc" }, take: 10 },
      giamApuracoes: {
        orderBy: [{ periodoApuracao: "desc" }, { retificacao: "desc" }],
        include: { icmsARecolher: true },
      },
      giamImportacoes: { orderBy: { importadoEm: "desc" }, take: 10 },
      giamSefazApuracoes: {
        orderBy: [{ periodoApuracao: "desc" }, { retificacao: "desc" }],
      },
      giamSefazSincronizacoes: {
        orderBy: { executadoEm: "desc" },
        take: 10,
      },
    },
  });
  if (!cliente) notFound();

  return (
    <div>
      <div className="mb-6">
        <Link href={`/painel/clientes/${id}`} className="text-sm text-slate-500 hover:underline">
          ← Voltar para {cliente.nomeFantasia || cliente.razaoSocial}
        </Link>
        <h1 className="mt-1 text-2xl font-bold text-slate-800">
          Auditoria ICMS — SPED-Fiscal + GIAM
        </h1>
        <p className="text-sm text-slate-500">
          Apuração declarada à Receita Federal (SPED) e à SEFAZ-TO (GIAM). Ambas devem bater —
          divergência entre elas indica que declararam valores diferentes aos dois fiscos.
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <VarrerPastaButton clienteId={id} pastaFiscal={cliente.pastaFiscal} />
        <UploadSpedForm clienteId={id} />
      </div>

      <div className="mt-6">
        <VarrerPastaGiamButton
          clienteId={id}
          pastaGiam={cliente.pastaGiam}
          pastaFiscal={cliente.pastaFiscal}
        />
      </div>

      {/*
        Colunas CANÔNICAS do confronto (idênticas nas 3 tabelas — a
        divergência precisa saltar aos olhos). Ordem e nomes iguais em
        SPED, GIAM Domínio e GIAM SEFAZ.

        ICMS a Recolher = só tipo "N" do Segmento E da GIAM, que é o único
        comparável com o VL_ICMS_RECOLHER do E110 do SPED. Somar difal/ST
        acusa divergência em todo mês que tiver difal — falso alarme.

        Cada tabela leva embaixo um <details> com o histórico de importações
        daquela fonte — fechado por padrão pra não poluir a leitura.
      */}
      <section className="card mt-6 p-5">
        <h2 className="mb-1 text-sm font-bold uppercase tracking-wide text-slate-500">
          Apurações SPED-Fiscal — {cliente.spedApuracoes.length}
        </h2>
        <p className="mb-4 text-xs text-slate-400">
          Declarado à Receita Federal (registro E110 + soma dos C100 regulares).
        </p>
        {cliente.spedApuracoes.length === 0 ? (
          <p className="text-sm text-slate-500">
            Nenhuma apuração ainda. Faça upload de um arquivo SPED-Fiscal (.txt) acima.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <TabelaApuracoes
              linhas={cliente.spedApuracoes.map((a) => ({
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

      <section className="card mt-6 p-5">
        <h2 className="mb-1 text-sm font-bold uppercase tracking-wide text-slate-500">
          Apurações GIAM (arquivo do Domínio) — {cliente.giamApuracoes.length}
        </h2>
        <p className="mb-4 text-xs text-slate-400">
          Declarado à SEFAZ-TO conforme o <strong>arquivo atualmente salvo no Domínio</strong>. Não
          é a GIAM que a SEFAZ recepcionou — pra isso é preciso raspar o portal (Etapa 2, pendente).
        </p>
        {cliente.giamApuracoes.length === 0 ? (
          <p className="text-sm text-slate-500">
            Nenhuma GIAM ainda. Clique em &quot;Buscar novas GIAMs na pasta&quot; acima.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <TabelaApuracoes
              linhas={cliente.giamApuracoes.map((a) => ({
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
              Apurações GIAM (portal SEFAZ) — {cliente.giamSefazApuracoes.length}
            </h2>
            <p className="text-xs text-slate-400">
              O que a SEFAZ-TO efetivamente recepcionou — lido do portal{" "}
              <span className="font-mono text-xs">giam.sefaz.to.gov.br</span> pelo robô.
            </p>
          </div>
          <BuscarNoPortalSefazButton clienteId={id} ano={anoDefault(cliente)} />
        </div>
        {cliente.giamSefazApuracoes.length === 0 ? (
          <p className="text-sm text-slate-500">
            Nenhuma apuração ainda. Clique em &quot;Buscar no portal SEFAZ&quot; para sincronizar
            (precisa da IE + senha SEFAZ cadastrada na ficha do cliente).
          </p>
        ) : (
          <div className="overflow-x-auto">
            <TabelaApuracoes
              linhas={cliente.giamSefazApuracoes.map((a) => ({
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

/** Ano padrão do input: usa a competência mais recente que o cliente já tem em
 *  SPED ou GIAM Domínio; se não tiver nada, usa o ano atual. */
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
