/**
 * Parser do SPED-ECD focado no BALANCETE ANALÍTICO — I050 (plano de contas)
 * e I150/I155 (saldos periódicos).
 *
 * Convenção de sinal: DEVEDOR = positivo, CREDOR = negativo. Assim a
 * comparação entre bases fica objetiva independente do grupo contábil.
 *
 * Portado de `march_sped.py` (agente contábil) — ver
 * [[project-conciliacao-balanco-por-regime]].
 */

import { readFileSync } from "node:fs";

// ---------------------------------------------------------------------------
// Layouts
// ---------------------------------------------------------------------------
// 0000: |0000|LECD|DT_INI|DT_FIN|NOME|CNPJ|...
// I010: |I010|IND_ESC (G=Diário completo, R=Diário resumido, B=Balancetes)|COD_VER_LC|
// I050: |I050|DT_ALT|COD_NAT|IND_CTA|NIVEL|COD_CTA|COD_CTA_SUP|CTA|
// I150: |I150|DT_INI|DT_FIN|
// I155: |I155|COD_CTA|CCUS|VL_SLD_INI|IND_DC_INI|VL_DEB|VL_CRED|VL_SLD_FIN|IND_DC_FIN|

export interface EcdInfo {
  cnpj: string;
  nome: string;
  /** DT_INI no formato DDMMAAAA. */
  dtIni: string;
  /** DT_FIN no formato DDMMAAAA. */
  dtFim: string;
  /** IND_ESC do I010: G=Diário completo, R=Diário resumido, B=Balancetes. */
  tipoEscrituracao: "G" | "R" | "B" | null;
}

export interface PlanoContaEcd {
  /** COD_NAT: 01=Ativo, 02=Passivo/PL, 03=PL, 04=Contas de Resultado, 05=Compensação, 09=Outras. */
  natureza: string;
  /** IND_CTA: S=sintética, A=analítica. */
  indicador: "S" | "A";
  /** Nível hierárquico. */
  nivel: number;
  /** Descrição / nome da conta. */
  descricao: string;
  /** COD_CTA_SUP — código da conta pai (sintética que agrupa). */
  contaSuperior: string;
}

export interface SaldoContaEcd {
  natureza: string;
  indicador: "S" | "A";
  descricao: string;
  /** Saldo inicial do exercício (com sinal: D=+, C=−). */
  saldoInicial: number;
  /** Débito acumulado no exercício. */
  debito: number;
  /** Crédito acumulado no exercício. */
  credito: number;
  /** Saldo final do exercício (com sinal: D=+, C=−). */
  saldoFinal: number;
}

/** Lê o arquivo em Latin1 e devolve iterador de linhas (não decodifica UTF-8). */
export function lerArquivoLatin1(caminho: string): string[] {
  return readFileSync(caminho).toString("latin1").split(/\r?\n/);
}

/**
 * Converte número no formato brasileiro do SPED ('1.234.567,89') pra float.
 * Vazio → 0.
 */
function parseNum(s: string | undefined): number {
  const t = (s ?? "").trim();
  if (!t) return 0;
  return Number(t.replace(/\./g, "").replace(",", "."));
}

/** Formata AAAA/MM em DDMMAAAA (fim do mês) — auxiliar. Retorna o último dia. */
function ultimoDiaDoMes(ano: number, mes: number): string {
  const dia = new Date(ano, mes, 0).getDate();
  return `${String(dia).padStart(2, "0")}${String(mes).padStart(2, "0")}${ano}`;
}

/** Extrai o cabeçalho da ECD (registro 0000 + I010). */
export function ecdInfo(linhas: string[]): EcdInfo {
  const info: EcdInfo = {
    cnpj: "",
    nome: "",
    dtIni: "",
    dtFim: "",
    tipoEscrituracao: null,
  };
  for (const l of linhas) {
    if (!l.startsWith("|")) continue;
    const p = l.split("|");
    const reg = p[1];
    if (reg === "0000") {
      info.dtIni = p[3] ?? "";
      info.dtFim = p[4] ?? "";
      info.nome = p[5] ?? "";
      info.cnpj = p[6] ?? "";
    } else if (reg === "I010") {
      const t = p[2];
      if (t === "G" || t === "R" || t === "B") info.tipoEscrituracao = t;
      break; // 0000 vem antes de I010; se achamos I010, temos tudo
    }
  }
  return info;
}

/** Constrói o plano de contas a partir dos registros I050. */
export function parsePlanoContas(linhas: string[]): Map<string, PlanoContaEcd> {
  const plano = new Map<string, PlanoContaEcd>();
  for (const l of linhas) {
    if (!l.startsWith("|I050|")) continue;
    const p = l.split("|");
    const cod = p[6] ?? "";
    if (!cod) continue;
    const ind = p[4] === "A" ? "A" : "S";
    plano.set(cod, {
      natureza: p[3] ?? "",
      indicador: ind as "S" | "A",
      nivel: Number(p[5] ?? "0") || 0,
      descricao: p[8] ?? "",
      contaSuperior: p[7] ?? "",
    });
  }
  return plano;
}

export interface SaldosOpts {
  /**
   * DT_FIN do PRIMEIRO período no arquivo — de onde vem o VL_SLD_INI do ano.
   * Default: 31 do PRIMEIRO mês do exercício (extraído do registro 0000).
   */
  dtFinPrimeiroPeriodo?: string;
  /**
   * DT_FIN do ÚLTIMO período — de onde vem o VL_SLD_FIN do ano.
   * Default: DT_FIN do registro 0000 (fim do exercício).
   */
  dtFinUltimoPeriodo?: string;
}

/**
 * Parseia I150 (período) + I155 (saldo periódico) e devolve saldos anuais
 * por conta. Débito/crédito são ACUMULADOS no ano; SI e SF vêm do primeiro
 * e do último período respectivamente.
 *
 * Convenção de sinal: D → +, C → −.
 */
export function parseSaldosAnuais(
  linhas: string[],
  opts: SaldosOpts = {},
): Map<string, SaldoContaEcd> {
  const plano = parsePlanoContas(linhas);
  const info = ecdInfo(linhas);

  // Default dos períodos: primeiro mês do exercício e último mês do exercício.
  let dtFinPrimeiro = opts.dtFinPrimeiroPeriodo;
  let dtFinUltimo = opts.dtFinUltimoPeriodo;
  if (!dtFinPrimeiro && info.dtIni.length === 8) {
    const mes = Number(info.dtIni.slice(2, 4));
    const ano = Number(info.dtIni.slice(4, 8));
    dtFinPrimeiro = ultimoDiaDoMes(ano, mes);
  }
  if (!dtFinUltimo && info.dtFim.length === 8) {
    dtFinUltimo = info.dtFim;
  }

  const si = new Map<string, number>();
  const sf = new Map<string, number>();
  const deb = new Map<string, number>();
  const cred = new Map<string, number>();
  let periodo: string | null = null;

  for (const l of linhas) {
    if (!l.startsWith("|")) continue;
    const p = l.split("|");
    const reg = p[1];
    if (reg === "I150") {
      periodo = p[3] ?? null;
    } else if (reg === "I155") {
      const cc = p[2] ?? "";
      if (!cc) continue;
      deb.set(cc, (deb.get(cc) ?? 0) + parseNum(p[6]));
      cred.set(cc, (cred.get(cc) ?? 0) + parseNum(p[7]));
      if (periodo === dtFinPrimeiro) {
        const v = parseNum(p[4]);
        si.set(cc, p[5] === "D" ? v : -v);
      }
      if (periodo === dtFinUltimo) {
        const v = parseNum(p[8]);
        sf.set(cc, p[9] === "D" ? v : -v);
      }
    }
  }

  const saldos = new Map<string, SaldoContaEcd>();
  for (const [cod, m] of plano) {
    saldos.set(cod, {
      natureza: m.natureza,
      indicador: m.indicador,
      descricao: m.descricao,
      saldoInicial: si.get(cod) ?? 0,
      debito: deb.get(cod) ?? 0,
      credito: cred.get(cod) ?? 0,
      saldoFinal: sf.get(cod) ?? 0,
    });
  }
  return saldos;
}

/** Atalho: lê + parseia num passo só. */
export function parseSaldosDeArquivo(
  caminho: string,
  opts?: SaldosOpts,
): {
  info: EcdInfo;
  saldos: Map<string, SaldoContaEcd>;
  plano: Map<string, PlanoContaEcd>;
} {
  const linhas = lerArquivoLatin1(caminho);
  return {
    info: ecdInfo(linhas),
    saldos: parseSaldosAnuais(linhas, opts),
    plano: parsePlanoContas(linhas),
  };
}

/**
 * Agrega saldos de contas SINTÉTICAS somando as descendentes (DFS via
 * COD_CTA_SUP). Portado de `balancete_anual` do agente contábil.
 *
 * Contas analíticas mantêm o saldo original (o `saldos` já traz elas
 * populadas). Sintéticas são recalculadas a partir dos filhos —
 * ignoramos o saldo declarado na sintética e usamos SOMA das folhas.
 * Isso dá o valor correto mesmo quando o SPED só declarou saldos nas
 * analíticas.
 */
export function agregarSinteticas(
  saldos: Map<string, SaldoContaEcd>,
  plano: Map<string, PlanoContaEcd>,
): Map<string, SaldoContaEcd> {
  // Mapa pai → filhos
  const filhos = new Map<string, string[]>();
  for (const [cod, info] of plano) {
    const sup = info.contaSuperior;
    if (sup && plano.has(sup)) {
      if (!filhos.has(sup)) filhos.set(sup, []);
      filhos.get(sup)!.push(cod);
    }
  }

  const agregado = new Map<string, SaldoContaEcd>();

  function calcular(cod: string): SaldoContaEcd {
    const cached = agregado.get(cod);
    if (cached) return cached;
    const info = plano.get(cod);
    if (!info) {
      const vazio: SaldoContaEcd = {
        natureza: "",
        indicador: "A",
        descricao: cod,
        saldoInicial: 0,
        debito: 0,
        credito: 0,
        saldoFinal: 0,
      };
      agregado.set(cod, vazio);
      return vazio;
    }
    if (info.indicador === "A") {
      const s =
        saldos.get(cod) ??
        ({
          natureza: info.natureza,
          indicador: "A",
          descricao: info.descricao,
          saldoInicial: 0,
          debito: 0,
          credito: 0,
          saldoFinal: 0,
        } as SaldoContaEcd);
      agregado.set(cod, s);
      return s;
    }
    // Sintética: soma filhos
    const kids = filhos.get(cod) ?? [];
    let si = 0,
      deb = 0,
      cred = 0,
      sf = 0;
    for (const k of kids) {
      const kSaldo = calcular(k);
      si += kSaldo.saldoInicial;
      deb += kSaldo.debito;
      cred += kSaldo.credito;
      sf += kSaldo.saldoFinal;
    }
    const result: SaldoContaEcd = {
      natureza: info.natureza,
      indicador: "S",
      descricao: info.descricao,
      saldoInicial: si,
      debito: deb,
      credito: cred,
      saldoFinal: sf,
    };
    agregado.set(cod, result);
    return result;
  }

  for (const cod of plano.keys()) calcular(cod);
  return agregado;
}

export interface FilhosMap {
  filhos: Map<string, string[]>;
  raizes: string[];
}

/** Devolve mapa pai→filhos e lista de raízes (contas sem pai válido). */
export function estruturaHierarquica(plano: Map<string, PlanoContaEcd>): FilhosMap {
  const filhos = new Map<string, string[]>();
  const raizes: string[] = [];
  const ordem = [...plano.keys()];
  const posicao = new Map<string, number>();
  ordem.forEach((c, i) => posicao.set(c, i));

  for (const [cod, info] of plano) {
    const sup = info.contaSuperior;
    if (sup && plano.has(sup)) {
      if (!filhos.has(sup)) filhos.set(sup, []);
      filhos.get(sup)!.push(cod);
    } else {
      raizes.push(cod);
    }
  }
  // Ordena filhos e raízes pela posição original no I050
  for (const [k, arr] of filhos) {
    arr.sort((a, b) => (posicao.get(a) ?? 0) - (posicao.get(b) ?? 0));
    filhos.set(k, arr);
  }
  raizes.sort((a, b) => (posicao.get(a) ?? 0) - (posicao.get(b) ?? 0));
  return { filhos, raizes };
}
