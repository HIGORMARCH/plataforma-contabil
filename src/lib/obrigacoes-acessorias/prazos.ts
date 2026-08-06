/**
 * Prazos legais das obrigações acessórias FEDERAIS.
 *
 * v1: só federal (ECD, ECF, EFD-Contribuições). Prazo estadual (EFD-ICMS) fora
 * do escopo — muitos estados estão migrando pra usar o SPED como única obrigação,
 * regras em transição por UF.
 *
 * Todas as datas em UTC (00:00). Compara com Date.getTime() sem se preocupar
 * com timezone.
 */

const FERIADOS_FIXOS: Array<[mes: number, dia: number]> = [
  [1, 1],   // Confraternização Universal
  [4, 21],  // Tiradentes
  [5, 1],   // Dia do Trabalho
  [9, 7],   // Independência
  [10, 12], // N. Sra. Aparecida
  [11, 2],  // Finados
  [11, 15], // Proclamação da República
  [11, 20], // Consciência Negra (feriado nacional a partir de 2024 — Lei 14.759/2023)
  [12, 25], // Natal
];

/**
 * Data de Páscoa Ocidental pelo algoritmo de Meeus/Jones/Butcher.
 * Referência: Astronomical Algorithms, Jean Meeus (1998).
 */
function pascoa(ano: number): Date {
  const a = ano % 19;
  const b = Math.floor(ano / 100);
  const c = ano % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mes = Math.floor((h + l - 7 * m + 114) / 31);
  const dia = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(Date.UTC(ano, mes - 1, dia));
}

function addDias(d: Date, n: number): Date {
  const r = new Date(d.getTime());
  r.setUTCDate(r.getUTCDate() + n);
  return r;
}

function isMesmoDia(a: Date, b: Date): boolean {
  return (
    a.getUTCFullYear() === b.getUTCFullYear() &&
    a.getUTCMonth() === b.getUTCMonth() &&
    a.getUTCDate() === b.getUTCDate()
  );
}

const cacheFeriados = new Map<number, Date[]>();

function feriadosDoAno(ano: number): Date[] {
  const c = cacheFeriados.get(ano);
  if (c) return c;

  const p = pascoa(ano);
  const lista: Date[] = [
    ...FERIADOS_FIXOS.map(([m, d]) => new Date(Date.UTC(ano, m - 1, d))),
    addDias(p, -2),  // Sexta-Feira Santa
    addDias(p, -48), // Carnaval — segunda
    addDias(p, -47), // Carnaval — terça
    addDias(p, +60), // Corpus Christi
  ];
  cacheFeriados.set(ano, lista);
  return lista;
}

/** Consciência Negra só virou feriado nacional em 2024 (Lei 14.759/2023). */
function ehFeriadoNacional(d: Date): boolean {
  if (d.getUTCMonth() === 10 && d.getUTCDate() === 20 && d.getUTCFullYear() < 2024) {
    return false;
  }
  return feriadosDoAno(d.getUTCFullYear()).some((f) => isMesmoDia(f, d));
}

function ehDiaUtil(d: Date): boolean {
  const dow = d.getUTCDay();
  if (dow === 0 || dow === 6) return false; // domingo/sábado
  return !ehFeriadoNacional(d);
}

/** Recua até achar dia útil (inclui o próprio dia se já for útil). */
export function diaUtilAnterior(d: Date): Date {
  let r = d;
  while (!ehDiaUtil(r)) r = addDias(r, -1);
  return r;
}

/** Avança pro próximo dia útil (inclui o próprio dia se já for útil). */
export function diaUtilProximo(d: Date): Date {
  let r = d;
  while (!ehDiaUtil(r)) r = addDias(r, 1);
  return r;
}

/** N-ésimo dia útil do mês (1-indexed). Ex: nEsimoDiaUtilDoMes(2024, 7, 10) = 10º dia útil de julho/2024. */
export function nEsimoDiaUtilDoMes(ano: number, mes1: number, n: number): Date {
  let d = new Date(Date.UTC(ano, mes1 - 1, 1));
  let contados = 0;
  while (true) {
    if (ehDiaUtil(d)) {
      contados++;
      if (contados === n) return d;
    }
    d = addDias(d, 1);
    // sanity: se estourar o mês, o n é maior que o número de dias úteis — retorna último dia do mês
    if (d.getUTCMonth() !== mes1 - 1) {
      return diaUtilAnterior(new Date(Date.UTC(ano, mes1, 0)));
    }
  }
}

/** Último dia útil do mês. */
export function ultimoDiaUtilDoMes(ano: number, mes1: number): Date {
  return diaUtilAnterior(new Date(Date.UTC(ano, mes1, 0)));
}

// ---------------------------------------------------------------------------
// Prazos por obrigação
// ---------------------------------------------------------------------------

/**
 * ECD — Escrituração Contábil Digital.
 * Prazo: último dia útil de MAIO do ano seguinte ao ano-base.
 * IN RFB 2.003/2021, art. 5º.
 */
export function prazoEcd(anoBase: number): Date {
  return ultimoDiaUtilDoMes(anoBase + 1, 5);
}

/**
 * ECF — Escrituração Contábil Fiscal.
 * Prazo: último dia útil de JULHO do ano seguinte ao ano-base.
 * IN RFB 2.004/2021, art. 3º.
 */
export function prazoEcf(anoBase: number): Date {
  return ultimoDiaUtilDoMes(anoBase + 1, 7);
}

/**
 * EFD-Contribuições — PIS/COFINS (e CPRB).
 * Prazo: 10º dia útil do 2º mês subsequente ao mês de apuração.
 * IN RFB 1.252/2012, art. 7º.
 * Ex: competência 05/2024 → 10º dia útil de 07/2024.
 */
export function prazoEfdContribuicoes(anoCompetencia: number, mesCompetencia1: number): Date {
  const mesPrazo = mesCompetencia1 + 2;
  const ano = anoCompetencia + Math.floor((mesPrazo - 1) / 12);
  const mes = ((mesPrazo - 1) % 12) + 1;
  return nEsimoDiaUtilDoMes(ano, mes, 10);
}

/**
 * PGDAS-D — declaração mensal do Simples Nacional.
 * Prazo: até o dia 20 do mês subsequente ao período de apuração. Se cair em
 * fim de semana ou feriado nacional, PRORROGA pro próximo dia útil (LC 123/2006
 * art. 25 § 4º regulamentado pela Resolução CGSN 140/2018 art. 38 § 2º).
 * Ex: competência 05/2024 → 20/06/2024 (quinta), sem alteração.
 */
export function prazoPgdasd(anoCompetencia: number, mesCompetencia1: number): Date {
  const mesPrazo = mesCompetencia1 + 1;
  const ano = anoCompetencia + Math.floor((mesPrazo - 1) / 12);
  const mes = ((mesPrazo - 1) % 12) + 1;
  return diaUtilProximo(new Date(Date.UTC(ano, mes - 1, 20)));
}

/**
 * DEFIS — Declaração de Informações Socioeconômicas e Fiscais (anual do Simples).
 * Prazo: 31 de MARÇO do ano seguinte ao ano-base (Resolução CGSN 140/2018 art. 72).
 * Se cair em fim de semana ou feriado, prorroga pro próximo dia útil.
 */
export function prazoDefis(anoBase: number): Date {
  return diaUtilProximo(new Date(Date.UTC(anoBase + 1, 2, 31)));
}

/**
 * DCTF (antiga, PGD DCTF Mensal) — extinta a partir da competência 01/2024,
 * substituída pela DCTFWeb pra todos os tributos federais. Ainda pode aparecer
 * pra competências ≤ 12/2023.
 * Prazo: 15º dia útil do 2º mês subsequente ao mês do fato gerador.
 * IN RFB 2.005/2021 art. 5º (redação anterior à MP 1.184/2023).
 */
export function prazoDctfAntiga(anoCompetencia: number, mesCompetencia1: number): Date {
  const mesPrazo = mesCompetencia1 + 2;
  const ano = anoCompetencia + Math.floor((mesPrazo - 1) / 12);
  const mes = ((mesPrazo - 1) % 12) + 1;
  return nEsimoDiaUtilDoMes(ano, mes, 15);
}

/**
 * DCTFWeb — obrigatória pra todos os tributos federais desde 01/2024.
 * Prazo: dia 15 do mês subsequente ao mês do fato gerador.
 * Se cair em dia não útil, ANTECIPA pro dia útil imediatamente anterior
 * (regra específica da DCTFWeb — diferente da DCTF antiga que prorroga).
 * IN RFB 2.237/2024 art. 19.
 */
export function prazoDctfWeb(anoCompetencia: number, mesCompetencia1: number): Date {
  const mesPrazo = mesCompetencia1 + 1;
  const ano = anoCompetencia + Math.floor((mesPrazo - 1) / 12);
  const mes = ((mesPrazo - 1) % 12) + 1;
  return diaUtilAnterior(new Date(Date.UTC(ano, mes - 1, 15)));
}

/**
 * MIT — Módulo de Inclusão de Tributos (parte da DCTFWeb desde 01/2024).
 * Serve pra declarar tributos que não vêm de outras escriturações (IRPJ
 * estimativa, IRRF sem retenção via eSocial, IOF, etc.).
 * Prazo: idêntico ao da DCTFWeb.
 */
export const prazoMit = prazoDctfWeb;

export const _testables = { pascoa, ehFeriadoNacional, ehDiaUtil };
