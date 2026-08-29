/**
 * Conciliação por tributo: razão contábil × pagamento.
 *
 * Lado A — RAZÃO: os PDFs da pasta `RAZAO` do cliente, um por tributo. O que
 * interessa é o DÉBITO da conta "a recolher": é a baixa, o registro contábil de
 * que o imposto foi pago.
 *
 * Lado B — PAGO: os documentos de arrecadação (comprovantes da pasta + e-CAC),
 * classificados por tributo pelo código de receita.
 *
 * A competência manda, não a data. O DAS de agosto é pago em setembro e o razão
 * registra "PAGAMENTO INSS Mensal 08/2019" — os três documentos falam de agosto.
 *
 * O que esta camada NÃO faz: julgar. Ela põe os dois números lado a lado e
 * calcula a diferença. Explicar a diferença é do contador.
 */

import { readFileSync } from "node:fs";
import { prisma } from "@/lib/db";
import { inventariarRazao } from "./varrerPastaRazao";
import { lerRazaoPdf, resumirPorCompetencia, type RazaoLido } from "./parseRazaoPdf";
import {
  CODIGOS_POR_TRIBUTO,
  tributoDoCodigoReceita,
  type TributoRazao,
} from "./tributos";

export { CODIGOS_POR_TRIBUTO, tributoDoCodigoReceita };


export interface LinhaConciliacao {
  competencia: Date;
  /** Débito total da conta no razão — inclui baixas que não são pagamento. */
  razaoDebito: number;
  /**
   * Só os débitos cujo histórico diz PAGAMENTO/RECOLHIMENTO. É este que se
   * compara com a guia: "COMPENSAÇÃO DE INSS NO MÊS" também é débito, mas não
   * saiu dinheiro — somar tudo faria o razão parecer maior que o pago sempre.
   */
  razaoPagamento: number;
  /** Crédito da conta no razão — a provisão. */
  razaoCredito: number;
  /** Total dos documentos de arrecadação da competência. */
  pago: number;
  /** razão (pagamento) − pago. Zero é o que se espera. */
  diferenca: number;
  documentos: number;
}

/** Histórico que caracteriza baixa por pagamento, não por compensação/estorno. */
const RX_PAGAMENTO = /pagamento|recolhimento|recolhido|guia|darf|das\b|gps/i;

/**
 * O lançamento é baixa por pagamento?
 *
 * O histórico sozinho não serve: o Domínio imprime a linha do pagamento SEM
 * histórico em boa parte do período (conferido no razão do INSS da LUPO — a
 * partir de 06/2023 as baixas saem em branco). O que sempre aparece nelas é a
 * CONTA DE CONTRAPARTIDA: débito da conta "a recolher" contra banco/caixa é,
 * por definição, dinheiro saindo. Compensação e estorno não têm contrapartida.
 */
function ehBaixaPorPagamento(l: { debito: number; historico: string; contraPartida: string | null }): boolean {
  if (l.debito === 0) return false;
  // Compensação e estorno também debitam a conta (e no razão do INSS até têm
  // contrapartida), mas não sai dinheiro — não podem entrar no confronto com a
  // guia. O histórico dessas o Domínio sempre imprime.
  if (/compensa|estorno|transfer/i.test(l.historico)) return false;
  if (l.contraPartida) return true;
  return RX_PAGAMENTO.test(l.historico);
}


/**
 * Competência de uma baixa por pagamento.
 *
 * Quando o histórico diz ("PAGAMENTO INSS Mensal 08/2019"), é ela. Quando o
 * histórico vem vazio, assume-se o MÊS ANTERIOR ao lançamento — INSS, DAS, IRRF
 * e FGTS vencem no mês seguinte à competência, e é assim que as linhas com
 * histórico aparecem neste mesmo razão. A suposição é contada e reportada, não
 * escondida.
 */
function competenciaDaBaixa(l: { data: Date; competencia: Date | null }): {
  competencia: Date;
  inferida: boolean;
} {
  if (l.competencia) return { competencia: l.competencia, inferida: false };
  return {
    competencia: new Date(Date.UTC(l.data.getUTCFullYear(), l.data.getUTCMonth() - 1, 1)),
    inferida: true,
  };
}

export interface ConciliacaoTributo {
  tributo: TributoRazao;
  arquivo: string | null;
  conta: string | null;
  contaCodigo: string | null;
  saldoFinal: number | null;
  lancamentos: number;
  linhas: LinhaConciliacao[];
  totalRazaoDebito: number;
  totalRazaoPagamento: number;
  totalPago: number;
  alertas: string[];
}

function chave(d: Date): number {
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1);
}

/**
 * Monta a conciliação de todos os tributos que o cliente tem razão na pasta.
 * Tributo sem arquivo simplesmente não entra — cada empresa tem os seus.
 */
export async function conciliarRazaoComPagamentos(params: {
  clienteId: string;
  anoInicial: number;
  anoFinal: number;
}): Promise<ConciliacaoTributo[]> {
  const { clienteId, anoInicial, anoFinal } = params;
  const de = new Date(Date.UTC(anoInicial, 0, 1));
  const ate = new Date(Date.UTC(anoFinal, 11, 31));

  const inventario = await inventariarRazao(clienteId);
  if (inventario.encontrados.length === 0) return [];

  const [pagamentos, desmembramentos] = await Promise.all([
    prisma.ecacPagamento.findMany({
      where: { clienteId, periodoApuracao: { gte: de, lte: ate } },
      select: {
        id: true,
        codigoReceitaPrincipal: true,
        periodoApuracao: true,
        valorTotal: true,
      },
    }),
    prisma.ecacDesmembramento.findMany({
      where: { pagamento: { clienteId }, periodoApuracao: { gte: de, lte: ate } },
      select: { pagamentoId: true, codigoReceita: true, periodoApuracao: true, valorTotal: true },
    }),
  ]);

  // Pago por (tributo, competência). O desmembramento tem precedência: é ele
  // que separa INSS de IRRF dentro do mesmo DARF. Documento com desmembramento
  // não é contado de novo pelo código principal.
  const comDesmembramento = new Set(desmembramentos.map((d) => d.pagamentoId));
  const pagoPorTributo = new Map<TributoRazao, Map<number, { valor: number; docs: number }>>();
  const acumular = (tributo: TributoRazao, competencia: Date, valor: number) => {
    if (!pagoPorTributo.has(tributo)) pagoPorTributo.set(tributo, new Map());
    const porComp = pagoPorTributo.get(tributo)!;
    const k = chave(competencia);
    const atual = porComp.get(k) ?? { valor: 0, docs: 0 };
    atual.valor += valor;
    atual.docs++;
    porComp.set(k, atual);
  };
  const tributoDoCodigo = tributoDoCodigoReceita;

  for (const d of desmembramentos) {
    const t = tributoDoCodigo(d.codigoReceita);
    if (t) acumular(t, d.periodoApuracao, Number(d.valorTotal));
  }
  for (const p of pagamentos) {
    if (comDesmembramento.has(p.id)) continue;
    const t = tributoDoCodigo(p.codigoReceitaPrincipal);
    if (t) acumular(t, p.periodoApuracao, Number(p.valorTotal));
  }

  const resultado: ConciliacaoTributo[] = [];

  for (const arquivo of inventario.encontrados) {
    const base: ConciliacaoTributo = {
      tributo: arquivo.tributo,
      arquivo: arquivo.nome,
      conta: null,
      contaCodigo: null,
      saldoFinal: null,
      lancamentos: 0,
      linhas: [],
      totalRazaoDebito: 0,
      totalRazaoPagamento: 0,
      totalPago: 0,
      alertas: [],
    };

    let lido: RazaoLido;
    try {
      const r = await lerRazaoPdf(readFileSync(arquivo.arquivo));
      if (!r.ok) {
        base.alertas.push(`Não foi possível ler ${arquivo.nome}: ${r.motivo}`);
        resultado.push(base);
        continue;
      }
      lido = r.razao;
    } catch (e) {
      base.alertas.push(
        `Falha ao abrir ${arquivo.nome}: ${e instanceof Error ? e.message : String(e)}`,
      );
      resultado.push(base);
      continue;
    }

    base.conta = lido.conta;
    base.contaCodigo = lido.contaCodigo;
    base.lancamentos = lido.lancamentos.length;
    base.alertas.push(...lido.alertas);

    const ultimo = lido.lancamentos[lido.lancamentos.length - 1];
    if (ultimo?.saldo != null) {
      base.saldoFinal = ultimo.naturezaSaldo === "D" ? -ultimo.saldo : ultimo.saldo;
    }

    const porComp = pagoPorTributo.get(arquivo.tributo) ?? new Map();
    const resumo = resumirPorCompetencia(lido).filter(
      (r) => r.competencia >= de && r.competencia <= ate,
    );

    // Débito de pagamento por competência — lido direto dos lançamentos, porque
    // depende do histórico de cada um, não do total do mês.
    const pagamentoNoRazao = new Map<number, number>();
    let inferidas = 0;
    for (const l of lido.lancamentos) {
      if (!ehBaixaPorPagamento(l)) continue;
      const { competencia: ref, inferida } = competenciaDaBaixa(l);
      if (ref < de || ref > ate) continue;
      if (inferida) inferidas++;
      const k = chave(ref);
      pagamentoNoRazao.set(k, (pagamentoNoRazao.get(k) ?? 0) + l.debito);
    }
    if (inferidas > 0) {
      base.alertas.push(
        `${inferidas} baixa(s) sem competência no histórico — assumida a competência do mês anterior ao lançamento.`,
      );
    }

    // Pagamento lançado duas vezes: mesmo valor, dois débitos, poucos dias de
    // diferença. É o que explica conta "a recolher" com saldo DEVEDOR — foi o
    // caso do FGTS da LUPO ("PAGAMENTO PIX ..." em 14/01 e "PAGAMENTO FGTS
    // 12/2024" em 20/01, ambos R$ 1.048,67). A plataforma aponta; conferir se
    // um dos dois é estorno pendente é do contador.
    const baixas = lido.lancamentos.filter(ehBaixaPorPagamento);
    for (let x = 0; x < baixas.length; x++) {
      for (let y = x + 1; y < baixas.length; y++) {
        const a = baixas[x];
        const b = baixas[y];
        if (Math.abs(a.debito - b.debito) > 0.01) continue;
        const dias = Math.abs(b.data.getTime() - a.data.getTime()) / 86_400_000;
        if (dias > 45) continue;
        base.alertas.push(
          `Possível pagamento em duplicidade: R$ ${a.debito.toFixed(2)} debitado em ` +
            `${a.data.toISOString().slice(0, 10)} e em ${b.data.toISOString().slice(0, 10)}.`,
        );
      }
    }

    const competencias = new Set<number>([
      ...resumo.map((r) => chave(r.competencia)),
      ...porComp.keys(),
    ]);

    for (const k of [...competencias].sort((a, b) => a - b)) {
      const noRazao = resumo.find((r) => chave(r.competencia) === k);
      const pago = porComp.get(k);
      const razaoDebito = noRazao?.debito ?? 0;
      const razaoPagamento = pagamentoNoRazao.get(k) ?? 0;
      const valorPago = pago?.valor ?? 0;
      base.linhas.push({
        competencia: new Date(k),
        razaoDebito,
        razaoPagamento,
        razaoCredito: noRazao?.credito ?? 0,
        pago: valorPago,
        diferenca: razaoPagamento - valorPago,
        documentos: pago?.docs ?? 0,
      });
      base.totalRazaoDebito += razaoDebito;
      base.totalRazaoPagamento += razaoPagamento;
      base.totalPago += valorPago;
    }

    resultado.push(base);
  }

  return resultado;
}
