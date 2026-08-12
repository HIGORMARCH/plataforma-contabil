/**
 * Razão Comparado — mostra o razão de UMA conta específica em duas colunas
 * lado a lado (Domínio × Transmitida), pra o contador identificar exatamente
 * qual lançamento (ou qual dia de movimento) diverge entre os dois SPEDs.
 *
 * Se o SPED for tipo G (Diário completo), o razão é lançamento a lançamento
 * com data, número, histórico e contrapartida. Se for tipo R/B (resumido),
 * agrega por dia.
 */
import { existsSync } from "node:fs";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePapel, PAPEIS_INTERNOS } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { caminhoArquivo, type ClienteRef } from "@/lib/storage/filesystem";
import {
  parsePlanoContas,
  lerArquivoLatin1,
} from "@/lib/ecd/balancete";
import {
  razaoConta,
  type RazaoConta,
  type RazaoLancamento,
  type RazaoDiario,
} from "@/lib/ecd/razao";
import { moeda } from "@/lib/accounting/format";

function formatarData(ddmmaaaa: string): string {
  if (ddmmaaaa.length !== 8) return ddmmaaaa;
  return `${ddmmaaaa.slice(0, 2)}/${ddmmaaaa.slice(2, 4)}/${ddmmaaaa.slice(4, 8)}`;
}

/** Chave de comparação de uma entrada — usada pra decidir se aparece nos dois lados. */
function chaveEntrada(e: RazaoLancamento | RazaoDiario): string {
  if ("dc" in e) {
    // Lançamento: junta data + valor + dc como assinatura
    return `${e.data}|${e.dc}|${e.valor.toFixed(2)}|${(e.numero || "").padStart(6, "0")}`;
  }
  // Diário: só data
  return `${e.data}`;
}

export default async function RazaoComparadoPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string; codigo: string }>;
  searchParams: Promise<{ ano?: string }>;
}) {
  const sessao = await requirePapel(PAPEIS_INTERNOS);
  const { id, codigo } = await params;
  const { ano: anoQ } = await searchParams;
  const ano = Number(anoQ);
  if (!ano || ano < 2000 || ano > 2100) notFound();

  const cliente = await prisma.cliente.findFirst({
    where: { id, escritorioId: sessao.escritorioId },
    select: { razaoSocial: true, cnpj: true },
  });
  if (!cliente) notFound();

  const clienteRef: ClienteRef = {
    razaoSocial: cliente.razaoSocial,
    cnpj: cliente.cnpj,
  };
  const arqDom = caminhoArquivo(clienteRef, "SPED-ECD-DOMINIO", ano, null, "txt");
  const arqEcd = caminhoArquivo(clienteRef, "SPED-ECD", ano, null, "txt");

  const temDom = existsSync(arqDom);
  const temEcd = existsSync(arqEcd);

  // Descrição da conta (pega do primeiro plano disponível)
  let descricaoConta = codigo;
  if (temDom) {
    const plano = parsePlanoContas(lerArquivoLatin1(arqDom));
    descricaoConta = plano.get(codigo)?.descricao ?? codigo;
  } else if (temEcd) {
    const plano = parsePlanoContas(lerArquivoLatin1(arqEcd));
    descricaoConta = plano.get(codigo)?.descricao ?? codigo;
  }

  let razaoDom: RazaoConta | null = null;
  let razaoEcd: RazaoConta | null = null;
  let erro: string | null = null;
  try {
    if (temDom) razaoDom = razaoConta(arqDom, codigo);
    if (temEcd) razaoEcd = razaoConta(arqEcd, codigo);
  } catch (e) {
    erro = (e as Error).message;
  }

  // Índice de assinaturas do lado oposto pra marcar "só num lado"
  const setDom = new Set(razaoDom?.entradas.map((e) => chaveEntrada(e)) ?? []);
  const setEcd = new Set(razaoEcd?.entradas.map((e) => chaveEntrada(e)) ?? []);

  return (
    <div className="mx-auto max-w-7xl px-6 py-8 lg:px-10 lg:py-12">
      <div className="mb-8">
        <Link
          href={`/painel/clientes/${id}/balancete-comparado?ano=${ano}`}
          className="text-xs text-[var(--ink-soft)] transition hover:text-[var(--brand-deep)]"
        >
          ← Balancete Comparado {ano}
        </Link>

        <div className="eyebrow mt-4">
          <span>Auditoria Contábil</span>
          <span className="eyebrow-sep">§</span>
          <span>Razão Comparado</span>
          <span className="eyebrow-sep">§</span>
          <span>Conta #{codigo}</span>
        </div>

        <h1 className="display mt-3 text-[2.2rem] lg:text-[2.6rem]">
          {descricaoConta}
        </h1>

        <p className="mt-3 max-w-[62ch] text-[0.9rem] leading-relaxed text-[var(--ink-soft)]">
          Razão contábil da conta lado a lado, extraído dos dois SPEDs. Linhas
          destacadas em vermelho aparecem só em um dos lados — o lançamento
          está no Domínio mas não na Transmitida (ou vice-versa) e é o
          candidato natural pra investigar a divergência.
        </p>

        <div className="rule-gold mt-6 w-40" />
      </div>

      {erro && (
        <div className="notice mb-4" data-tone="err">
          {erro}
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <ColunaRazao
          titulo="Sistema (estado atual)"
          razao={razaoDom}
          setOposto={setEcd}
          arquivo={arqDom}
          presente={temDom}
        />
        <ColunaRazao
          titulo="ECD Transmitida (oficial)"
          razao={razaoEcd}
          setOposto={setDom}
          arquivo={arqEcd}
          presente={temEcd}
        />
      </div>

      <p className="mt-6 text-[11px] leading-relaxed text-[var(--ink-soft)]">
        <b>Modo LANCAMENTO</b> (I200/I250): SPED tipo G — cada linha é um
        lançamento com contrapartida real. <b>Modo DIÁRIO</b> (I300/I310):
        SPED tipo R ou B — só temos débito/crédito totalizados por dia,
        sem o lançamento individual. Marcadores em vermelho = existe só em
        um dos lados (comparação por data + valor + D/C).
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Coluna do razão de um dos lados
// ---------------------------------------------------------------------------
function ColunaRazao({
  titulo,
  razao,
  setOposto,
  arquivo,
  presente,
}: {
  titulo: string;
  razao: RazaoConta | null;
  setOposto: Set<string>;
  arquivo: string;
  presente: boolean;
}) {
  return (
    <section className="rounded border border-[var(--rule)] bg-white overflow-hidden">
      <header className="px-4 py-3 bg-[var(--brand-2-soft)] border-b border-[var(--brand-2-line)]">
        <div className="text-xs font-mono uppercase tracking-widest text-[var(--ink-soft)]">
          {titulo}
        </div>
        {razao && (
          <div className="mt-1 flex items-baseline justify-between gap-3 flex-wrap">
            <div className="text-[11px] text-[var(--ink-soft)]">
              Modo: <b>{razao.tipoRazao === "LANCAMENTO" ? "Lançamento" : "Diário"}</b>
              {razao.tipoEscrituracao && (
                <> · Tipo I010: <b>{razao.tipoEscrituracao}</b></>
              )}
            </div>
            <div className="font-mono text-[11px] text-[var(--brand-deep)] tabular-nums">
              Deb: <b>{moeda(razao.totalDebito)}</b> · Cred:{" "}
              <b>{moeda(razao.totalCredito)}</b> · SF:{" "}
              <b>{moeda(razao.saldoFinal)}</b>
            </div>
          </div>
        )}
      </header>

      {!presente && (
        <div className="p-4 text-xs text-[var(--ink-soft)]">
          SPED não carregado neste lado. Arquivo esperado:{" "}
          <code>{arquivo}</code>
        </div>
      )}

      {presente && razao && razao.entradas.length === 0 && (
        <div className="p-4 text-xs text-[var(--ink-soft)]">
          Nenhum movimento nesta conta no exercício.
        </div>
      )}

      {presente && razao && razao.entradas.length > 0 && (
        <div className="overflow-x-auto max-h-[70vh] overflow-y-auto">
          {razao.tipoRazao === "LANCAMENTO" ? (
            <TabelaLancamento
              entradas={razao.entradas as RazaoLancamento[]}
              setOposto={setOposto}
            />
          ) : (
            <TabelaDiario
              entradas={razao.entradas as RazaoDiario[]}
              setOposto={setOposto}
            />
          )}
        </div>
      )}
    </section>
  );
}

function TabelaLancamento({
  entradas,
  setOposto,
}: {
  entradas: RazaoLancamento[];
  setOposto: Set<string>;
}) {
  return (
    <table className="w-full text-[11px]">
      <thead className="bg-[var(--brand-darker)] text-[var(--brand-2)] font-mono uppercase tracking-widest text-[10px]">
        <tr>
          <th className="px-2 py-2 text-left">Data</th>
          <th className="px-2 py-2 text-left">Nº</th>
          <th className="px-2 py-2 text-left">Histórico / Contrapartida</th>
          <th className="px-2 py-2 text-right">D</th>
          <th className="px-2 py-2 text-right">C</th>
          <th className="px-2 py-2 text-right">Saldo</th>
        </tr>
      </thead>
      <tbody>
        {entradas.map((e, i) => {
          const soNesse = !setOposto.has(chaveEntradaKey(e));
          return (
            <tr
              key={i}
              className={soNesse ? "bg-[var(--danger-soft)]" : "hover:bg-[#fbf9f4]"}
            >
              <td className="px-2 py-1.5 font-mono">{formatarData(e.data)}</td>
              <td className="px-2 py-1.5 font-mono text-[var(--ink-soft)]">
                {e.numero}
              </td>
              <td className="px-2 py-1.5">
                <div className="text-[var(--ink)] leading-tight">{e.historico}</div>
                {e.contrapartida.length > 0 && (
                  <div className="mt-0.5 text-[10px] text-[var(--ink-soft)]">
                    →{" "}
                    {e.contrapartida
                      .map((c) => `${c.codigo} ${c.descricao}`)
                      .join(" · ")}
                  </div>
                )}
              </td>
              <td className="px-2 py-1.5 text-right font-mono tabular-nums">
                {e.dc === "D" ? moeda(e.valor) : ""}
              </td>
              <td className="px-2 py-1.5 text-right font-mono tabular-nums">
                {e.dc === "C" ? moeda(e.valor) : ""}
              </td>
              <td className="px-2 py-1.5 text-right font-mono tabular-nums text-[var(--brand-deep)]">
                {moeda(e.saldo)}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function TabelaDiario({
  entradas,
  setOposto,
}: {
  entradas: RazaoDiario[];
  setOposto: Set<string>;
}) {
  return (
    <table className="w-full text-[11px]">
      <thead className="bg-[var(--brand-darker)] text-[var(--brand-2)] font-mono uppercase tracking-widest text-[10px]">
        <tr>
          <th className="px-2 py-2 text-left">Data</th>
          <th className="px-2 py-2 text-right">Débito</th>
          <th className="px-2 py-2 text-right">Crédito</th>
          <th className="px-2 py-2 text-right">Saldo</th>
        </tr>
      </thead>
      <tbody>
        {entradas.map((e, i) => {
          const soNesse = !setOposto.has(e.data);
          return (
            <tr
              key={i}
              className={soNesse ? "bg-[var(--danger-soft)]" : "hover:bg-[#fbf9f4]"}
            >
              <td className="px-2 py-1.5 font-mono">{formatarData(e.data)}</td>
              <td className="px-2 py-1.5 text-right font-mono tabular-nums">
                {e.debito > 0 ? moeda(e.debito) : ""}
              </td>
              <td className="px-2 py-1.5 text-right font-mono tabular-nums">
                {e.credito > 0 ? moeda(e.credito) : ""}
              </td>
              <td className="px-2 py-1.5 text-right font-mono tabular-nums text-[var(--brand-deep)]">
                {moeda(e.saldo)}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

// Local copy da chave de comparação (não posso importar helper interno do razao.ts)
function chaveEntradaKey(e: RazaoLancamento): string {
  return `${e.data}|${e.dc}|${e.valor.toFixed(2)}|${(e.numero || "").padStart(6, "0")}`;
}
