/**
 * Período de atendimento do cliente pelo escritório + vigência da inscrição
 * estadual.
 *
 * Origem (16/08/2026): a LUPO QUIOSQUE aparecia com "divergência" em 07/2019 e
 * 07/2026. Nenhuma das duas era erro — 07/2019 é anterior à obtenção da IE e
 * 07/2026 é posterior à saída do cliente do escritório. Sem registrar isso, a
 * plataforma cobra explicação pra sempre e o contador precisa lembrar de cabeça.
 *
 * Serve a dois propósitos:
 *
 *   1. NÃO BATER EM PORTAL À TOA. O robô da SEFAZ, o do Portal Simples e o
 *      SERPRO (que é PAGO por chamada) recortam o intervalo pedido antes de
 *      sair consultando competência que ninguém atendeu.
 *
 *   2. Telas de auditoria marcam a competência como "fora do período" em vez de
 *      tratar como declaração faltando.
 *
 * Convenção: todas as datas são o PRIMEIRO DIA da competência, em UTC — mesma
 * convenção de `periodoApuracao` nas apurações. `atendimentoFim` nulo significa
 * cliente ativo; `atendimentoInicio` nulo significa "sempre atendeu" (cadastro
 * antigo que ainda não foi preenchido) — na dúvida o sistema NÃO restringe, pra
 * não esconder competência por falta de cadastro.
 */

/** Só o que estes helpers precisam do Cliente — evita acoplar ao tipo do Prisma. */
export interface PeriodoCliente {
  atendimentoInicio?: Date | null;
  atendimentoFim?: Date | null;
  ieInicio?: Date | null;
  ieFim?: Date | null;
}

export type ForaDoPeriodo =
  | null
  | "ANTES_DO_ATENDIMENTO"
  | "DEPOIS_DO_ATENDIMENTO"
  | "ANTES_DA_IE"
  | "DEPOIS_DA_IE";

export const ROTULO_FORA_DO_PERIODO: Record<Exclude<ForaDoPeriodo, null>, string> = {
  ANTES_DO_ATENDIMENTO: "Antes do início do atendimento",
  DEPOIS_DO_ATENDIMENTO: "Depois do encerramento do atendimento",
  ANTES_DA_IE: "Anterior à inscrição estadual",
  DEPOIS_DA_IE: "Posterior à baixa da inscrição estadual",
};

/** Cliente ativo = sem data de encerramento, ou encerramento no futuro. */
export function clienteAtivo(cliente: PeriodoCliente, referencia?: Date): boolean {
  if (!cliente.atendimentoFim) return true;
  const ref = referencia ?? new Date();
  return cliente.atendimentoFim.getTime() >= ref.getTime();
}

/**
 * A competência está dentro do que o escritório atendeu?
 *
 * `exigeIe` = true nas obrigações estaduais (GIAM, DIF): além do atendimento, a
 * competência precisa estar dentro da vigência da inscrição estadual.
 *
 * Retorna `null` quando está dentro; senão, o motivo — que a UI usa como rótulo.
 */
export function foraDoPeriodo(
  cliente: PeriodoCliente,
  competencia: Date,
  opcoes?: { exigeIe?: boolean },
): ForaDoPeriodo {
  const t = competencia.getTime();

  if (cliente.atendimentoInicio && t < cliente.atendimentoInicio.getTime()) {
    return "ANTES_DO_ATENDIMENTO";
  }
  if (cliente.atendimentoFim && t > cliente.atendimentoFim.getTime()) {
    return "DEPOIS_DO_ATENDIMENTO";
  }
  if (opcoes?.exigeIe) {
    if (cliente.ieInicio && t < cliente.ieInicio.getTime()) return "ANTES_DA_IE";
    if (cliente.ieFim && t > cliente.ieFim.getTime()) return "DEPOIS_DA_IE";
  }
  return null;
}

/**
 * Recorta um intervalo de competências ao que o cliente de fato foi atendido.
 *
 * É o guard dos robôs: antes de sair consultando mês a mês, corta as pontas.
 * Devolve `null` quando não sobra competência nenhuma — o chamador deve abortar
 * a sincronização em vez de bater no portal.
 *
 * As datas de entrada e saída são sempre o primeiro dia do mês (UTC).
 */
export function recortarPeriodo(
  cliente: PeriodoCliente,
  de: Date,
  ate: Date,
  opcoes?: { exigeIe?: boolean },
): { de: Date; ate: Date } | null {
  let inicio = de;
  let fim = ate;

  const limitesInferiores = [cliente.atendimentoInicio];
  const limitesSuperiores = [cliente.atendimentoFim];
  if (opcoes?.exigeIe) {
    limitesInferiores.push(cliente.ieInicio);
    limitesSuperiores.push(cliente.ieFim);
  }

  for (const l of limitesInferiores) {
    if (l && l.getTime() > inicio.getTime()) inicio = l;
  }
  for (const l of limitesSuperiores) {
    if (l && l.getTime() < fim.getTime()) fim = l;
  }

  if (inicio.getTime() > fim.getTime()) return null;
  return { de: inicio, ate: fim };
}

/** Primeiro dia da competência em UTC — normaliza qualquer data pro dia 1. */
export function competenciaUtc(ano: number, mes: number): Date {
  return new Date(Date.UTC(ano, mes - 1, 1));
}

/**
 * Texto curto pra UI explicando o recorte aplicado — usado nas telas de
 * sincronização pra o contador entender por que pediu 2019-2026 e o robô
 * consultou só parte.
 */
export function descreverRecorte(
  pedido: { de: Date; ate: Date },
  aplicado: { de: Date; ate: Date } | null,
): string | null {
  if (!aplicado) return "Nenhuma competência do intervalo está dentro do período de atendimento.";
  const mesmoInicio = pedido.de.getTime() === aplicado.de.getTime();
  const mesmoFim = pedido.ate.getTime() === aplicado.ate.getTime();
  if (mesmoInicio && mesmoFim) return null;
  const fmt = (d: Date) =>
    `${String(d.getUTCMonth() + 1).padStart(2, "0")}/${d.getUTCFullYear()}`;
  return `Intervalo recortado pelo período de atendimento: ${fmt(aplicado.de)} a ${fmt(aplicado.ate)}.`;
}
