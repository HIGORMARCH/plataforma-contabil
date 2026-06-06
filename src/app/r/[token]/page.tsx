import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { registrarAcesso } from "@/lib/rastreio";
import type { ResultadoAnalise } from "@/lib/accounting/analyze";
import type { RelatorioTexto } from "@/lib/accounting/narrative";
import { IndicadoresGrid } from "@/components/Analise";

export const dynamic = "force-dynamic";

interface Conteudo {
  geradoEm: string;
  analise: ResultadoAnalise;
  texto: RelatorioTexto;
}

function Secao({ titulo, paragrafos }: { titulo: string; paragrafos: string[] }) {
  return (
    <section className="mb-6">
      <h2
        className="mb-2 pb-1 text-lg font-bold"
        style={{ color: "var(--marca)", borderBottom: "1.5px solid var(--marca-2)" }}
      >
        {titulo}
      </h2>
      <div className="space-y-2 text-sm leading-relaxed text-slate-700">
        {paragrafos.map((p, i) => (
          <p key={i}>{p}</p>
        ))}
      </div>
    </section>
  );
}

export default async function RelatorioPublico({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const r = await prisma.relatorio.findUnique({
    where: { shareToken: token },
    include: { cliente: true },
  });
  if (!r || r.status !== "LIBERADO") notFound();

  // RASTREIO: registra a abertura deste link (por quem abriu — pessoa ou encaminhado).
  await registrarAcesso(r.id, "ABERTURA");

  const escritorio = await prisma.escritorio.findUnique({ where: { id: r.cliente.escritorioId } });
  const conteudo = JSON.parse(r.conteudoJson) as Conteudo;
  const { texto, analise } = conteudo;
  const marca = escritorio?.corPrimaria || "#4d4b40";
  const marca2 = escritorio?.corSecundaria || "#d2bd97";

  return (
    <div
      className="min-h-screen bg-slate-100 py-8"
      style={{ ["--marca" as string]: marca, ["--marca-2" as string]: marca2 }}
    >
      <div className="mx-auto max-w-3xl px-4">
        <div className="overflow-hidden rounded-xl bg-white shadow">
          {/* Cabeçalho / papel timbrado */}
          <div className="flex flex-col items-start px-8 pt-6 pb-4" style={{ borderBottom: `2px solid ${marca2}` }}>
            {escritorio?.logoDataUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={escritorio.logoDataUrl} alt={escritorio.nomeFantasia ?? "Logo"} className="h-14 object-contain" />
            ) : (
              <p className="text-xl font-bold" style={{ color: marca }}>
                {escritorio?.nomeFantasia ?? escritorio?.razaoSocial}
              </p>
            )}
            <p className="mt-1 text-xs font-semibold" style={{ color: marca }}>
              {[escritorio?.cnpj ? `CNPJ ${escritorio.cnpj}` : null, escritorio?.crc].filter(Boolean).join("   •   ")}
            </p>
          </div>

          <div className="px-8 py-6">
            <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
              <div>
                <h1 className="text-2xl font-bold" style={{ color: marca }}>{r.titulo}</h1>
                <p className="text-sm text-slate-500">
                  {r.cliente.razaoSocial} — Período {r.periodo}
                </p>
              </div>
              <a
                href={`/r/${token}/pdf`}
                className="rounded-lg px-4 py-2 text-sm font-semibold text-white"
                style={{ background: marca }}
              >
                Baixar PDF
              </a>
            </div>

            <Secao titulo="Resumo executivo" paragrafos={texto.resumoExecutivo} />
            <Secao titulo="Análise do Balanço Patrimonial" paragrafos={texto.analiseBalanco} />
            <Secao titulo="Análise da DRE" paragrafos={texto.analiseResultado} />

            <section className="mb-6">
              <h2 className="mb-3 pb-1 text-lg font-bold" style={{ color: marca, borderBottom: `1.5px solid ${marca2}` }}>
                Indicadores financeiros
              </h2>
              <IndicadoresGrid indicadores={analise.indicadoresRecentes} />
            </section>

            <Secao titulo="Pontos de atenção" paragrafos={texto.pontosAtencao} />
            <Secao titulo="Recomendações técnicas" paragrafos={texto.recomendacoes} />
            <Secao titulo="Conclusão" paragrafos={texto.conclusao} />

            {r.comentarioContador && (
              <section className="mb-6 rounded-lg bg-slate-50 p-4">
                <h3 className="mb-1 text-sm font-bold text-slate-700">Observações do contador</h3>
                <p className="text-sm text-slate-700">{r.comentarioContador}</p>
              </section>
            )}

            <section className="mt-6 border-t border-slate-200 pt-4 text-xs text-slate-500">
              <p className="font-semibold text-slate-600">Limitação de escopo e responsabilidade técnica</p>
              <p className="mt-1">{texto.limitacaoEscopo}</p>
            </section>
          </div>
        </div>
        <p className="mt-3 text-center text-[11px] text-slate-400">
          Documento gerado por {escritorio?.nomeFantasia ?? "March Contabilidade"}. Acesso registrado para fins de rastreabilidade.
        </p>
      </div>
    </div>
  );
}
