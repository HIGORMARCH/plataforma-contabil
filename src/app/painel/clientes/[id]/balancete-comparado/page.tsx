/**
 * Balancete Comparado Domínio × ECD — auditoria analítica conta a conta.
 *
 * Cruza DOIS arquivos SPED-ECD do mesmo cliente/ano:
 *  - "Domínio" — o SPED gerado agora no Domínio (estado atual)
 *  - "Transmitida" — o SPED que foi entregue à Receita
 *
 * A chave de matching é o COD_CTA do registro I050 — bate 1:1 porque
 * ambos vêm do mesmo plano de contas do Domínio. Divergências revelam
 * ajustes feitos depois da transmissão, pendentes de retificação.
 *
 * Convenção: DEVEDOR = positivo, CREDOR = negativo.
 * Filtro: contas ANALÍTICAS (IND_CTA='A') do Ativo e Passivo/PL.
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
import { UploadSpedsForm } from "./_components/UploadSpedsForm";
import { ToolbarBalancete } from "./_components/ToolbarBalancete";
import { BalanceteHierarquico } from "./_components/BalanceteHierarquico";

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

/** Varre a subpasta padronizada e devolve o arquivo mais recente por ano. */
function detectarAnos(clienteRef: ClienteRef): {
  anosDominio: number[];
  anosTransmitida: number[];
} {
  const anosDom = new Set<number>();
  const anosTx = new Set<number>();
  for (const t of ["SPED-ECD-DOMINIO", "SPED-ECD"] as const) {
    const raiz = path.join(pastaCliente(clienteRef), t);
    if (!existsSync(raiz)) continue;
    try {
      for (const nome of readdirSync(raiz)) {
        const num = Number(nome);
        if (num >= 2000 && num <= 2100) {
          const caminho = caminhoArquivo(clienteRef, t, num, null, "txt");
          if (existsSync(caminho)) {
            (t === "SPED-ECD-DOMINIO" ? anosDom : anosTx).add(num);
          }
        }
      }
    } catch {
      /* pasta pode não existir ainda — segue */
    }
  }
  return {
    anosDominio: [...anosDom].sort((a, b) => b - a),
    anosTransmitida: [...anosTx].sort((a, b) => b - a),
  };
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

export default async function BalanceteComparadoPage({
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
  const { anosDominio, anosTransmitida } = detectarAnos(clienteRef);
  const anosDisponiveis = [...new Set([...anosDominio, ...anosTransmitida])].sort(
    (a, b) => b - a,
  );
  const anoSelecionado = anoQ
    ? Number(anoQ)
    : anosDisponiveis[0] ?? new Date().getFullYear();

  const statusDom = statusDoLado(clienteRef, "SPED-ECD-DOMINIO", anoSelecionado);
  const statusTx = statusDoLado(clienteRef, "SPED-ECD", anoSelecionado);

  // Roda a comparação quando os dois lados existem
  let hierarquia: ReturnType<typeof compararBalancetesHierarquico> | null = null;
  let resumo: ReturnType<typeof resumirComparacao> | null = null;
  let erro: string | null = null;
  if (statusDom.presente && statusTx.presente && statusDom.caminho && statusTx.caminho) {
    try {
      const dom = parseSaldosDeArquivo(statusDom.caminho);
      const ecd = parseSaldosDeArquivo(statusTx.caminho);
      hierarquia = compararBalancetesHierarquico(
        dom.saldos,
        dom.plano,
        ecd.saldos,
        ecd.plano,
      );
      const todasFlat = compararBalancetes(dom.saldos, ecd.saldos, {
        incluirConformes: true,
      });
      resumo = resumirComparacao(todasFlat);
    } catch (e) {
      erro = `Falha ao processar SPED: ${(e as Error).message}`;
    }
  }

  return (
    <div className="w-full py-8 lg:py-12">
      {/* CABEÇALHO EDITORIAL */}
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
          <span>Balancete Comparado</span>
          {anoSelecionado && (
            <>
              <span className="eyebrow-sep">§</span>
              <span>Exercício {anoSelecionado}</span>
            </>
          )}
        </div>

        <h1 className="display mt-3 text-[2.6rem] lg:text-[3.2rem]">
          Balancete <span className="italic text-[var(--brand-2)]">×</span> Balancete
        </h1>

        <p className="mt-3 max-w-[62ch] text-[0.92rem] leading-relaxed text-[var(--ink-soft)]">
          Cruza o SPED-ECD do Sistema (estado atual da contabilidade) com o
          SPED-ECD transmitido à Receita, conta analítica por conta analítica.
          Divergências revelam ajustes feitos depois da transmissão, ainda
          pendentes de retificação.
        </p>

        <div className="rule-gold mt-6 w-40" />
      </div>

      {/* META STRIP */}
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

      {/* UPLOAD DOS DOIS LADOS */}
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

      {/* SELETOR DE EXERCÍCIO — só aparece com dados */}
      {anosDisponiveis.length > 0 && (
        <div className="mb-8 flex flex-wrap items-center gap-x-3 gap-y-2">
          <span className="eyebrow mr-1">Exercício</span>
          <div className="flex flex-wrap gap-1.5">
            {anosDisponiveis.map((a) => (
              <Link
                key={a}
                href={`/painel/clientes/${id}/balancete-comparado?ano=${a}`}
                className="chip-year"
                data-active={a === anoSelecionado}
              >
                {a}
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* AVISOS DE ESTADO INCOMPLETO */}
      {(!statusDom.presente || !statusTx.presente) && anosDisponiveis.length > 0 && (
        <div className="notice mb-4" data-tone="warn">
          Faltam arquivos pra comparar {anoSelecionado}:{" "}
          {!statusDom.presente && !statusTx.presente
            ? "os dois lados"
            : !statusDom.presente
              ? "SPED do Sistema"
              : "SPED transmitido"}
          . Envie no formulário acima.
        </div>
      )}

      {erro && (
        <div className="notice mb-4" data-tone="err">
          {erro}
        </div>
      )}

      {/* RESULTADO DA COMPARAÇÃO */}
      {hierarquia && resumo && (
        <>
          <div
            className="status-panel mb-5"
            data-tone={resumo.totalContasDivergentes === 0 ? "ok" : "err"}
          >
            <div>
              <div className="status-label">
                {resumo.totalContasDivergentes === 0 ? "Conciliado" : "Divergente"}
              </div>
              <div className="status-msg">
                {resumo.totalContasDivergentes === 0
                  ? `Todas as contas fecham entre Sistema e ECD em ${anoSelecionado}`
                  : `${resumo.totalContasDivergentes} conta(s) divergem entre Sistema e ECD em ${anoSelecionado}`}
              </div>
            </div>
            <div className="status-count">
              <b>
                {resumo.totalContasDivergentes.toString().padStart(2, "0")}
              </b>{" "}
              divergentes
              <br />
              <span className="text-[var(--ink-soft)]">
                Σ |dif| ={" "}
                <b className="text-[var(--brand-deep)]">
                  {moeda(resumo.somaAbsDifSaldoFinal)}
                </b>
              </span>
            </div>
          </div>

          {resumo.maiorDivergenciaConta && (
            <div className="notice mb-5" data-tone="warn">
              Maior divergência de saldo final:{" "}
              <b>{resumo.maiorDivergenciaConta}</b> —{" "}
              <b>{moeda(resumo.maiorDivergenciaValor)}</b>
            </div>
          )}

          <ToolbarBalancete
            clienteId={id}
            ano={anoSelecionado}
            totalDivergentes={resumo.totalContasDivergentes}
            totalGeral={resumo.totalContasDivergentes + resumo.totalContasConformes}
            filtroAtual={incluirTodas ? "todas" : "divergentes"}
          />

          {hierarquia.linhas.length === 0 ? (
            <div className="notice">
              Nenhuma conta patrimonial encontrada nos dois SPEDs.
            </div>
          ) : (
            <>
              <div className="mb-2 flex items-baseline justify-between">
                <h3 className="display text-xl">
                  {incluirTodas ? "Balancete de Verificação" : "Divergências no Balancete"}
                </h3>
                <span className="eyebrow">
                  Ativo → Passivo → PL → Resultado · hierárquico
                </span>
              </div>
              <BalanceteHierarquico
                linhas={hierarquia.linhas}
                soDivergentes={!incluirTodas}
                clienteId={id}
                ano={anoSelecionado}
              />
              <p className="mt-4 text-[11px] leading-relaxed text-[var(--ink-soft)]">
                Balancete de verificação no formato tradicional: raízes
                (Ativo/Passivo/PL/Resultado) → subgrupos (Circulante/Não
                Circulante/Receitas/Custos/Despesas) → contas sintéticas →
                analíticas. Sintéticas totalizam as descendentes. Clique numa
                analítica <b>divergente</b> pra ver o detalhamento (SI, Débito,
                Crédito, SF do Sistema vs. ECD) e o razão comparado.
                Convenção: DEVEDOR em positivo, CREDOR em negativo.
              </p>
            </>
          )}
        </>
      )}
    </div>
  );
}

