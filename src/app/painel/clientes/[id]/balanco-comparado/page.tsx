/**
 * Balanço Comparado — Sistema × ECD.
 *
 * Foto de POSIÇÃO patrimonial (Ativo/Passivo/PL) apenas. Foca no saldo
 * final de cada conta pra verificar se o balanço fecha entre os dois
 * SPEDs. Não descende no movimento (débito/crédito) — isso é papel do
 * Balancete de Verificação (`/balancete-comparado`).
 */
import path from "node:path";
import { existsSync, readdirSync } from "node:fs";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePapel, PAPEIS_INTERNOS } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { caminhoArquivo, pastaCliente, type ClienteRef } from "@/lib/storage/filesystem";
import { parseSaldosDeArquivo } from "@/lib/ecd/balancete";
import {
  compararBalancetes,
  compararBalancetesHierarquico,
  resumirComparacao,
} from "@/lib/accounting/balanceteComparado";
import { moeda } from "@/lib/accounting/format";
import { UploadSpedsForm } from "../balancete-comparado/_components/UploadSpedsForm";
import { BalanceteHierarquico } from "../balancete-comparado/_components/BalanceteHierarquico";

// Só naturezas patrimoniais (balanço). Resultado (04) fica no Balancete.
const NATUREZAS_BALANCO = {
  "01": "Ativo" as const,
  "02": "Passivo" as const,
  "03": "Patrimônio Líquido" as const,
};

function formatarCnpj(cnpj: string): string {
  const d = cnpj.replace(/\D/g, "");
  if (d.length !== 14) return cnpj;
  return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
}

interface StatusLado {
  presente: boolean;
  ano: number | null;
  caminho: string | null;
}

function detectarAnos(clienteRef: ClienteRef): number[] {
  const anos = new Set<number>();
  for (const t of ["SPED-ECD-DOMINIO", "SPED-ECD"] as const) {
    const raiz = path.join(pastaCliente(clienteRef), t);
    if (!existsSync(raiz)) continue;
    try {
      for (const nome of readdirSync(raiz)) {
        const num = Number(nome);
        if (num >= 2000 && num <= 2100) {
          if (existsSync(caminhoArquivo(clienteRef, t, num, null, "txt"))) {
            anos.add(num);
          }
        }
      }
    } catch {
      /* pasta pode não existir */
    }
  }
  return [...anos].sort((a, b) => b - a);
}

function statusDoLado(
  clienteRef: ClienteRef,
  lado: "SPED-ECD-DOMINIO" | "SPED-ECD",
  ano: number | null,
): StatusLado {
  if (!ano) return { presente: false, ano: null, caminho: null };
  const caminho = caminhoArquivo(clienteRef, lado, ano, null, "txt");
  if (!existsSync(caminho)) return { presente: false, ano, caminho };
  return { presente: true, ano, caminho };
}

export default async function BalancoComparadoPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ ano?: string; incluir?: string }>;
}) {
  const sessao = await requirePapel(PAPEIS_INTERNOS);
  const { id } = await params;
  const { ano: anoQ, incluir } = await searchParams;
  const incluirTodas = incluir === "todas";

  const cliente = await prisma.cliente.findFirst({
    where: { id, escritorioId: sessao.escritorioId },
    select: {
      id: true,
      razaoSocial: true,
      cnpj: true,
      regimeTributario: true,
    },
  });
  if (!cliente) notFound();

  const clienteRef: ClienteRef = {
    razaoSocial: cliente.razaoSocial,
    cnpj: cliente.cnpj,
  };
  const pastaClienteAbs = pastaCliente(clienteRef);
  const anosDisponiveis = detectarAnos(clienteRef);
  const anoSelecionado = anoQ
    ? Number(anoQ)
    : anosDisponiveis[0] ?? new Date().getFullYear();

  const statusDom = statusDoLado(clienteRef, "SPED-ECD-DOMINIO", anoSelecionado);
  const statusTx = statusDoLado(clienteRef, "SPED-ECD", anoSelecionado);

  let hierarquia: ReturnType<typeof compararBalancetesHierarquico> | null = null;
  let resumo: ReturnType<typeof resumirComparacao> | null = null;
  let erro: string | null = null;
  if (statusDom.presente && statusTx.presente && statusDom.caminho && statusTx.caminho) {
    try {
      const dom = parseSaldosDeArquivo(statusDom.caminho);
      const ecd = parseSaldosDeArquivo(statusTx.caminho);
      // Só naturezas patrimoniais.
      hierarquia = compararBalancetesHierarquico(
        dom.saldos,
        dom.plano,
        ecd.saldos,
        ecd.plano,
        { naturezas: NATUREZAS_BALANCO },
      );
      const todasFlat = compararBalancetes(dom.saldos, ecd.saldos, {
        incluirConformes: true,
        naturezas: NATUREZAS_BALANCO,
      });
      resumo = resumirComparacao(todasFlat);
    } catch (e) {
      erro = `Falha ao processar SPED: ${(e as Error).message}`;
    }
  }

  return (
    <div className="mx-auto max-w-6xl px-6 py-8 lg:px-10 lg:py-12">
      <div className="mb-8">
        <Link
          href={`/painel/clientes/${id}`}
          className="text-xs text-[var(--ink-soft)] transition hover:text-[var(--brand-deep)]"
        >
          ← {cliente.razaoSocial}
        </Link>

        <div className="eyebrow mt-4">
          <span>Auditoria Contábil</span>
          <span className="eyebrow-sep">§</span>
          <span>Balanço Comparado</span>
          {anoSelecionado && (
            <>
              <span className="eyebrow-sep">§</span>
              <span>Exercício {anoSelecionado}</span>
            </>
          )}
        </div>

        <h1 className="display mt-3 text-[2.6rem] lg:text-[3.2rem]">
          Balanço <span className="italic text-[var(--brand-2)]">×</span> Balanço
        </h1>

        <p className="mt-3 max-w-[62ch] text-[0.92rem] leading-relaxed text-[var(--ink-soft)]">
          Verifica se a posição patrimonial fecha entre o SPED-ECD do sistema
          contábil e o SPED-ECD transmitido à Receita. Só Ativo, Passivo e
          Patrimônio Líquido — contas de resultado ficam no{" "}
          <Link
            href={`/painel/clientes/${id}/balancete-comparado?ano=${anoSelecionado}`}
            className="underline decoration-[var(--brand-2)] decoration-2 underline-offset-2 hover:text-[var(--brand-deep)]"
          >
            Balancete de Verificação
          </Link>
          .
        </p>

        <div className="rule-gold mt-6 w-40" />
      </div>

      <dl className="meta-strip mb-6">
        <div>
          <dt>Razão social</dt>
          <dd>{cliente.razaoSocial}</dd>
        </div>
        <div>
          <dt>CNPJ</dt>
          <dd>{formatarCnpj(cliente.cnpj)}</dd>
        </div>
        <div>
          <dt>Regime</dt>
          <dd>{cliente.regimeTributario ?? "—"}</dd>
        </div>
        <div>
          <dt>Pasta de arquivos</dt>
          <dd>
            <code>{pastaClienteAbs}\</code>
          </dd>
        </div>
      </dl>

      <section className="mb-8">
        <div className="mb-3 flex items-baseline justify-between">
          <h2 className="display text-xl">Fontes de comparação</h2>
          <span className="eyebrow">2 arquivos SPED-ECD</span>
        </div>
        <UploadSpedsForm
          clienteId={id}
          statusDominio={statusDom}
          statusTransmitida={statusTx}
        />
      </section>

      {anosDisponiveis.length > 0 && (
        <div className="mb-8 flex flex-wrap items-center gap-x-3 gap-y-2">
          <span className="eyebrow mr-1">Exercício</span>
          <div className="flex flex-wrap gap-1.5">
            {anosDisponiveis.map((a) => (
              <Link
                key={a}
                href={`/painel/clientes/${id}/balanco-comparado?ano=${a}`}
                className="chip-year"
                data-active={a === anoSelecionado}
              >
                {a}
              </Link>
            ))}
          </div>
        </div>
      )}

      {(!statusDom.presente || !statusTx.presente) && anosDisponiveis.length > 0 && (
        <div className="notice mb-4" data-tone="warn">
          Faltam arquivos pra comparar {anoSelecionado}:{" "}
          {!statusDom.presente && !statusTx.presente
            ? "os dois lados"
            : !statusDom.presente
              ? "SPED do Sistema"
              : "SPED Transmitido"}
          . Envie no formulário acima.
        </div>
      )}

      {erro && (
        <div className="notice mb-4" data-tone="err">
          {erro}
        </div>
      )}

      {hierarquia && resumo && (
        <>
          <div
            className="status-panel mb-5"
            data-tone={resumo.totalContasDivergentes === 0 ? "ok" : "err"}
          >
            <div>
              <div className="status-label">
                {resumo.totalContasDivergentes === 0 ? "Balanço fecha" : "Balanço divergente"}
              </div>
              <div className="status-msg">
                {resumo.totalContasDivergentes === 0
                  ? `Ativo, Passivo e PL fecham entre Sistema e ECD em ${anoSelecionado}`
                  : `${resumo.totalContasDivergentes} conta(s) patrimonial(is) divergem em ${anoSelecionado}`}
              </div>
            </div>
            <div className="status-count">
              <b>{resumo.totalContasDivergentes.toString().padStart(2, "0")}</b> divergentes
              <br />
              <span className="text-[var(--ink-soft)]">
                Σ |dif| ={" "}
                <b className="text-[var(--brand-deep)]">
                  {moeda(resumo.somaAbsDifSaldoFinal)}
                </b>
              </span>
            </div>
          </div>

          <div className="mb-2 flex items-baseline justify-between">
            <h3 className="display text-xl">
              {incluirTodas ? "Balanço Patrimonial" : "Divergências no Balanço"}
            </h3>
            <span className="eyebrow">Ativo → Passivo → PL · hierárquico</span>
          </div>
          <BalanceteHierarquico
            linhas={hierarquia.linhas}
            soDivergentes={!incluirTodas}
            clienteId={id}
            ano={anoSelecionado}
            modo="balanco"
          />
          <p className="mt-4 text-[11px] leading-relaxed text-[var(--ink-soft)]">
            Formato tradicional do balanço patrimonial: raízes (Ativo/Passivo/PL)
            → subgrupos → sintéticas → analíticas. Sintéticas totalizam as
            descendentes. Só o SALDO FINAL importa aqui — se bate, o balanço
            fecha. Reclassificações internas (movimento diferente mas saldo
            igual) NÃO contam como divergência aqui. Contas de resultado
            (receitas, custos, despesas) ficam no Balancete de Verificação.
          </p>
        </>
      )}
    </div>
  );
}
