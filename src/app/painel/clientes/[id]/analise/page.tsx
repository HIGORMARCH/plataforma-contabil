import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePapel, PAPEIS_INTERNOS } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { carregarExercicios } from "@/lib/service";
import { analisar } from "@/lib/accounting/analyze";
import {
  ResumoSituacao,
  IndicadoresGrid,
  Cruzamento,
  ListaInconsistencias,
} from "@/components/Analise";
import { gerarRelatorioAction } from "../actions";

export default async function AnalisePage({ params }: { params: Promise<{ id: string }> }) {
  const sessao = await requirePapel(PAPEIS_INTERNOS);
  const { id } = await params;
  const cliente = await prisma.cliente.findFirst({
    where: { id, escritorioId: sessao.escritorioId },
  });
  if (!cliente) notFound();

  const exercicios = await carregarExercicios(id);
  if (exercicios.length === 0) {
    return (
      <div className="card p-8 text-center text-slate-500">
        Nenhum demonstrativo cadastrado para análise.{" "}
        <Link href={`/painel/clientes/${id}/exercicios`} className="text-[var(--brand)] underline">
          Adicionar demonstrativos
        </Link>
      </div>
    );
  }
  const analise = analisar(exercicios);
  const inconsistencias = [
    ...analise.exercicios.flatMap((e) => e.inconsistencias),
    ...analise.inconsistenciasVariacao,
  ];

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link href={`/painel/clientes/${id}`} className="text-sm text-slate-500 hover:underline">
            ← {cliente.razaoSocial}
          </Link>
          <h1 className="mt-1 text-2xl font-bold text-slate-800">Análise Financeira e Contábil</h1>
          <p className="text-sm text-slate-500">Período: {analise.cruzamento.anos.join(", ")}</p>
        </div>
        <form action={gerarRelatorioAction.bind(null, id)}>
          <button className="btn btn-primary">Gerar relatório técnico</button>
        </form>
      </div>

      <ResumoSituacao analise={analise} />

      <section>
        <h2 className="mb-3 text-lg font-bold text-slate-800">Validações contábeis</h2>
        <ListaInconsistencias itens={inconsistencias} />
      </section>

      <section>
        <h2 className="mb-3 text-lg font-bold text-slate-800">
          Indicadores — exercício {analise.cruzamento.anos[analise.cruzamento.anos.length - 1]}
        </h2>
        <IndicadoresGrid indicadores={analise.indicadoresRecentes} />
      </section>

      <section>
        <h2 className="mb-3 text-lg font-bold text-slate-800">Cruzamento ano a ano</h2>
        <Cruzamento analise={analise} />
      </section>
    </div>
  );
}
