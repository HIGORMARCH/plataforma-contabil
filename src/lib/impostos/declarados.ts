/**
 * Relatório de impostos a pagar DECLARADOS — o lado "declaração" isolado.
 *
 * Pedido do Higor (16/08/2026): a tela de Conciliação Estadual confronta GIAM ×
 * Razão, mas ele quer poder tirar um relatório só do que as DECLARAÇÕES dizem
 * que há a pagar — GIAM e as demais — sem depender da contabilidade.
 *
 * ⚠️ ISTO NÃO É UM "TOTAL DEVIDO".
 *
 * Cada linha é uma obrigação declarada por UMA declaração. O mesmo tributo pode
 * aparecer em mais de uma fonte na mesma competência (a DCTFWeb confessa o IRPJ
 * que a ECF apurou, por exemplo). Somar tudo cegamente infla o número.
 *
 * Por isso:
 *   - o relatório agrupa POR ORIGEM e soma dentro de cada uma;
 *   - `conflitos()` aponta onde o mesmo tributo/competência veio de duas fontes,
 *     pro contador decidir — mesma regra de sempre: importa fiel, aponta, não
 *     conserta.
 *
 * Regra do ICMS: GIAM é a fonte. O SPED-Fiscal declara o MESMO ICMS (os dois
 * saem do Domínio), então entra apenas como reserva, quando a competência tem
 * SPED e não tem GIAM — assim nada some do relatório sem duplicar.
 */

import { prisma } from "@/lib/db";
import { rotuloEstabelecimento } from "@/lib/estabelecimento";
import { tributoDeCodigo } from "@/lib/serpro/mapeamento-tributos";

export type OrigemDeclaracao = "GIAM" | "SPED_FISCAL" | "DCTFWEB" | "ECF" | "PGDASD";
export type Esfera = "ESTADUAL" | "FEDERAL";

export interface ItemAPagar {
  /** Primeiro dia da competência (mês, ou primeiro mês do trimestre na ECF). */
  competencia: Date;
  /** "04/2022" ou "1º tri/2022". */
  competenciaLabel: string;
  origem: OrigemDeclaracao;
  esfera: Esfera;
  /** Sigla — ICMS, PIS, COFINS, IRPJ, CSLL, INSS... */
  tributo: string;
  /** Qualificação da linha: tipo do ICMS, código da receita, trimestre. */
  detalhe: string;
  valor: number;
  /** Só a GIAM traz vencimento por linha (Segmento E). */
  vencimento: Date | null;
  /**
   * Quebra interna de uma obrigação que se PAGA unificada — hoje só o DAS do
   * Simples. A soma da composição é o próprio `valor`; ela existe pra tela
   * abrir sob clique, nunca pra virar linha própria no relatório.
   */
  composicao?: Array<{ tributo: string; valor: number }>;
}

export const ROTULO_ORIGEM: Record<OrigemDeclaracao, string> = {
  GIAM: "GIAM (arquivo do Domínio)",
  SPED_FISCAL: "SPED-Fiscal (E110)",
  DCTFWEB: "DCTFWeb",
  ECF: "SPED-ECF",
  PGDASD: "PGDAS-D (Simples Nacional)",
};

/** Legenda dos tipos do Segmento E da GIAM. */
export function legendaTipoIcms(tipo: string): string {
  switch (tipo) {
    case "N":
      return "Normal (apuração)";
    case "D":
      return "Diferencial de alíquota — entradas";
    case "S":
      return "Substituição tributária";
    case "C":
      return "Complementação de alíquota";
    case "F":
      return "Diferencial de alíquota — saídas";
    case "P":
      return "Fundo de combate à pobreza";
    default:
      return `Tipo ${tipo}`;
  }
}

function labelMes(d: Date): string {
  return `${String(d.getUTCMonth() + 1).padStart(2, "0")}/${d.getUTCFullYear()}`;
}

/**
 * Levanta tudo que as declarações do cliente apontam como a pagar no intervalo
 * de anos informado. Ordenado por competência, depois esfera, depois tributo.
 */
export async function levantarImpostosDeclarados(params: {
  clienteId: string;
  anoInicial: number;
  anoFinal: number;
}): Promise<ItemAPagar[]> {
  const { clienteId, anoInicial, anoFinal } = params;
  const de = new Date(Date.UTC(anoInicial, 0, 1));
  const ate = new Date(Date.UTC(anoFinal, 11, 31));

  const [giams, speds, dctfs, ecfs, pgdas] = await Promise.all([
    prisma.giamApuracao.findMany({
      where: { clienteId, retificacao: "00", periodoApuracao: { gte: de, lte: ate } },
      include: { icmsARecolher: true, estabelecimento: { select: { tipo: true, numero: true } } },
      orderBy: { periodoApuracao: "asc" },
    }),
    prisma.spedApuracao.findMany({
      where: { clienteId, periodoApuracao: { gte: de, lte: ate } },
      select: {
        periodoApuracao: true,
        icmsARecolher: true,
        estabelecimentoId: true,
        estabelecimento: { select: { tipo: true, numero: true } },
      },
      orderBy: { periodoApuracao: "asc" },
    }),
    prisma.dctfWebDeclaracao.findMany({
      where: { clienteId, periodoApuracao: { gte: de, lte: ate } },
      orderBy: { periodoApuracao: "asc" },
    }),
    prisma.ecfApuracao.findMany({
      where: { clienteId, ano: { gte: anoInicial, lte: anoFinal } },
      orderBy: [{ ano: "asc" }, { trimestre: "asc" }],
    }),
    prisma.pgdasdDeclaracao.findMany({
      where: { clienteId, periodoApuracao: { gte: de, lte: ate } },
      orderBy: { periodoApuracao: "asc" },
    }),
  ]);

  const itens: ItemAPagar[] = [];

  // ICMS é por estabelecimento. Com filiais, o detalhe diz de qual é — e a
  // regra "SPED só onde não há GIAM" vale estabelecimento a estabelecimento
  // (a GIAM de uma filial do TO não cobre o SPED da matriz de outro estado).
  const temFiliais = [...giams, ...speds].some((x) => x.estabelecimento.numero > 0);
  const deQuem = (e: { tipo: string; numero: number }) =>
    temFiliais ? `${rotuloEstabelecimento(e)} — ` : "";

  // --- ICMS pela GIAM (Segmento E, uma linha por tipo) ---
  const competenciasComGiam = new Set<string>();
  for (const g of giams) {
    competenciasComGiam.add(`${g.estabelecimentoId}:${g.periodoApuracao.getTime()}`);
    for (const linha of g.icmsARecolher) {
      const valor = Number(linha.valor);
      if (valor === 0) continue; // linha zerada não é obrigação a pagar
      itens.push({
        competencia: g.periodoApuracao,
        competenciaLabel: labelMes(g.periodoApuracao),
        origem: "GIAM",
        esfera: "ESTADUAL",
        tributo: "ICMS",
        detalhe: deQuem(g.estabelecimento) + legendaTipoIcms(linha.tipo),
        valor,
        vencimento: linha.dataVencimento,
      });
    }
  }

  // --- ICMS pelo SPED-Fiscal, só onde não houver GIAM ---
  for (const s of speds) {
    if (competenciasComGiam.has(`${s.estabelecimentoId}:${s.periodoApuracao.getTime()}`)) continue;
    const valor = Number(s.icmsARecolher);
    if (valor === 0) continue;
    itens.push({
      competencia: s.periodoApuracao,
      competenciaLabel: labelMes(s.periodoApuracao),
      origem: "SPED_FISCAL",
      esfera: "ESTADUAL",
      tributo: "ICMS",
      detalhe: deQuem(s.estabelecimento) + "Apuração normal (E110) — competência sem GIAM importada",
      valor,
      vencimento: null,
    });
  }

  // --- Federais pela DCTFWeb ---
  //
  // O detalhe por código vive no payloadBruto (JSON gravado na sincronização).
  // Quando ele existe, cada débito vira uma linha — é o nível que o contador
  // precisa pra conferir guia por guia. Sem payload, cai pro consolidado de
  // PIS/COFINS que fica em coluna própria.
  for (const d of dctfs) {
    const debitos = extrairDebitos(d.payloadBruto);
    if (debitos.length > 0) {
      for (const deb of debitos) {
        if (deb.valor === 0) continue;
        itens.push({
          competencia: d.periodoApuracao,
          competenciaLabel: labelMes(d.periodoApuracao),
          origem: "DCTFWEB",
          esfera: "FEDERAL",
          tributo: tributoDeCodigo(deb.codigo),
          detalhe: deb.denominacao
            ? `Código ${deb.codigo} — ${deb.denominacao}`
            : `Código ${deb.codigo}`,
          valor: deb.valor,
          vencimento: null,
        });
      }
      continue;
    }

    const pis = Number(d.pisConfessado);
    const cofins = Number(d.cofinsConfessado);
    if (pis !== 0) {
      itens.push({
        competencia: d.periodoApuracao,
        competenciaLabel: labelMes(d.periodoApuracao),
        origem: "DCTFWEB",
        esfera: "FEDERAL",
        tributo: "PIS",
        detalhe: "Consolidado da declaração (sem detalhe por código)",
        valor: pis,
        vencimento: null,
      });
    }
    if (cofins !== 0) {
      itens.push({
        competencia: d.periodoApuracao,
        competenciaLabel: labelMes(d.periodoApuracao),
        origem: "DCTFWEB",
        esfera: "FEDERAL",
        tributo: "COFINS",
        detalhe: "Consolidado da declaração (sem detalhe por código)",
        valor: cofins,
        vencimento: null,
      });
    }
  }

  // --- IRPJ / CSLL pela ECF ---
  // Trimestral: um item por trimestre. Lucro Real anual: estimativa de cada mês
  // (A01..A12, competência = o mês) e o ajuste do ano (A00, competência = dez).
  for (const e of ecfs) {
    const anual = e.trimestre === 0;
    const estimativa = anual && e.periodo !== "A00";
    const competencia = estimativa || !anual ? e.dataInicial : new Date(e.ano, 11, 1);
    const label = !anual
      ? `${e.trimestre}º tri/${e.ano}`
      : estimativa
        ? `${e.periodo.slice(1)}/${e.ano}`
        : `ajuste ${e.ano}`;
    const quando = !anual
      ? `no ${e.trimestre}º trimestre`
      : estimativa
        ? `por estimativa em ${e.periodo.slice(1)}/${e.ano}`
        : `no ajuste anual de ${e.ano}`;
    const irpj = Number(e.irpjApurado);
    const csll = Number(e.csllApurada);
    if (irpj !== 0) {
      itens.push({
        competencia,
        competenciaLabel: label,
        origem: "ECF",
        esfera: "FEDERAL",
        tributo: "IRPJ",
        detalhe: `Apurado ${quando} (${e.regime})`,
        valor: irpj,
        vencimento: null,
      });
    }
    if (csll !== 0) {
      itens.push({
        competencia,
        competenciaLabel: label,
        origem: "ECF",
        esfera: "FEDERAL",
        tributo: "CSLL",
        detalhe: `Apurado ${quando} (${e.regime})`,
        valor: csll,
        vencimento: null,
      });
    }
  }

  // --- Simples Nacional pelo PGDAS-D ---
  //
  // UMA LINHA POR COMPETÊNCIA, com o valor unificado. O Simples é recolhido numa
  // guia só (o DAS): quebrar em oito linhas (IRPJ, CSLL, COFINS, PIS, INSS,
  // ICMS, IPI, ISS) daria oito obrigações onde existe uma, e ninguém paga
  // separado. A composição fica em `composicao`, pra tela abrir sob clique.
  //
  // Esfera FEDERAL mesmo na parcela de ICMS/ISS — a guia é federal. E o ICMS de
  // dentro do DAS não é o mesmo tributo da complementação de alíquota / difal
  // declarada na GIAM: por isso o tributo aqui se chama "DAS", e não "ICMS" —
  // senão o relatório acusaria conflito com a GIAM onde não há.
  for (const p of pgdas) {
    const total = Number(p.totalDebito);
    if (total === 0) continue;
    const composicao: Array<{ tributo: string; valor: number }> = [
      { tributo: "IRPJ", valor: Number(p.irpj) },
      { tributo: "CSLL", valor: Number(p.csll) },
      { tributo: "COFINS", valor: Number(p.cofins) },
      { tributo: "PIS", valor: Number(p.pis) },
      { tributo: "INSS/CPP", valor: Number(p.inss) },
      { tributo: "ICMS", valor: Number(p.icms) },
      { tributo: "IPI", valor: Number(p.ipi) },
      { tributo: "ISS", valor: Number(p.iss) },
    ].filter((c) => c.valor !== 0);

    const situacao = p.situacao === "RETIFICADORA" ? "retificadora" : "original";
    itens.push({
      competencia: p.periodoApuracao,
      competenciaLabel: labelMes(p.periodoApuracao),
      origem: "PGDASD",
      esfera: "FEDERAL",
      tributo: "DAS",
      detalhe: `Simples Nacional — declaração ${situacao}${p.numeroRecibo ? ` (recibo ${p.numeroRecibo})` : ""}`,
      valor: total,
      vencimento: null,
      composicao,
    });
  }

  itens.sort((a, b) => {
    const t = a.competencia.getTime() - b.competencia.getTime();
    if (t !== 0) return t;
    if (a.esfera !== b.esfera) return a.esfera === "ESTADUAL" ? -1 : 1;
    return a.tributo.localeCompare(b.tributo);
  });

  return itens;
}

type DebitoBruto = { codigo: string; denominacao?: string; valor: number };

/**
 * Lê `payloadBruto.debitos` da DCTFWeb com tolerância — é JSON livre gravado
 * pela sincronização, então nada aqui pode assumir formato.
 *
 * Valor preferido: `saldoAPagar` (já líquido das vinculações). Sem ele, usa o
 * débito confessado. É a leitura mais próxima de "quanto ainda há a pagar".
 */
function extrairDebitos(payload: unknown): DebitoBruto[] {
  if (!payload || typeof payload !== "object") return [];
  const debitos = (payload as { debitos?: unknown }).debitos;
  if (!Array.isArray(debitos)) return [];

  const out: DebitoBruto[] = [];
  for (const d of debitos) {
    if (!d || typeof d !== "object") continue;
    const o = d as Record<string, unknown>;
    const codigo = typeof o.codigo === "string" ? o.codigo : String(o.codigo ?? "");
    if (!codigo) continue;
    const saldo = Number(o.saldoAPagar);
    const valorDeclarado = Number(o.valor);
    const valor = Number.isFinite(saldo) && saldo !== 0 ? saldo : valorDeclarado;
    if (!Number.isFinite(valor)) continue;
    out.push({
      codigo,
      denominacao: typeof o.denominacao === "string" ? o.denominacao : undefined,
      valor,
    });
  }
  return out;
}

export interface TotalPorOrigem {
  origem: OrigemDeclaracao;
  esfera: Esfera;
  itens: number;
  total: number;
}

export function totaisPorOrigem(itens: ItemAPagar[]): TotalPorOrigem[] {
  const mapa = new Map<OrigemDeclaracao, TotalPorOrigem>();
  for (const i of itens) {
    const atual = mapa.get(i.origem);
    if (atual) {
      atual.itens++;
      atual.total += i.valor;
    } else {
      mapa.set(i.origem, { origem: i.origem, esfera: i.esfera, itens: 1, total: i.valor });
    }
  }
  return [...mapa.values()].sort((a, b) =>
    a.esfera === b.esfera ? a.origem.localeCompare(b.origem) : a.esfera === "ESTADUAL" ? -1 : 1,
  );
}

export interface Conflito {
  competenciaLabel: string;
  tributo: string;
  origens: OrigemDeclaracao[];
}

/**
 * Mesmo tributo, mesma competência, declarado em mais de uma fonte. Não é
 * necessariamente erro — a DCTFWeb confessa o que a ECF apurou —, mas somar as
 * duas conta o tributo duas vezes. Aponta pro contador decidir.
 */
export function conflitos(itens: ItemAPagar[]): Conflito[] {
  const mapa = new Map<string, { competenciaLabel: string; tributo: string; origens: Set<OrigemDeclaracao> }>();
  for (const i of itens) {
    const chave = `${i.competencia.getTime()}|${i.tributo}`;
    const atual = mapa.get(chave);
    if (atual) atual.origens.add(i.origem);
    else
      mapa.set(chave, {
        competenciaLabel: i.competenciaLabel,
        tributo: i.tributo,
        origens: new Set([i.origem]),
      });
  }
  return [...mapa.values()]
    .filter((c) => c.origens.size > 1)
    .map((c) => ({
      competenciaLabel: c.competenciaLabel,
      tributo: c.tributo,
      origens: [...c.origens],
    }));
}
