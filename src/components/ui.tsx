import type { Classificacao } from "@/lib/accounting/types";
import { ROTULO_CLASSIFICACAO } from "@/lib/accounting/analyze";

export function Badge({ classe }: { classe: Classificacao }) {
  return <span className={`badge badge-${classe}`}>{ROTULO_CLASSIFICACAO[classe]}</span>;
}

const ROTULO_STATUS: Record<string, { texto: string; cor: string }> = {
  EM_ANALISE: { texto: "Em análise", cor: "bg-slate-100 text-slate-700" },
  AGUARDANDO_REVISAO: { texto: "Aguardando revisão", cor: "bg-amber-100 text-amber-800" },
  APROVADO: { texto: "Aprovado", cor: "bg-blue-100 text-blue-800" },
  LIBERADO: { texto: "Liberado ao cliente", cor: "bg-green-100 text-green-800" },
};

export function StatusBadge({ status }: { status: string }) {
  const s = ROTULO_STATUS[status] ?? { texto: status, cor: "bg-slate-100 text-slate-700" };
  return (
    <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${s.cor}`}>
      {s.texto}
    </span>
  );
}

export function Card({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <div className={`card p-5 ${className}`}>{children}</div>;
}

export function StatCard({
  rotulo,
  valor,
  detalhe,
  cor = "text-slate-800",
}: {
  rotulo: string;
  valor: string | number;
  detalhe?: string;
  cor?: string;
}) {
  return (
    <div className="card p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{rotulo}</p>
      <p className={`mt-1 text-2xl font-bold ${cor}`}>{valor}</p>
      {detalhe && <p className="mt-0.5 text-xs text-slate-500">{detalhe}</p>}
    </div>
  );
}

export function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h2 className="mb-3 text-lg font-bold text-slate-800">{children}</h2>;
}
