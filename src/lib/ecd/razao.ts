/**
 * Razão contábil por conta a partir do SPED-ECD.
 *
 * Portado de `march_sped.py` (funções `razao_conta` + `localizar_contrapartida`).
 *
 * Duas modalidades, dependendo do tipo de escrituração (I010):
 *
 * - **Tipo G (Diário completo)**: registros I200 (cabeçalho do lançamento) +
 *   I250 (partidas). Razão VERDADEIRO — lançamento a lançamento, com data,
 *   número, histórico, valor D/C, CONTRAPARTIDA (as demais partidas do mesmo
 *   lançamento) e saldo acumulado.
 *
 * - **Tipo R (Diário resumido) / B (Balancetes Diários e Balanços)**:
 *   registros I300 (data) + I310 (deb/cred por conta). Razão só ao nível de
 *   DIA — não temos o lançamento individual. Pra inferir contrapartida
 *   nesses casos, use `localizarContrapartida`.
 */

import {
  ecdInfo,
  lerArquivoLatin1,
  parsePlanoContas,
  type PlanoContaEcd,
} from "./balancete";

// ---------------------------------------------------------------------------
// Utilitários
// ---------------------------------------------------------------------------

function parseNum(s: string | undefined): number {
  const t = (s ?? "").trim();
  if (!t) return 0;
  return Number(t.replace(/\./g, "").replace(",", "."));
}

/** DDMMAAAA → chave numérica AAAAMMDD pra ordenar cronologicamente. */
function chaveData(ddmmaaaa: string): string {
  return `${ddmmaaaa.slice(4, 8)}${ddmmaaaa.slice(2, 4)}${ddmmaaaa.slice(0, 2)}`;
}

// ---------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------

export interface ContrapartidaItem {
  codigo: string;
  descricao: string;
  valor: number;
}

/** Uma entrada do razão em modo LANÇAMENTO (tipo G). */
export interface RazaoLancamento {
  /** DDMMAAAA. */
  data: string;
  numero: string;
  historico: string;
  valor: number;
  /** Débito ou Crédito. */
  dc: "D" | "C";
  /** Outras partidas do mesmo lançamento (lado contrário quando possível). */
  contrapartida: ContrapartidaItem[];
  /** Saldo acumulado da conta (com sinal: D+/C−) após aplicar o lançamento. */
  saldo: number;
}

/** Uma entrada do razão em modo DIÁRIO (tipo R/B). */
export interface RazaoDiario {
  data: string;
  debito: number;
  credito: number;
  /** Saldo acumulado da conta após o dia. */
  saldo: number;
}

export type TipoRazao = "LANCAMENTO" | "DIARIO";

export interface RazaoConta {
  tipoRazao: TipoRazao;
  /** IND_ESC do I010 do arquivo (informa a origem do modo). */
  tipoEscrituracao: "G" | "R" | "B" | null;
  entradas: Array<RazaoLancamento | RazaoDiario>;
  totalDebito: number;
  totalCredito: number;
  saldoFinal: number;
}

// ---------------------------------------------------------------------------
// Razão em modo LANÇAMENTO (I200 + I250)
// ---------------------------------------------------------------------------

interface Partida {
  codigo: string;
  valor: number;
  dc: "D" | "C";
  historico: string;
}

function razaoPorLancamento(
  linhas: string[],
  plano: Map<string, PlanoContaEcd>,
  codConta: string,
): RazaoLancamento[] {
  const entradas: RazaoLancamento[] = [];
  let numero = "";
  let data = "";
  let partidas: Partida[] = [];

  const flush = () => {
    for (const p of partidas) {
      if (p.codigo !== codConta) continue;
      // Contrapartida: partidas do lado OPOSTO. Se não houver (raro), pega qualquer outra.
      let contra: ContrapartidaItem[] = partidas
        .filter((x) => x.codigo !== codConta && x.dc !== p.dc)
        .map((x) => ({
          codigo: x.codigo,
          descricao: plano.get(x.codigo)?.descricao ?? "",
          valor: x.valor,
        }));
      if (contra.length === 0) {
        contra = partidas
          .filter((x) => x.codigo !== codConta)
          .map((x) => ({
            codigo: x.codigo,
            descricao: plano.get(x.codigo)?.descricao ?? "",
            valor: x.valor,
          }));
      }
      entradas.push({
        data,
        numero,
        historico: p.historico,
        valor: p.valor,
        dc: p.dc,
        contrapartida: contra,
        saldo: 0, // preenchido depois
      });
    }
  };

  for (const l of linhas) {
    if (!l.startsWith("|")) continue;
    const p = l.split("|");
    const reg = p[1];
    if (reg === "I200") {
      // |I200|NUM_LCTO|DT_LCTO|VL_LCTO|IND_LCTO|
      flush();
      partidas = [];
      numero = p[2] ?? "";
      data = p[3] ?? "";
    } else if (reg === "I250") {
      // |I250|COD_CTA|COD_CCUS|VL_DC|IND_DC|NUM_ARQ|COD_HIST_PAD|HIST|...
      const cod = p[2] ?? "";
      const valor = parseNum(p[4]);
      const dc = (p[5] === "D" ? "D" : "C") as "D" | "C";
      const hist = p[8] ?? p[7] ?? "";
      partidas.push({ codigo: cod, valor, dc, historico: hist });
    }
  }
  flush();

  // Ordena cronologicamente + por número dentro do mesmo dia
  entradas.sort((a, b) => {
    const ka = chaveData(a.data);
    const kb = chaveData(b.data);
    if (ka !== kb) return ka < kb ? -1 : 1;
    const na = Number(a.numero) || 0;
    const nb = Number(b.numero) || 0;
    return na - nb;
  });

  // Saldo acumulado (D+/C−)
  let saldo = 0;
  for (const e of entradas) {
    saldo += e.dc === "D" ? e.valor : -e.valor;
    e.saldo = Math.round(saldo * 100) / 100;
  }
  return entradas;
}

// ---------------------------------------------------------------------------
// Razão em modo DIÁRIO (I300 + I310)
// ---------------------------------------------------------------------------

function razaoPorDia(linhas: string[], codConta: string): RazaoDiario[] {
  // Mapa data → {debito, credito}
  const porDia = new Map<string, { debito: number; credito: number }>();
  let dia = "";

  for (const l of linhas) {
    if (!l.startsWith("|")) continue;
    const p = l.split("|");
    const reg = p[1];
    if (reg === "I300") {
      dia = p[2] ?? "";
    } else if (reg === "I310") {
      // |I310|NUM_ARQ|COD_CTA|COD_CCUS|VL_DEB|VL_CRED|...
      // A doc do LECD tem variantes; algumas versões usam pos 3 pra COD_CTA sem NUM_ARQ.
      // Padrão mais comum: p[2]=COD_CTA se não houver NUM_ARQ; se houver, é p[3].
      // Vamos tentar detectar: se p[2] for numérico curto (< 6 chars) e p[3] existir com
      // formato de conta, considerar p[3]. Caso contrário, p[2].
      const cod = escolherCodigoI310(p);
      if (cod !== codConta) continue;
      const [vd, vc] = extrairValoresI310(p);
      if (!dia) continue;
      const atual = porDia.get(dia) ?? { debito: 0, credito: 0 };
      atual.debito += vd;
      atual.credito += vc;
      porDia.set(dia, atual);
    }
  }

  const dias = [...porDia.entries()].sort((a, b) =>
    chaveData(a[0]) < chaveData(b[0]) ? -1 : 1,
  );

  const entradas: RazaoDiario[] = [];
  let saldo = 0;
  for (const [data, { debito, credito }] of dias) {
    saldo += debito - credito;
    entradas.push({
      data,
      debito: Math.round(debito * 100) / 100,
      credito: Math.round(credito * 100) / 100,
      saldo: Math.round(saldo * 100) / 100,
    });
  }
  return entradas;
}

/** Heurística: I310 pode ter NUM_ARQ na posição 2 OU não. Detecta olhando p[3]. */
function escolherCodigoI310(p: string[]): string {
  // Layout oficial LECD I310: |I310|NUM_ARQ|COD_CTA|COD_CCUS|VL_DEB|VL_CRED|SLD_FIN|IND_DC_FIN|
  // Alguns geradores omitem NUM_ARQ: |I310|COD_CTA|COD_CCUS|VL_DEB|...
  // Se p[3] for uma string com formato numérico BR (contém vírgula ou ponto de milhar
  // e é claramente um valor), então p[2] é COD_CTA. Senão, p[3] é COD_CTA.
  const p3 = (p[3] ?? "").trim();
  const parecerValor = /^[0-9]{1,3}(\.[0-9]{3})*(,[0-9]+)?$|^[0-9]+,[0-9]+$/.test(p3);
  if (parecerValor || p3 === "") return p[2] ?? "";
  return p[3] ?? "";
}

function extrairValoresI310(p: string[]): [number, number] {
  // Descobre onde estão VL_DEB e VL_CRED dependendo do layout
  // Caso 1: |I310|NUM_ARQ|COD_CTA|COD_CCUS|VL_DEB|VL_CRED| → posições 5,6
  // Caso 2: |I310|COD_CTA|COD_CCUS|VL_DEB|VL_CRED| → posições 4,5
  // Detecta pelo mesmo critério de escolherCodigoI310
  const p3 = (p[3] ?? "").trim();
  const parecerValor = /^[0-9]{1,3}(\.[0-9]{3})*(,[0-9]+)?$|^[0-9]+,[0-9]+$/.test(p3);
  if (parecerValor || p3 === "") {
    return [parseNum(p[4]), parseNum(p[5])];
  }
  return [parseNum(p[5]), parseNum(p[6])];
}

// ---------------------------------------------------------------------------
// Entrada principal
// ---------------------------------------------------------------------------

/**
 * Extrai o razão de uma conta do arquivo SPED-ECD. Detecta automaticamente
 * o modo (LANCAMENTO se houver I200; DIARIO se só houver I300/I310).
 */
export function razaoConta(caminhoArquivo: string, codConta: string): RazaoConta {
  const linhas = lerArquivoLatin1(caminhoArquivo);
  const info = ecdInfo(linhas);
  const plano = parsePlanoContas(linhas);

  // Detecta se há I200 (indicativo de lançamento completo)
  let temI200 = false;
  for (const l of linhas) {
    if (l.startsWith("|I200|")) {
      temI200 = true;
      break;
    }
  }

  if (temI200) {
    const ents = razaoPorLancamento(linhas, plano, codConta);
    return {
      tipoRazao: "LANCAMENTO",
      tipoEscrituracao: info.tipoEscrituracao,
      entradas: ents,
      totalDebito: round2(ents.reduce((s, e) => s + (e.dc === "D" ? e.valor : 0), 0)),
      totalCredito: round2(ents.reduce((s, e) => s + (e.dc === "C" ? e.valor : 0), 0)),
      saldoFinal: ents.length > 0 ? ents[ents.length - 1].saldo : 0,
    };
  }

  const ents = razaoPorDia(linhas, codConta);
  return {
    tipoRazao: "DIARIO",
    tipoEscrituracao: info.tipoEscrituracao,
    entradas: ents,
    totalDebito: round2(ents.reduce((s, e) => s + e.debito, 0)),
    totalCredito: round2(ents.reduce((s, e) => s + e.credito, 0)),
    saldoFinal: ents.length > 0 ? ents[ents.length - 1].saldo : 0,
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

// ---------------------------------------------------------------------------
// Consulta de lançamento por número (só ECD tipo G — I200/I250)
// ---------------------------------------------------------------------------

export interface PartidaLancamento {
  codigo: string;
  descricao: string;
  valor: number;
  historico: string;
}

export interface LancamentoCompleto {
  numero: string;
  /** DDMMAAAA. */
  data: string;
  /** Valor total do lançamento (do I200). */
  valor: number;
  /** true se soma dos débitos == soma dos créditos (dentro da tolerância). */
  balanceado: boolean;
  debitos: PartidaLancamento[];
  creditos: PartidaLancamento[];
}

/**
 * Busca UM lançamento pelo número (só ECD tipo G, I200/I250). Devolve
 * todas as pernas — débitos e créditos — com histórico e validação de
 * partida dobrada. Útil pra ver "n débitos contra n créditos".
 * Retorna null quando o número não existe ou o SPED não tem lançamentos.
 */
export function consultarLancamento(
  caminhoArquivo: string,
  numeroLancamento: string | number,
  tol = 0.02,
): LancamentoCompleto | null {
  const linhas = lerArquivoLatin1(caminhoArquivo);
  const plano = parsePlanoContas(linhas);
  const alvo = String(numeroLancamento);

  let achou = false;
  let coletar = false;
  let numero = "";
  let data = "";
  let valorTotal = 0;
  const partidas: Array<{
    codigo: string;
    valor: number;
    dc: "D" | "C";
    historico: string;
  }> = [];

  for (const l of linhas) {
    if (!l.startsWith("|")) continue;
    const p = l.split("|");
    const reg = p[1];
    if (reg === "I200") {
      if (coletar) break; // já passou do lançamento alvo
      if (p[2] === alvo) {
        coletar = true;
        achou = true;
        numero = p[2] ?? "";
        data = p[3] ?? "";
        valorTotal = parseNum(p[4]);
      }
    } else if (reg === "I250" && coletar) {
      partidas.push({
        codigo: p[2] ?? "",
        valor: parseNum(p[4]),
        dc: (p[5] === "D" ? "D" : "C") as "D" | "C",
        historico: p[8] ?? p[7] ?? "",
      });
    }
  }

  if (!achou) return null;

  const debitos: PartidaLancamento[] = partidas
    .filter((x) => x.dc === "D")
    .map((x) => ({
      codigo: x.codigo,
      descricao: plano.get(x.codigo)?.descricao ?? "",
      valor: round2(x.valor),
      historico: x.historico,
    }));
  const creditos: PartidaLancamento[] = partidas
    .filter((x) => x.dc === "C")
    .map((x) => ({
      codigo: x.codigo,
      descricao: plano.get(x.codigo)?.descricao ?? "",
      valor: round2(x.valor),
      historico: x.historico,
    }));
  const somaD = debitos.reduce((s, x) => s + x.valor, 0);
  const somaC = creditos.reduce((s, x) => s + x.valor, 0);
  const balanceado = Math.abs(somaD - somaC) <= tol;

  return {
    numero,
    data,
    valor: round2(valorTotal),
    balanceado,
    debitos,
    creditos,
  };
}

// ---------------------------------------------------------------------------
// Status/capacidade do arquivo ECD — quais recursos do módulo suporta
// ---------------------------------------------------------------------------

export interface StatusEcd {
  cnpj: string;
  empresa: string;
  /** DDMMAAAA. */
  dtIni: string;
  dtFim: string;
  tipoEscrituracao: "G" | "R" | "B" | null;
  tipoDescricao: string;
  /** True se ECD tipo G — permite razão lançamento a lançamento. */
  suportaRazaoCompleto: boolean;
  /** True se ECD tipo G — permite consulta por número de lançamento. */
  suportaConsultaPorLancamento: boolean;
  /** Mensagem amigável pra exibir no header. */
  mensagem: string;
}

const TIPO_LABEL: Record<string, string> = {
  G: "Diário completo",
  R: "Diário com escrituração resumida",
  B: "Balancetes diários e balanços",
};

/**
 * Analisa o arquivo ECD e devolve suas capacidades pro módulo Razão /
 * Contrapartida. Baseado no tipo I010 (G/R/B).
 */
export function statusEcd(caminhoArquivo: string): StatusEcd {
  const linhas = lerArquivoLatin1(caminhoArquivo);
  const info = ecdInfo(linhas);
  const tipo = info.tipoEscrituracao;
  const completo = tipo === "G";
  return {
    cnpj: info.cnpj,
    empresa: info.nome,
    dtIni: info.dtIni,
    dtFim: info.dtFim,
    tipoEscrituracao: tipo,
    tipoDescricao: tipo ? (TIPO_LABEL[tipo] ?? tipo) : "Desconhecido",
    suportaRazaoCompleto: completo,
    suportaConsultaPorLancamento: completo,
    mensagem: completo
      ? "Razão completo disponível — lançamento a lançamento com contrapartida real."
      : `ECD resumida (tipo ${tipo ?? "?"}): apenas razão por dia. Pra ver o lançamento individual, gere a ECD como tipo G no Domínio (sem transmitir) e reenvie.`,
  };
}

// ---------------------------------------------------------------------------
// Localizar contrapartida (heurística pra ECD tipo R/B)
// ---------------------------------------------------------------------------

export interface CandidatoContrapartida {
  codigo: string;
  descricao: string;
  valor: number;
}

export interface EntradaContrapartida {
  data: string;
  lado: "D" | "C";
  valor: number;
  candidatos: CandidatoContrapartida[];
  status: "exata" | "multiplos" | "nao_localizada";
}

/**
 * Casos onde o SPED é do tipo B (balancetes diários) e não temos os
 * lançamentos individuais: tenta inferir a contrapartida provável casando
 * débitos com créditos de valor igual e do MESMO DIA. É PROPOSTA de
 * conciliação, não a partida oficial.
 */
export function localizarContrapartida(
  caminhoArquivo: string,
  codConta: string,
  tol = 0.02,
  maxCand = 6,
): EntradaContrapartida[] {
  const linhas = lerArquivoLatin1(caminhoArquivo);
  const plano = parsePlanoContas(linhas);

  // Constrói (cod, dia) → (deb, cred)
  const porDia = new Map<string, Array<{ codigo: string; deb: number; cred: number }>>();
  const meus = new Map<string, { deb: number; cred: number }>();
  let dia = "";

  for (const l of linhas) {
    if (!l.startsWith("|")) continue;
    const p = l.split("|");
    const reg = p[1];
    if (reg === "I300") {
      dia = p[2] ?? "";
    } else if (reg === "I310" && dia) {
      const cod = escolherCodigoI310(p);
      const [vd, vc] = extrairValoresI310(p);
      const lista = porDia.get(dia) ?? [];
      lista.push({ codigo: cod, deb: vd, cred: vc });
      porDia.set(dia, lista);
      if (cod === codConta) meus.set(dia, { deb: vd, cred: vc });
    }
  }

  const resultado: EntradaContrapartida[] = [];
  for (const [data, mov] of meus) {
    const outros = (porDia.get(data) ?? []).filter((x) => x.codigo !== codConta);
    for (const [lado, val] of [["D", mov.deb] as const, ["C", mov.cred] as const]) {
      if (val <= tol) continue;
      const cands: CandidatoContrapartida[] = [];
      for (const o of outros) {
        // débito da nossa conta casa com crédito de outra e vice-versa
        const v2 = lado === "D" ? o.cred : o.deb;
        if (v2 > tol && Math.abs(v2 - val) <= Math.max(tol, 0.005 * val)) {
          cands.push({
            codigo: o.codigo,
            descricao: plano.get(o.codigo)?.descricao ?? "",
            valor: round2(v2),
          });
        }
      }
      cands.sort((a, b) => Math.abs(a.valor - val) - Math.abs(b.valor - val));
      const status: EntradaContrapartida["status"] =
        cands.length === 1 ? "exata" : cands.length > 1 ? "multiplos" : "nao_localizada";
      resultado.push({
        data,
        lado,
        valor: round2(val),
        candidatos: cands.slice(0, maxCand),
        status,
      });
    }
  }

  resultado.sort((a, b) => (chaveData(a.data) < chaveData(b.data) ? -1 : 1));
  return resultado;
}
