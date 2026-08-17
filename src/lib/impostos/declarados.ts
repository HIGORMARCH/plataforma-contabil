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
import { tributoDeCodigo } from "@/lib/serpro/mapeamento-tributos";

export type OrigemDeclaracao = "GIAM" | "SPED_FISCAL" | "DCTFWEB" | "ECF";
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
}

export const ROTULO_ORIGEM: Record<OrigemDeclaracao, string> = {
  GIAM: "GIAM (arquivo do Domínio)",
  SPED_FISCAL: "SPED-Fiscal (E110)",
  DCTFWEB: "DCTFWeb",
  ECF: "SPED-ECF",
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

  const [giams, speds, dctfs, ecfs] = await Promise.all([
    prisma.giamApuracao.findMany({
      where: { clienteId, retificacao: "00", periodoApuracao: { gte: de, lte: ate } },
      include: { icmsARecolher: true },
      orderBy: { periodoApuracao: "asc" },
    }),
    prisma.spedApuracao.findMany({
      where: { clienteId, periodoApuracao: { gte: de, lte: ate } },
      select: { periodoApuracao: true, icmsARecolher: true },
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
  ]);

  const itens: ItemAPagar[] = [];

  // --- ICMS pela GIAM (Segmento E, uma linha por tipo) ---
  const competenciasComGiam = new Set<number>();
  for (const g of giams) {
    competenciasComGiam.add(g.periodoApuracao.getTime());
    for (const linha of g.icmsARecolher) {
      const valor = Number(linha.valor);
      if (valor === 0) continue; // linha zerada não é obrigação a pagar
      itens.push({
        competencia: g.periodoApuracao,
        competenciaLabel: labelMes(g.periodoApuracao),
        origem: "GIAM",
        esfera: "ESTADUAL",
        tributo: "ICMS",
        detalhe: legendaTipoIcms(linha.tipo),
        valor,
        vencimento: linha.dataVencimento,
      });
    }
  }

  // --- ICMS pelo SPED-Fiscal, só onde não houver GIAM ---
  for (const s of speds) {
    if (competenciasComGiam.has(s.periodoApuracao.getTime())) continue;
    const valor = Number(s.icmsARecolher);
    if (valor === 0) continue;
    itens.push({
      competencia: s.periodoApuracao,
      competenciaLabel: labelMes(s.periodoApuracao),
      origem: "SPED_FISCAL",
      esfera: "ESTADUAL",
      tributo: "ICMS",
      detalhe: "Apuração normal (E110) — competência sem GIAM importada",
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

  // --- IRPJ / CSLL pela ECF (trimestral) ---
  for (const e of ecfs) {
    const competencia = e.dataInicial;
    const label = `${e.trimestre}º tri/${e.ano}`;
    const irpj = Number(e.irpjApurado);
    const csll = Number(e.csllApurada);
    if (irpj !== 0) {
      itens.push({
        competencia,
        competenciaLabel: label,
        origem: "ECF",
        esfera: "FEDERAL",
        tributo: "IRPJ",
        detalhe: `Apurado no ${e.trimestre}º trimestre (${e.regime})`,
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
        detalhe: `Apurado no ${e.trimestre}º trimestre (${e.regime})`,
        valor: csll,
        vencimento: null,
      });
    }
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
