import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePapel, PAPEIS_INTERNOS } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { parseExercicio } from "@/lib/service";
import {
  CAMPOS_BALANCO,
  CAMPOS_DRE,
  achatarExercicio,
  type DefCampo,
} from "@/lib/import";
import type { Maybe } from "@/lib/accounting/types";
import { ExtrairPDF } from "@/components/ExtrairPDF";
import { salvarExercicioManualAction, importarExercicioAction } from "../actions";

function agrupar(campos: DefCampo[]) {
  const grupos = new Map<string, DefCampo[]>();
  for (const c of campos) {
    if (!grupos.has(c.grupo)) grupos.set(c.grupo, []);
    grupos.get(c.grupo)!.push(c);
  }
  return [...grupos.entries()];
}

function CampoNumero({ def, valor }: { def: DefCampo; valor: Maybe }) {
  return (
    <div>
      <label className="label" htmlFor={def.chave}>{def.rotulo}</label>
      <input
        id={def.chave}
        name={def.chave}
        type="text"
        inputMode="decimal"
        className="input tabular-nums"
        defaultValue={valor ?? ""}
        placeholder="0,00"
      />
    </div>
  );
}

export default async function ExerciciosPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ ano?: string; erro?: string }>;
}) {
  const sessao = await requirePapel(PAPEIS_INTERNOS);
  const { id } = await params;
  const { ano: anoQ, erro } = await searchParams;

  const cliente = await prisma.cliente.findFirst({
    where: { id, escritorioId: sessao.escritorioId },
  });
  if (!cliente) notFound();

  const anoEditar = anoQ ? Number(anoQ) : null;
  let valores: Record<string, Maybe> = {};
  let documentos = "";
  if (anoEditar) {
    const reg = await prisma.exercicio.findUnique({
      where: { clienteId_ano: { clienteId: id, ano: anoEditar } },
    });
    if (reg) {
      valores = achatarExercicio(parseExercicio(reg.dadosJson));
      documentos = reg.documentos ? (JSON.parse(reg.documentos) as string[]).join(", ") : "";
    }
  }

  return (
    <div>
      <div className="mb-6">
        <Link href={`/painel/clientes/${id}`} className="text-sm text-slate-500 hover:underline">
          ← Voltar para {cliente.razaoSocial}
        </Link>
        <h1 className="mt-1 text-2xl font-bold text-slate-800">
          {anoEditar ? `Editar exercício ${anoEditar}` : "Adicionar demonstrativos"}
        </h1>
        <p className="text-sm text-slate-500">
          Informe os saldos do Balanço Patrimonial e da DRE. Valores em módulo (positivos); prejuízos
          acumulados informe como positivo.
        </p>
      </div>

      {erro && (
        <div className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {erro === "arquivo" && "Selecione um arquivo e informe o ano."}
          {erro === "leitura" && "Não foi possível ler o arquivo. Verifique o formato (chave;valor)."}
          {erro === "ano" && "Informe um ano válido."}
        </div>
      )}

      {/* Extração automática de PDF */}
      <ExtrairPDF />

      {/* Importação por planilha */}
      <section className="card mb-6 p-5">
        <h2 className="mb-1 text-sm font-bold uppercase tracking-wide text-slate-500">
          Importar planilha (CSV / Excel)
        </h2>
        <p className="mb-3 text-xs text-slate-500">
          Formato: duas colunas <code className="rounded bg-slate-100 px-1">chave;valor</code>. Baixe o{" "}
          <a href="/api/modelo-csv" className="text-[var(--brand)] underline">modelo de importação</a>.
        </p>
        <form action={importarExercicioAction.bind(null, id)} className="flex flex-wrap items-end gap-3">
          <div>
            <label className="label">Ano</label>
            <input name="ano" type="number" className="input w-28" defaultValue={anoEditar ?? ""} placeholder="2024" />
          </div>
          <div className="flex-1">
            <label className="label">Arquivo</label>
            <input name="arquivo" type="file" accept=".csv,.xls,.xlsx" className="input" />
          </div>
          <button className="btn btn-accent">Importar</button>
        </form>
      </section>

      {/* Lançamento manual */}
      <form action={salvarExercicioManualAction.bind(null, id)} className="space-y-6">
        <section className="card p-5">
          <div className="mb-4 flex flex-wrap items-end gap-4">
            <div>
              <label className="label">Ano do exercício *</label>
              <input
                name="ano"
                type="number"
                className="input w-32"
                defaultValue={anoEditar ?? ""}
                placeholder="2024"
                required
              />
            </div>
            <div className="flex-1">
              <label className="label">Documentos analisados (separados por vírgula)</label>
              <input
                name="documentos"
                className="input"
                defaultValue={documentos}
                placeholder="Balanço 2024, DRE 2024, Balancete 12/2024"
              />
            </div>
          </div>
        </section>

        <div className="grid gap-6 lg:grid-cols-2">
          <section className="card p-5">
            <h2 className="mb-4 text-sm font-bold uppercase tracking-wide text-slate-500">
              Balanço Patrimonial
            </h2>
            <div className="space-y-5">
              {agrupar(CAMPOS_BALANCO).map(([grupo, campos]) => (
                <div key={grupo}>
                  <h3 className="mb-2 text-xs font-bold text-slate-600">{grupo}</h3>
                  <div className="grid gap-3 sm:grid-cols-2">
                    {campos.map((c) => (
                      <CampoNumero key={c.chave} def={c} valor={valores[c.chave] ?? null} />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="card p-5">
            <h2 className="mb-4 text-sm font-bold uppercase tracking-wide text-slate-500">
              Demonstração do Resultado (DRE)
            </h2>
            <div className="grid gap-3 sm:grid-cols-2">
              {CAMPOS_DRE.map((c) => (
                <CampoNumero key={c.chave} def={c} valor={valores[c.chave] ?? null} />
              ))}
            </div>
          </section>
        </div>

        <div className="flex justify-end gap-3">
          <Link href={`/painel/clientes/${id}`} className="btn btn-ghost">Cancelar</Link>
          <button type="submit" className="btn btn-primary">Salvar exercício</button>
        </div>
      </form>
    </div>
  );
}
