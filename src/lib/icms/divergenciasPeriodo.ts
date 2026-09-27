import { prisma } from "@/lib/db";

/**
 * Divergências de ICMS no período — SPED-Fiscal × GIAM (Domínio e SEFAZ).
 *
 * Mesmo confronto da tela "Auditoria ICMS — SPED-Fiscal + GIAM", só que para
 * vários anos de uma vez e já dizendo onde diverge: a tela mostra as três
 * tabelas lado a lado e deixa a comparação no olho.
 *
 * Regra do confronto: um campo diverge quando, entre as fontes que TÊM aquele
 * valor, o maior e o menor se afastam mais que um centavo. Fonte ausente não
 * conta como divergência — vira "falta" à parte.
 *
 * Até 19/09/2026 o robô do portal SEFAZ não lia saldo credor anterior,
 * deduções nem o imposto a recolher do espelho: gravava zero nos dois primeiros
 * e calculava o terceiro como débito − crédito. Hoje ele lê os itens 6.4, 7.2 e
 * 7.3 do espelho, mas as competências sincronizadas ANTES dessa data continuam
 * no banco com os valores antigos. Comparar esses três campos numa linha velha
 * acusaria divergência em quase todo mês com saldo credor — defeito do robô, não
 * do cliente. Por isso a GIAM SEFAZ só entra nesses campos quando a competência
 * foi sincronizada depois da correção; nas antigas o relatório diz "não lido" e
 * pede a releitura no portal.
 */

export const TOLERANCIA = 0.01;

/** Quando o robô passou a ler a apuração (itens 6.4, 7.2 e 7.3) do espelho. */
export const LEITURA_APURACAO_SEFAZ_DESDE = new Date("2026-09-19T00:00:00.000Z");

export type Fonte = "sped" | "dominio" | "sefaz";

export const ROTULO_FONTE: Record<Fonte, string> = {
  sped: "SPED-Fiscal",
  dominio: "GIAM (Domínio)",
  sefaz: "GIAM (SEFAZ)",
};

export type Campo =
  | "totalCompras"
  | "totalVendas"
  | "creditoEntradas"
  | "debitoSaidas"
  | "saldoCredorAnterior"
  | "deducoes"
  | "icmsARecolher";

export type Grupo = "movimento" | "apuracao";

/**
 * `exigeSefazAtualizada`: campo que só existe nas competências sincronizadas
 * depois de `LEITURA_APURACAO_SEFAZ_DESDE`.
 */
export const CAMPOS: { campo: Campo; rotulo: string; grupo: Grupo; exigeSefazAtualizada: boolean }[] = [
  { campo: "totalCompras", rotulo: "Total compras", grupo: "movimento", exigeSefazAtualizada: false },
  { campo: "totalVendas", rotulo: "Total vendas", grupo: "movimento", exigeSefazAtualizada: false },
  { campo: "creditoEntradas", rotulo: "Crédito entradas", grupo: "apuracao", exigeSefazAtualizada: false },
  { campo: "debitoSaidas", rotulo: "Débito saídas", grupo: "apuracao", exigeSefazAtualizada: false },
  { campo: "saldoCredorAnterior", rotulo: "Saldo credor anterior", grupo: "apuracao", exigeSefazAtualizada: true },
  { campo: "deducoes", rotulo: "Deduções", grupo: "apuracao", exigeSefazAtualizada: true },
  { campo: "icmsARecolher", rotulo: "ICMS a recolher", grupo: "apuracao", exigeSefazAtualizada: true },
];

export type Valores = Record<Campo, number>;

export interface DivergenciaCampo {
  campo: Campo;
  rotulo: string;
  grupo: Grupo;
  valores: Partial<Record<Fonte, number>>;
  /** Maior − menor entre as fontes comparadas. Sempre positiva. */
  diferenca: number;
}

export type StatusCompetencia =
  | "confere" // SPED e GIAM SEFAZ presentes, nada diverge
  | "divergente" // algum campo diverge (mesmo que falte uma fonte)
  | "falta" // falta SPED ou GIAM SEFAZ e o que existe não diverge
  | "fora" // fora do período de atendimento do cliente
  | "futuro" // competência ainda não vencida
  | "vazio"; // nenhuma fonte e nada esperado

export interface CompetenciaIcms {
  ano: number;
  mes: number;
  label: string; // MM/AAAA
  presentes: Record<Fonte, boolean>;
  /** O que cada fonte declarou na competência — base dos totais por ano. */
  valores: Partial<Record<Fonte, Valores>>;
  /** A GIAM SEFAZ desta competência foi lida pelo robô que capta a apuração? */
  sefazApuracaoLida: boolean;
  /** Retificação usada de cada GIAM (a última importada). */
  retificacao: Partial<Record<"dominio" | "sefaz", string>>;
  divergencias: DivergenciaCampo[];
  faltando: Fonte[];
  status: StatusCompetencia;
}

export interface ResumoCampo {
  campo: Campo;
  rotulo: string;
  grupo: Grupo;
  competencias: number;
  somaDiferencas: number;
}

export interface RelatorioIcmsPeriodo {
  anoInicial: number;
  anoFinal: number;
  competencias: CompetenciaIcms[];
  porCampo: ResumoCampo[];
  anosComDados: number[];
}

const chave = (d: Date) => d.getUTCFullYear() * 100 + d.getUTCMonth() + 1;
const pad = (n: number) => String(n).padStart(2, "0");

/** Fica com a maior retificação de cada competência — a retificadora vigente. */
function ultimaPorCompetencia<T extends { periodoApuracao: Date; retificacao: string }>(linhas: T[]) {
  const m = new Map<number, T>();
  for (const l of linhas) {
    const k = chave(l.periodoApuracao);
    const atual = m.get(k);
    if (!atual || l.retificacao > atual.retificacao) m.set(k, l);
  }
  return m;
}

export async function levantarDivergenciasIcms(params: {
  clienteId: string;
  anoInicial: number;
  anoFinal: number;
  /** Primeiro dia do mês corrente — competências a partir dele são "futuro". */
  hoje?: Date;
}): Promise<RelatorioIcmsPeriodo> {
  const { clienteId, anoInicial, anoFinal } = params;
  const inicio = new Date(Date.UTC(anoInicial, 0, 1));
  const fimExcl = new Date(Date.UTC(anoFinal + 1, 0, 1));
  const periodo = { gte: inicio, lt: fimExcl };

  const [cliente, sped, dominio, sefaz, anos] = await Promise.all([
    prisma.cliente.findUniqueOrThrow({
      where: { id: clienteId },
      select: { atendimentoInicio: true, atendimentoFim: true },
    }),
    prisma.spedApuracao.findMany({ where: { clienteId, periodoApuracao: periodo } }),
    prisma.giamApuracao.findMany({
      where: { clienteId, periodoApuracao: periodo },
      include: { icmsARecolher: true },
    }),
    prisma.giamSefazApuracao.findMany({ where: { clienteId, periodoApuracao: periodo } }),
    anosComDadosIcms(clienteId),
  ]);

  const S = new Map(sped.map((a) => [chave(a.periodoApuracao), a]));
  const D = ultimaPorCompetencia(dominio);
  const F = ultimaPorCompetencia(sefaz);

  const agora = params.hoje ?? new Date();
  const mesCorrente = agora.getUTCFullYear() * 100 + agora.getUTCMonth() + 1;
  const atendIni = cliente.atendimentoInicio ? chave(cliente.atendimentoInicio) : null;
  const atendFim = cliente.atendimentoFim ? chave(cliente.atendimentoFim) : null;

  const competencias: CompetenciaIcms[] = [];
  for (let ano = anoInicial; ano <= anoFinal; ano++) {
    for (let mes = 1; mes <= 12; mes++) {
      const k = ano * 100 + mes;
      const s = S.get(k);
      const d = D.get(k);
      const f = F.get(k);

      const valores: Partial<Record<Fonte, Valores>> = {};
      if (s)
        valores.sped = {
          totalCompras: Number(s.totalCompras),
          totalVendas: Number(s.totalVendas),
          creditoEntradas: Number(s.totalCreditos),
          debitoSaidas: Number(s.totalDebitos),
          saldoCredorAnterior: Number(s.saldoCredorAnterior),
          deducoes: Number(s.deducoes),
          icmsARecolher: Number(s.icmsARecolher),
        };
      if (d)
        valores.dominio = {
          totalCompras: Number(d.totalCompras),
          totalVendas: Number(d.totalVendas),
          creditoEntradas: Number(d.creditoEntradas),
          debitoSaidas: Number(d.debitoSaidas),
          saldoCredorAnterior: Number(d.saldoCredorAnterior),
          deducoes: Number(d.deducoes),
          // Só o tipo N do Segmento E é comparável com o E110 do SPED.
          icmsARecolher: d.icmsARecolher
            .filter((l) => l.tipo === "N")
            .reduce((soma, l) => soma + Number(l.valor), 0),
        };
      if (f)
        valores.sefaz = {
          totalCompras: Number(f.totalCompras),
          totalVendas: Number(f.totalVendas),
          creditoEntradas: Number(f.creditoEntradas),
          debitoSaidas: Number(f.debitoSaidas),
          saldoCredorAnterior: Number(f.saldoCredorAnterior),
          deducoes: Number(f.deducoes),
          icmsARecolher: Number(f.icmsARecolherNormal),
        };

      const sefazApuracaoLida = Boolean(f && f.sincronizadoEm >= LEITURA_APURACAO_SEFAZ_DESDE);

      const divergencias: DivergenciaCampo[] = [];
      for (const c of CAMPOS) {
        const doCampo: Partial<Record<Fonte, number>> = {};
        for (const fonte of ["sped", "dominio", "sefaz"] as Fonte[]) {
          if (fonte === "sefaz" && c.exigeSefazAtualizada && !sefazApuracaoLida) continue;
          const v = valores[fonte];
          if (v) doCampo[fonte] = v[c.campo];
        }
        const nums = Object.values(doCampo);
        if (nums.length < 2) continue;
        const diferenca = Math.max(...nums) - Math.min(...nums);
        if (diferenca > TOLERANCIA) {
          divergencias.push({ campo: c.campo, rotulo: c.rotulo, grupo: c.grupo, valores: doCampo, diferenca });
        }
      }

      // Esperadas: as duas declarações entregues aos fiscos. A GIAM do Domínio
      // é só o arquivo local — faltar não é pendência do cliente.
      const faltando: Fonte[] = [];
      if (!s) faltando.push("sped");
      if (!f) faltando.push("sefaz");

      const temAlguma = Boolean(s || d || f);
      const foraAtendimento = (atendIni !== null && k < atendIni) || (atendFim !== null && k > atendFim);

      let status: StatusCompetencia;
      if (divergencias.length > 0) status = "divergente";
      else if (k >= mesCorrente && !temAlguma) status = "futuro";
      else if (foraAtendimento && !temAlguma) status = "fora";
      else if (faltando.length === 0) status = "confere";
      // Ano sem nenhuma apuração importada: nada a cobrar mês a mês (o cliente
      // pode nem existir ou não ser contribuinte do ICMS naquele ano).
      else if (!temAlguma && !anos.includes(ano)) status = "vazio";
      else status = "falta";

      competencias.push({
        ano,
        mes,
        label: `${pad(mes)}/${ano}`,
        presentes: { sped: Boolean(s), dominio: Boolean(d), sefaz: Boolean(f) },
        valores,
        sefazApuracaoLida,
        retificacao: {
          ...(d ? { dominio: d.retificacao } : {}),
          ...(f ? { sefaz: f.retificacao } : {}),
        },
        divergencias,
        faltando: status === "falta" || status === "divergente" ? faltando : [],
        status,
      });
    }
  }

  const porCampo: ResumoCampo[] = CAMPOS.map((c) => {
    const comDiv = competencias.flatMap((x) => x.divergencias.filter((d) => d.campo === c.campo));
    return {
      campo: c.campo,
      rotulo: c.rotulo,
      grupo: c.grupo,
      competencias: comDiv.length,
      somaDiferencas: comDiv.reduce((s, d) => s + d.diferenca, 0),
    };
  });

  return { anoInicial, anoFinal, competencias, porCampo, anosComDados: anos };
}

/** Um total anual de uma fonte: a soma e de quantos meses ela saiu. */
export interface TotalFonte {
  valor: number;
  meses: number;
}

export interface TotalAno {
  /** Ano, ou null na linha do período inteiro. */
  ano: number | null;
  compras: Partial<Record<Fonte, TotalFonte>>;
  vendas: Partial<Record<Fonte, TotalFonte>>;
  /** Maior − menor entre as fontes, quando há mais de uma com o mesmo nº de meses. */
  difCompras: number | null;
  difVendas: number | null;
}

/**
 * Soma compras e vendas por ano, fonte a fonte.
 *
 * A diferença só é calculada entre fontes que cobrem o MESMO número de meses:
 * somar um SPED de 12 meses contra uma GIAM de 11 produziria uma diferença que
 * é só a competência que falta — alarme falso. Quando os meses não batem, a
 * coluna sai vazia e os totais ficam lá para leitura, cada um com seu nº de
 * meses ao lado.
 */
export function totaisPorAno(competencias: CompetenciaIcms[]): TotalAno[] {
  const anos = [...new Set(competencias.map((c) => c.ano))].sort((a, b) => a - b);
  const linhas = anos.map((ano) => montarTotal(ano, competencias.filter((c) => c.ano === ano)));
  if (linhas.length > 1) linhas.push(montarTotal(null, competencias));
  return linhas;
}

function montarTotal(ano: number | null, competencias: CompetenciaIcms[]): TotalAno {
  const acumular = (campo: Campo) => {
    const acc: Partial<Record<Fonte, TotalFonte>> = {};
    for (const c of competencias) {
      for (const fonte of ["sped", "dominio", "sefaz"] as Fonte[]) {
        const v = c.valores[fonte];
        if (!v) continue;
        const atual = acc[fonte] ?? { valor: 0, meses: 0 };
        acc[fonte] = { valor: atual.valor + v[campo], meses: atual.meses + 1 };
      }
    }
    return acc;
  };
  const compras = acumular("totalCompras");
  const vendas = acumular("totalVendas");
  return { ano, compras, vendas, difCompras: diferencaComparavel(compras), difVendas: diferencaComparavel(vendas) };
}

function diferencaComparavel(totais: Partial<Record<Fonte, TotalFonte>>): number | null {
  const lista = Object.values(totais);
  if (lista.length < 2) return null;
  const meses = lista[0].meses;
  if (lista.some((t) => t.meses !== meses)) return null;
  const valores = lista.map((t) => t.valor);
  return Math.max(...valores) - Math.min(...valores);
}

/** Anos em que o cliente tem qualquer apuração de ICMS importada. */
export async function anosComDadosIcms(clienteId: string): Promise<number[]> {
  const [s, d, f] = await Promise.all([
    prisma.spedApuracao.findMany({ where: { clienteId }, select: { periodoApuracao: true } }),
    prisma.giamApuracao.findMany({ where: { clienteId }, select: { periodoApuracao: true } }),
    prisma.giamSefazApuracao.findMany({ where: { clienteId }, select: { periodoApuracao: true } }),
  ]);
  return [...new Set([...s, ...d, ...f].map((x) => x.periodoApuracao.getUTCFullYear()))].sort((a, b) => a - b);
}
