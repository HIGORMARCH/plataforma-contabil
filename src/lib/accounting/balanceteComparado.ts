/**
 * Comparador de balancetes analíticos entre duas ECDs (ex.: Domínio atual
 * × ECD transmitida à Receita). Conta a conta, por código sequencial do
 * plano — que é a mesma chave nos dois lados quando ambos vêm do Domínio.
 *
 * Portado de `march_sped.py`. Ver [[project-conciliacao-balanco-por-regime]].
 */

import {
  agregarSinteticas,
  estruturaHierarquica,
  type PlanoContaEcd,
  type SaldoContaEcd,
} from "@/lib/ecd/balancete";

/**
 * Rótulo do grupo pra exibição — segue a ordem canônica do balanço
 * patrimonial (Ativo → Passivo → PL). O `ordem` é usado pra ordenar as
 * seções na tela sem hardcoding no componente.
 */
export type GrupoBalancete = "Ativo" | "Passivo" | "Patrimônio Líquido" | "Resultado" | "Outros";

export const ORDEM_GRUPO: Record<GrupoBalancete, number> = {
  Ativo: 1,
  Passivo: 2,
  "Patrimônio Líquido": 3,
  Resultado: 4,
  Outros: 5,
};

/**
 * Naturezas contábeis do SPED-ECD (COD_NAT do I050) que entram por default
 * na comparação. Inclui patrimoniais (Ativo/Passivo/PL) + Resultado (DRE).
 * Compensação (05) e Outras (09) ficam de fora — não somam no balancete
 * de verificação tradicional.
 *
 * COD_NAT do LECD: 01=Ativo, 02=Passivo, 03=Patrimônio Líquido,
 * 04=Resultado, 05=Compensação, 09=Outras.
 */
export const NATUREZAS_PATRIMONIAIS: Record<string, GrupoBalancete> = {
  "01": "Ativo",
  "02": "Passivo",
  "03": "Patrimônio Líquido",
  "04": "Resultado",
};

/** Tolerância de arredondamento (R$). Igual ao script Python original. */
export const TOL = 0.02;

export interface LinhaBalanceteComparado {
  /** Código da conta no plano (COD_CTA do I050 — mesmo nos dois lados). */
  codigo: string;
  /** Descrição da conta (vem do lado que tiver ela — normalmente Domínio). */
  descricao: string;
  /** Grupo pra exibição/filtro. */
  grupo: GrupoBalancete;
  /** Saldos do lado A (Domínio atual). */
  dominio: SaldosNumericos;
  /** Saldos do lado B (ECD transmitida). */
  ecd: SaldosNumericos;
  /** Diferença Domínio − ECD por coluna. */
  diferencas: {
    saldoInicial: number;
    debito: number;
    credito: number;
    saldoFinal: number;
  };
  /** True se qualquer das 4 diferenças exceder a tolerância. */
  divergente: boolean;
}

export interface SaldosNumericos {
  saldoInicial: number;
  debito: number;
  credito: number;
  saldoFinal: number;
}

export interface CompararOpts {
  /** Naturezas a incluir. Default = patrimoniais (Ativo, Passivo/PL). */
  naturezas?: Record<string, GrupoBalancete>;
  /** Tolerância R$. Default = TOL (0.02). */
  tolerancia?: number;
  /** Se true, inclui contas que fecham sem divergência. Default = false (só divergentes). */
  incluirConformes?: boolean;
}

function saldoZero(): SaldosNumericos {
  return { saldoInicial: 0, debito: 0, credito: 0, saldoFinal: 0 };
}

function extrairSaldos(s: SaldoContaEcd | undefined): SaldosNumericos {
  if (!s) return saldoZero();
  return {
    saldoInicial: s.saldoInicial,
    debito: s.debito,
    credito: s.credito,
    saldoFinal: s.saldoFinal,
  };
}

/**
 * Compara dois mapas de saldos por conta. Só analíticas (IND_CTA='A') e só
 * das naturezas informadas (default: patrimoniais). Retorna linhas ordenadas
 * por |dif SF| desc — divergências mais gritantes no topo.
 */
export function compararBalancetes(
  dominio: Map<string, SaldoContaEcd>,
  ecd: Map<string, SaldoContaEcd>,
  opts: CompararOpts = {},
): LinhaBalanceteComparado[] {
  const naturezas = opts.naturezas ?? NATUREZAS_PATRIMONIAIS;
  const tol = opts.tolerancia ?? TOL;
  const incluirConformes = opts.incluirConformes ?? false;

  const codigos = new Set<string>([...dominio.keys(), ...ecd.keys()]);
  const linhas: LinhaBalanceteComparado[] = [];

  for (const cod of codigos) {
    const info = dominio.get(cod) ?? ecd.get(cod);
    if (!info) continue;
    if (info.indicador !== "A") continue;
    const grupo = naturezas[info.natureza];
    if (!grupo) continue;

    const a = extrairSaldos(dominio.get(cod));
    const b = extrairSaldos(ecd.get(cod));
    const difs = {
      saldoInicial: round2(a.saldoInicial - b.saldoInicial),
      debito: round2(a.debito - b.debito),
      credito: round2(a.credito - b.credito),
      saldoFinal: round2(a.saldoFinal - b.saldoFinal),
    };
    const divergente =
      Math.abs(difs.saldoInicial) > tol ||
      Math.abs(difs.debito) > tol ||
      Math.abs(difs.credito) > tol ||
      Math.abs(difs.saldoFinal) > tol;

    if (!divergente && !incluirConformes) continue;

    linhas.push({
      codigo: cod,
      descricao: info.descricao,
      grupo,
      dominio: a,
      ecd: b,
      diferencas: difs,
      divergente,
    });
  }

  linhas.sort((x, y) => Math.abs(y.diferencas.saldoFinal) - Math.abs(x.diferencas.saldoFinal));
  return linhas;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Estatísticas resumo — pro cabeçalho da tela. */
export interface ResumoComparacao {
  totalContasDivergentes: number;
  totalContasConformes: number;
  somaAbsDifSaldoFinal: number;
  maiorDivergenciaValor: number;
  maiorDivergenciaConta: string | null;
}

// ---------------------------------------------------------------------------
// Balancete comparado HIERÁRQUICO — cada linha é uma conta do plano (raízes,
// sintéticas e analíticas), com saldos agregados (sintéticas somam filhas)
// dos dois lados e as diferenças. Preserva a ordem do I050 (DFS).
// ---------------------------------------------------------------------------

/**
 * Status da conta na comparação:
 * - OK: os dois lados batem (dentro da tolerância)
 * - DIVERGENTE: os dois têm valor mas divergem
 * - SO_DOMINIO: só o Domínio tem saldo (Transmitida está zerada)
 * - SO_ECD: só a Transmitida tem saldo (Domínio está zerado)
 * - SINAL_INVERTIDO: os dois têm valor mas em sinais opostos (D vs C)
 * - VAZIO: os dois lados zerados — normalmente não é exibido
 */
export type StatusConta =
  | "OK"
  | "DIVERGENTE"
  | "SO_DOMINIO"
  | "SO_ECD"
  | "SINAL_INVERTIDO"
  | "VAZIO";

export interface LinhaHierarquica {
  codigo: string;
  descricao: string;
  /** Nível na árvore (0 = raiz da natureza; profundidade real do plano). */
  nivel: number;
  /** S=sintética, A=analítica. */
  indicador: "S" | "A";
  natureza: string;
  grupo: GrupoBalancete;
  dominio: SaldosNumericos;
  ecd: SaldosNumericos;
  diferencas: SaldosNumericos;
  /** true se saldo final divergir > TOL. */
  divergente: boolean;
  /** true se qualquer descendente for divergente (útil pra sintéticas). */
  temDescendenteDivergente: boolean;
  /** Status classificado da conta. */
  status: StatusConta;
  /** Códigos dos filhos (na ordem do plano). */
  filhos: string[];
}

/**
 * Classifica o status de uma conta comparando seus saldos finais dos
 * dois lados. Reproduz `_tipo_divergencia` do `march_sped.py`.
 */
export function classificarStatus(
  saldoDominio: number,
  saldoEcd: number,
  tol = TOL,
): StatusConta {
  const dZero = Math.abs(saldoDominio) <= tol;
  const eZero = Math.abs(saldoEcd) <= tol;
  if (dZero && eZero) return "VAZIO";
  if (eZero && !dZero) return "SO_DOMINIO";
  if (dZero && !eZero) return "SO_ECD";
  // Ambos têm valor
  if (saldoDominio * saldoEcd < 0) return "SINAL_INVERTIDO";
  if (Math.abs(saldoDominio - saldoEcd) <= tol) return "OK";
  return "DIVERGENTE";
}

export interface BalanceteComparadoHierarquico {
  /** Linhas em ordem DFS: raiz → filhos. */
  linhas: LinhaHierarquica[];
  /** Mapa rápido codigo → linha. */
  porCodigo: Map<string, LinhaHierarquica>;
}

/**
 * Constrói o balancete hierárquico comparado a partir dos saldos + planos
 * dos dois lados. Agrega sintéticas (soma filhas). Emite linhas em ordem
 * DFS respeitando a ordem original do I050 do lado Domínio (fallback pro
 * lado ECD quando a conta só existe lá).
 */
export function compararBalancetesHierarquico(
  saldosDom: Map<string, SaldoContaEcd>,
  planoDom: Map<string, PlanoContaEcd>,
  saldosEcd: Map<string, SaldoContaEcd>,
  planoEcd: Map<string, PlanoContaEcd>,
  opts: CompararOpts = {},
): BalanceteComparadoHierarquico {
  const naturezas = opts.naturezas ?? NATUREZAS_PATRIMONIAIS;
  const tol = opts.tolerancia ?? TOL;

  // União dos planos — usa Sistema como referência e complementa com ECD.
  // Serve pra decidir QUAIS linhas exibir (a união dos códigos).
  const planoUnificado = new Map<string, PlanoContaEcd>(planoDom);
  for (const [cod, info] of planoEcd) {
    if (!planoUnificado.has(cod)) planoUnificado.set(cod, info);
  }

  // Agrega sintéticas de cada lado usando o PLANO PRÓPRIO daquele lado.
  // Motivo: os planos podem ter hierarquias diferentes (uma analítica que
  // no Sistema está sob CLIENTES pode estar sob DUPLICATAS A RECEBER no
  // ECD Transmitido). Se usássemos plano unificado, contas conhecidas só
  // por um lado seriam somadas no lado errado e zerariam a sintética.
  const agDom = agregarSinteticas(saldosDom, planoDom);
  const agEcd = agregarSinteticas(saldosEcd, planoEcd);
  // Estrutura da árvore usa plano unificado (pra exibir tudo que existe em
  // qualquer um dos lados). Cada linha sai com sua natureza/nível/pai
  // conforme o plano que a definiu (o unificado escolhe Sistema como
  // primário e ECD como complemento).
  const { filhos, raizes } = estruturaHierarquica(planoUnificado);

  const linhas: LinhaHierarquica[] = [];
  const porCodigo = new Map<string, LinhaHierarquica>();

  function dfs(cod: string, nivel: number) {
    const info = planoUnificado.get(cod);
    if (!info) return;
    const grupo = naturezas[info.natureza];
    // Fora dos grupos escolhidos → não descemos.
    if (!grupo) return;

    const a =
      agDom.get(cod) ??
      ({ saldoInicial: 0, debito: 0, credito: 0, saldoFinal: 0 } as SaldosNumericos);
    const b =
      agEcd.get(cod) ??
      ({ saldoInicial: 0, debito: 0, credito: 0, saldoFinal: 0 } as SaldosNumericos);

    const dif: SaldosNumericos = {
      saldoInicial: round2(a.saldoInicial - b.saldoInicial),
      debito: round2(a.debito - b.debito),
      credito: round2(a.credito - b.credito),
      saldoFinal: round2(a.saldoFinal - b.saldoFinal),
    };
    // Divergência tem regras diferentes por grupo:
    //   - PATRIMONIAIS (Ativo/Passivo/PL): só o SALDO FINAL importa. Se ele
    //     bate, é reclassificação (não erro) — regra da memória do escritório.
    //   - RESULTADO (04): SF zera no encerramento pra apuração, então
    //     comparamos o MOVIMENTO ACUMULADO (Deb/Cred). Se qualquer um
    //     diverge > tol, é divergência real.
    const isResultado = info.natureza === "04";
    const divergente = isResultado
      ? Math.abs(dif.debito) > tol ||
        Math.abs(dif.credito) > tol ||
        Math.abs(dif.saldoFinal) > tol
      : Math.abs(dif.saldoFinal) > tol;
    let status = classificarStatus(a.saldoFinal, b.saldoFinal, tol);
    if (status === "VAZIO" && divergente) status = "DIVERGENTE";
    else if (status === "OK" && divergente) status = "DIVERGENTE";

    const filhosCods = filhos.get(cod) ?? [];
    const linha: LinhaHierarquica = {
      codigo: cod,
      descricao: info.descricao,
      nivel,
      indicador: info.indicador,
      natureza: info.natureza,
      grupo,
      dominio: extrairSaldos(agDom.get(cod)),
      ecd: extrairSaldos(agEcd.get(cod)),
      diferencas: dif,
      divergente,
      temDescendenteDivergente: false, // preenchido na volta do DFS
      status,
      filhos: filhosCods,
    };
    linhas.push(linha);
    porCodigo.set(cod, linha);

    for (const f of filhosCods) dfs(f, nivel + 1);
  }

  // Rodar DFS a partir das raízes que caem em grupos patrimoniais
  // Ordena raízes pela ordem canônica (Ativo → Passivo → PL).
  const raizesFiltradas = raizes
    .filter((r) => {
      const info = planoUnificado.get(r);
      return info && naturezas[info.natureza];
    })
    .sort((a, b) => {
      const ga = naturezas[planoUnificado.get(a)!.natureza];
      const gb = naturezas[planoUnificado.get(b)!.natureza];
      return (ORDEM_GRUPO[ga] ?? 99) - (ORDEM_GRUPO[gb] ?? 99);
    });

  for (const r of raizesFiltradas) dfs(r, 0);

  // PROMOÇÃO VISUAL DO PATRIMÔNIO LÍQUIDO
  // Nos planos que não separam PL como natureza 03 (jogam tudo em 02),
  // o PL fica escondido dentro do PASSIVO. Detectamos a sintética cujo
  // nome bate com "PATRIMÔNIO LÍQUIDO" e promovemos ela + descendentes
  // pra ficar como raiz visual (nível 0, grupo "Patrimônio Líquido").
  promoverPatrimonioLiquido(linhas, porCodigo);

  // Segunda passagem: marca temDescendenteDivergente (bottom-up)
  // Rodamos ao contrário — como o DFS já respeita ordem, uma pós-visita
  // com iteração reversa preenche corretamente.
  for (let i = linhas.length - 1; i >= 0; i--) {
    const l = linhas[i];
    if (l.divergente) l.temDescendenteDivergente = true;
    for (const f of l.filhos) {
      const filho = porCodigo.get(f);
      if (filho && (filho.divergente || filho.temDescendenteDivergente)) {
        l.temDescendenteDivergente = true;
        break;
      }
    }
  }

  return { linhas, porCodigo };
}

/** Normaliza descrição sem acento pra matching. */
function normDesc(s: string): string {
  return (s || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Promove a sintética "PATRIMÔNIO LÍQUIDO" (quando aninhada dentro do
 * Passivo) pra raiz visual. Ajusta o nível dela pra 0, dos descendentes
 * pra -offset, e muda o grupo pra "Patrimônio Líquido". Também remove
 * essa subárvore de dentro do Passivo movendo pra o final da lista.
 */
function promoverPatrimonioLiquido(
  linhas: LinhaHierarquica[],
  porCodigo: Map<string, LinhaHierarquica>,
): void {
  const alvos = [
    "PATRIMONIO LIQUIDO",
    "PATRIMONIO L QUIDO",
    "PATRIMONIOLIQUIDO",
  ];

  // Encontra a primeira sintética cujo nome bate
  const idxRaizPL = linhas.findIndex(
    (l) => l.indicador === "S" && alvos.includes(normDesc(l.descricao)),
  );
  if (idxRaizPL < 0) return;

  const raizPL = linhas[idxRaizPL];
  const offset = raizPL.nivel; // nível atual (ex.: 1 se estava dentro do Passivo)
  if (offset === 0) {
    // Já é raiz. Só ajusta grupo.
    raizPL.grupo = "Patrimônio Líquido";
    for (const cod of coletarDescendentes(raizPL, porCodigo)) {
      const l = porCodigo.get(cod);
      if (l) l.grupo = "Patrimônio Líquido";
    }
    return;
  }

  // Coleta a subárvore inteira
  const subCods = [raizPL.codigo, ...coletarDescendentes(raizPL, porCodigo)];
  const subLinhas = subCods
    .map((c) => porCodigo.get(c))
    .filter((l): l is LinhaHierarquica => !!l);

  // Ajusta nível (subtrai offset) e grupo
  for (const l of subLinhas) {
    l.nivel = Math.max(0, l.nivel - offset);
    l.grupo = "Patrimônio Líquido";
  }

  // Remove essas linhas de suas posições atuais e joga tudo pro fim
  const setCods = new Set(subCods);
  const outras = linhas.filter((l) => !setCods.has(l.codigo));
  linhas.length = 0;
  linhas.push(...outras, ...subLinhas);
}

function coletarDescendentes(
  raiz: LinhaHierarquica,
  porCodigo: Map<string, LinhaHierarquica>,
): string[] {
  const resultado: string[] = [];
  function walk(cods: string[]) {
    for (const c of cods) {
      resultado.push(c);
      const filho = porCodigo.get(c);
      if (filho && filho.filhos.length) walk(filho.filhos);
    }
  }
  walk(raiz.filhos);
  return resultado;
}

export function resumirComparacao(linhas: LinhaBalanceteComparado[]): ResumoComparacao {
  let divergentes = 0;
  let conformes = 0;
  let soma = 0;
  let maiorV = 0;
  let maiorC: string | null = null;
  for (const l of linhas) {
    if (l.divergente) {
      divergentes++;
      const abs = Math.abs(l.diferencas.saldoFinal);
      soma += abs;
      if (abs > maiorV) {
        maiorV = abs;
        maiorC = `${l.codigo} — ${l.descricao}`;
      }
    } else {
      conformes++;
    }
  }
  return {
    totalContasDivergentes: divergentes,
    totalContasConformes: conformes,
    somaAbsDifSaldoFinal: round2(soma),
    maiorDivergenciaValor: round2(maiorV),
    maiorDivergenciaConta: maiorC,
  };
}
