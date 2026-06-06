import type { ResultadoAnalise } from "@/lib/accounting/analyze";
import { ROTULO_SITUACAO } from "@/lib/accounting/analyze";
import type { Indicador, Inconsistencia, Maybe } from "@/lib/accounting/types";
import type { LinhaEvolucao } from "@/lib/accounting/comparison";
import { indice, moeda, percentual } from "@/lib/accounting/format";
import { Badge } from "./ui";

const CAT_ROTULO: Record<Indicador["categoria"], string> = {
  liquidez: "Liquidez",
  endividamento: "Endividamento e Estrutura",
  rentabilidade: "Rentabilidade",
  atividade: "Atividade e Capital de Giro",
  estrutura: "Estrutura",
};

const SITUACAO_CLASSE: Record<string, string> = {
  favoravel: "bg-green-50 border-green-200 text-green-800",
  regular_com_atencao: "bg-amber-50 border-amber-200 text-amber-800",
  critica: "bg-red-50 border-red-200 text-red-800",
  inconclusiva: "bg-slate-50 border-slate-200 text-slate-700",
};

export function ResumoSituacao({ analise }: { analise: ResultadoAnalise }) {
  return (
    <div className={`rounded-xl border p-4 ${SITUACAO_CLASSE[analise.situacao]}`}>
      <p className="text-xs font-semibold uppercase tracking-wide opacity-70">Situação geral</p>
      <p className="text-lg font-bold">{ROTULO_SITUACAO[analise.situacao]}</p>
      <div className="mt-2 flex gap-4 text-xs">
        <span>✅ {analise.resumo.saudavel} saudáveis</span>
        <span>⚠ {analise.resumo.atencao} em atenção</span>
        <span>⛔ {analise.resumo.critico} críticos</span>
        <span>• {analise.resumo.inconclusivo} inconclusivos</span>
      </div>
      {analise.bloqueado && (
        <p className="mt-2 rounded-lg bg-white/60 px-3 py-2 text-xs font-medium">
          ⛔ Há inconsistências relevantes nos dados. A emissão da conclusão está bloqueada até a revisão
          do contador responsável.
        </p>
      )}
    </div>
  );
}

export function IndicadoresGrid({ indicadores }: { indicadores: Indicador[] }) {
  const categorias = Array.from(new Set(indicadores.map((i) => i.categoria)));
  return (
    <div className="space-y-6">
      {categorias.map((cat) => (
        <div key={cat}>
          <h3 className="mb-2 text-sm font-bold text-slate-700">{CAT_ROTULO[cat]}</h3>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {indicadores
              .filter((i) => i.categoria === cat)
              .map((i) => (
                <div key={i.chave} className="card p-4">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm font-semibold text-slate-700">{i.nome}</p>
                    <Badge classe={i.classificacao} />
                  </div>
                  <p className="mt-1 text-2xl font-bold text-slate-900">{i.valorFormatado}</p>
                  <p className="mt-0.5 text-[11px] text-slate-400">{i.formula}</p>
                  <p className="mt-2 text-xs text-slate-600">{i.interpretacao}</p>
                </div>
              ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function formatarLinha(v: Maybe, unidade: LinhaEvolucao["unidade"]) {
  if (unidade === "moeda") return moeda(v);
  if (unidade === "percentual") return percentual(v);
  return indice(v);
}

function TabelaEvolucao({ titulo, anos, linhas }: { titulo: string; anos: number[]; linhas: LinhaEvolucao[] }) {
  return (
    <div className="card overflow-hidden">
      <div className="border-b border-slate-100 bg-slate-50 px-4 py-2 text-sm font-bold text-slate-700">
        {titulo}
      </div>
      <table className="w-full text-sm">
        <thead className="text-left text-xs uppercase tracking-wide text-slate-400">
          <tr>
            <th className="px-4 py-2">Conta / Indicador</th>
            {anos.map((a) => (
              <th key={a} className="px-4 py-2 text-right">{a}</th>
            ))}
            <th className="px-4 py-2 text-right">Variação</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {linhas.map((l) => (
            <tr key={l.rotulo}>
              <td className="px-4 py-2 text-slate-700">{l.rotulo}</td>
              {l.valores.map((v, idx) => (
                <td key={idx} className="px-4 py-2 text-right tabular-nums text-slate-700">
                  {formatarLinha(v, l.unidade)}
                </td>
              ))}
              <td
                className={`px-4 py-2 text-right font-medium tabular-nums ${
                  l.variacaoTotal == null
                    ? "text-slate-400"
                    : l.variacaoTotal >= 0
                      ? "text-green-700"
                      : "text-red-700"
                }`}
              >
                {l.variacaoTotal == null
                  ? "—"
                  : (l.variacaoTotal >= 0 ? "▲ " : "▼ ") + percentual(Math.abs(l.variacaoTotal))}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function Cruzamento({ analise }: { analise: ResultadoAnalise }) {
  const { cruzamento } = analise;
  if (cruzamento.anos.length < 2) {
    return (
      <p className="text-sm text-slate-500">
        O cruzamento ano a ano requer ao menos dois exercícios cadastrados.
      </p>
    );
  }
  return (
    <div className="space-y-4">
      <TabelaEvolucao titulo="Evolução patrimonial" anos={cruzamento.anos} linhas={cruzamento.patrimonial} />
      <TabelaEvolucao titulo="Evolução do resultado" anos={cruzamento.anos} linhas={cruzamento.resultado} />
      <TabelaEvolucao titulo="Evolução dos indicadores-chave" anos={cruzamento.anos} linhas={cruzamento.indicadores} />
    </div>
  );
}

export function ListaInconsistencias({ itens }: { itens: Inconsistencia[] }) {
  if (itens.length === 0) {
    return <p className="text-sm text-slate-500">Nenhuma inconsistência detectada nos dados fornecidos.</p>;
  }
  const cor: Record<string, string> = {
    critico: "border-red-200 bg-red-50 text-red-800",
    atencao: "border-amber-200 bg-amber-50 text-amber-800",
    info: "border-slate-200 bg-slate-50 text-slate-700",
  };
  return (
    <ul className="space-y-2">
      {itens.map((i, idx) => (
        <li key={idx} className={`rounded-lg border p-3 text-sm ${cor[i.severidade]}`}>
          <div className="flex items-center gap-2">
            <span className="font-semibold">{i.titulo}</span>
            {i.bloqueia && (
              <span className="rounded bg-red-600 px-1.5 py-0.5 text-[10px] font-bold text-white">BLOQUEIA</span>
            )}
          </div>
          <p className="mt-0.5 opacity-90">{i.descricao}</p>
        </li>
      ))}
    </ul>
  );
}
