/**
 * Consulta NCM na Econet Editora usando a sessão logada do escritório.
 *
 * Fluxo do site:
 *  1. GET busca com NCM → retorna hierarquia + radio criptografado
 *  2. POST com radio + acao=abrir → retorna HTML de tributação (com abas)
 *  3. Parse: aba dominante define tipo, natureza extraída da aba correspondente à
 *     atividade do cliente (varejo/atacado/fabricante)
 *
 * A sessão vem do banco (`src/lib/econet-sessao.ts`) — quem chama abre uma vez
 * e reusa no lote inteiro. Renovar a sessão é ato humano: o login da Econet tem
 * CAPTCHA e a plataforma não o resolve.
 *
 * REGRA DE OURO DESTE MÓDULO: nunca devolver classificação que não foi lida de
 * verdade. Toda falha sai com `diagnostico` dizendo QUAL falha foi — ver o bloco
 * sobre os três modos de falha em `diagnosticarPagina`.
 */

import type { SessaoEconet } from "./econet-sessao";

/**
 * Página de consulta de PIS/COFINS por NCM. Serve também de porta de entrada
 * do login assistido: sem sessão, a Econet responde a tela de login nesta
 * mesma URL — então não precisamos saber onde fica a tela de login dela.
 */
export const URL_ECONET = "https://www.econeteditora.com.br/pis_cofins/pis_cofins.php";

export type AtividadeConsulta = "varejo" | "atacado" | "fabricante" | "importador";

/**
 * Por que a consulta não deu certo — ou `OK` quando deu.
 *
 * Antes de 19/08/2026 os três primeiros casos abaixo produziam a MESMA
 * mensagem ("NCM não encontrado"), e foi exatamente isso que deixou a sessão
 * vencida de 17/07 passar um mês despercebida: 70 consultas "falharam" com o
 * texto que a gente lia como resposta legítima do site.
 */
export type DiagnosticoEconet =
  | "OK"
  /** Não há sessão cadastrada — ninguém logou ainda nesta instalação. */
  | "SESSAO_AUSENTE"
  /** A Econet devolveu tela de login: a sessão venceu. Ação: renovar. */
  | "SESSAO_EXPIRADA"
  /** A busca funcionou e o site respondeu que este NCM não existe. Dado legítimo. */
  | "NCM_INEXISTENTE"
  /** Logado, página veio, mas não tem o que esperávamos. Ação: avisar o dev. */
  | "LAYOUT_MUDOU"
  /** Erro de rede/HTTP antes de qualquer página. */
  | "ERRO_REDE";

export interface ResultadoConsultaEconet {
  ncm: string;
  tipo: "aliquota_zero" | "monofasico" | "isenta" | "substituicao" | "normal" | "revisar";
  cstEntrada: string;
  cstSaida: string;
  descricaoBase: string;
  natureza: string;
  abaUsada?: string;
  todasAbas?: string[];
  observacao?: string;
  diagnostico: DiagnosticoEconet;
  erro?: string;
}

// Regras Autmais oficiais — bate com base seed
const TIPO_CFG: Record<string, { cstE: string; cstS: string; desc: string }> = {
  aliquota_zero: { cstE: "73", cstS: "6", desc: "ALIQUOTA ZERO" },
  monofasico: { cstE: "70", cstS: "4", desc: "MONOFASICO" },
  isenta: { cstE: "71", cstS: "7", desc: "ISENTA" },
  substituicao: { cstE: "75", cstS: "5", desc: "SUBSTITUICAO" },
  normal: { cstE: "50", cstS: "1", desc: "Tributacao Normal" },
};

const ABA_TIPO: Array<{ kws: string[]; tipo: keyof typeof TIPO_CFG }> = [
  { kws: ["substituicao"], tipo: "substituicao" },
  { kws: ["monofasico"], tipo: "monofasico" },
  { kws: ["aliquota zero"], tipo: "aliquota_zero" },
  { kws: ["isenta", "isencao"], tipo: "isenta" },
];

const PRECEDENCIA: Array<keyof typeof TIPO_CFG> = ["substituicao", "monofasico", "aliquota_zero", "isenta"];

const SUFIXOS_ATIVIDADE: Record<AtividadeConsulta, string[]> = {
  varejo: ["varejo"],
  atacado: ["atacado"],
  fabricante: ["importador", "fabricante"],
  importador: ["importador", "fabricante"],
};

function semAcento(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

function falha(
  ncm: string,
  diagnostico: DiagnosticoEconet,
  erro: string,
  extra?: Partial<ResultadoConsultaEconet>,
): ResultadoConsultaEconet {
  return {
    ncm,
    tipo: "revisar",
    cstEntrada: "",
    cstSaida: "",
    descricaoBase: "",
    natureza: "",
    diagnostico,
    erro,
    ...extra,
  };
}

/**
 * Classifica o que veio na resposta, SEM depender do layout exato da Econet.
 *
 * As duas âncoras usadas são estruturais, não cosméticas:
 *  - a tela de busca sempre traz os campos `form[tipo_busca]` / `form[palavra_chave]`;
 *  - a tela de login sempre traz um `<input type="password">`.
 *
 * Daí saem os três estados que antes se confundiam:
 *
 *  | tem senha | tem busca | significado                                  |
 *  |-----------|-----------|----------------------------------------------|
 *  | sim       | não       | caiu no login → SESSÃO EXPIRADA              |
 *  | não/sim   | sim       | estamos dentro do sistema, busca respondeu   |
 *  | não       | não       | nem login nem busca → LAYOUT MUDOU           |
 *
 * O campo de senha sozinho não basta pra concluir "login": se a página também
 * traz o formulário de busca, é uma tela interna com área de assinante no
 * cabeçalho, e continuamos logados.
 */
export function diagnosticarPagina(html: string): "logado" | "login" | "desconhecido" {
  const temBusca =
    /name=["']form\[tipo_busca\]["']/i.test(html) || /name=["']form\[palavra_chave\]["']/i.test(html);
  if (temBusca) return "logado";
  const temSenha = /<input[^>]*type=["']password["']/i.test(html);
  if (temSenha) return "login";
  return "desconhecido";
}

function extraiCampo(html: string, name: string): string | null {
  const re = new RegExp(`<input[^>]*name=["']${name.replace(/[[\]]/g, "\\$&")}["'][^>]*value=["']([^"']+)["']`, "i");
  const m = html.match(re);
  return m ? m[1] : null;
}

function extraiAbas(html: string): string[] {
  const abas: string[] = [];
  const re = /<li[^>]*class=["'][^"']*TabbedPanelsTab[^"']*["'][^>]*>([^<]+)<\/li>/gi;
  for (const m of html.matchAll(re)) {
    abas.push(m[1].trim());
  }
  return abas;
}

function extraiConteudoAba(html: string, indice: number): string {
  const re = /<div[^>]*class=["'][^"']*TabbedPanelsContent[^"']*["'][^>]*>([\s\S]*?)<\/div>\s*(?=<div[^>]*class=["'][^"']*TabbedPanelsContent|<\/div>\s*<\/div>|$)/gi;
  const all = [...html.matchAll(re)];
  return all[indice]?.[1] ?? "";
}

function extraiNatureza(htmlAba: string): string {
  const texto = htmlAba.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
  const m = texto.match(/natureza da receita.{0,400}?regime cumulativo\s*:\s*(\d{2,4})/i);
  return m ? m[1] : "";
}

async function fetchLatin1(url: string, headers: Record<string, string>, init?: RequestInit): Promise<string> {
  // ⚠️ Os headers do `init` TÊM PRECEDÊNCIA sobre os da sessão.
  //
  // Antes era `{ ...init, headers }`, com o `headers` depois do spread — o que
  // descartava silenciosamente os headers passados no init. Na prática, matava
  // o `Content-Type: application/x-www-form-urlencoded` do POST da etapa 2:
  // sem ele o PHP não parseia o corpo, `$_POST` chega vazio e o site devolve a
  // TELA DE BUSCA em vez do resultado.
  //
  // O efeito era invisível — HTTP 200, HTML válido, só que sem as abas. Como o
  // parser tratava "sem aba" como tributação normal, TODO NCM consultado voltava
  // "Tributacao Normal - 0". Ao corrigir, a resposta do mesmo NCM saltou de
  // 15 KB para 83 KB, com as TabbedPanels no lugar.
  const r = await fetch(url, {
    ...init,
    headers: { ...headers, ...((init?.headers as Record<string, string>) ?? {}) },
  });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const buf = new Uint8Array(await r.arrayBuffer());
  // decode windows-1252
  let s = "";
  for (const b of buf) s += String.fromCharCode(b);
  return s;
}

/**
 * Consulta um NCM na Econet usando uma sessão já aberta.
 *
 * @param sessao Sessão carregada com `carregarSessaoEconet()` — abra uma vez
 *               por lote; decifrar custa scrypt e não vale por NCM.
 */
export async function consultarNcmEconet(
  ncm: string,
  atividade: AtividadeConsulta,
  sessao: SessaoEconet,
): Promise<ResultadoConsultaEconet> {
  const headers = sessao.headers;
  const ncmFmt = `${ncm.slice(0, 4)}.${ncm.slice(4, 6)}.${ncm.slice(6, 8)}`;

  // ---- Etapa 1: GET busca por NCM ----
  const params = new URLSearchParams({
    "form[ncm]": ncmFmt,
    "form[palavra_chave]": "",
    "form[tipo_busca]": "ncm",
    "form[acao]": "pesquisar",
  });

  let html1: string;
  try {
    html1 = await fetchLatin1(`${URL_ECONET}?${params.toString()}`, headers);
  } catch (e) {
    return falha(ncm, "ERRO_REDE", `Não foi possível falar com a Econet: ${e instanceof Error ? e.message : String(e)}`);
  }

  const estado1 = diagnosticarPagina(html1);
  if (estado1 === "login") {
    return falha(
      ncm,
      "SESSAO_EXPIRADA",
      "A Econet devolveu a tela de login — a sessão venceu. Renove em Administração > Configurações.",
    );
  }
  if (estado1 === "desconhecido") {
    return falha(
      ncm,
      "LAYOUT_MUDOU",
      "A Econet respondeu uma página que não é nem o login nem a busca. O layout do site provavelmente mudou.",
    );
  }

  const radioValue = extraiCampo(html1, "form[ncm]");
  if (!radioValue) {
    // Busca respondeu e não trouxe o NCM: resposta legítima do site.
    return falha(ncm, "NCM_INEXISTENTE", "NCM não encontrado na Econet");
  }
  const formTime = extraiCampo(html1, "form[time]") ?? "";

  // ---- Etapa 2: POST abrir ----
  const body = new URLSearchParams({
    "form[ncm]": radioValue,
    "form[acao]": "abrir",
    "form[time]": formTime,
  });

  let html2: string;
  try {
    html2 = await fetchLatin1(URL_ECONET, headers, {
      method: "POST",
      body: body.toString(),
      headers: { ...headers, "Content-Type": "application/x-www-form-urlencoded", Referer: URL_ECONET },
    });
  } catch (e) {
    return falha(ncm, "ERRO_REDE", `Falha ao abrir a tributação do NCM: ${e instanceof Error ? e.message : String(e)}`);
  }

  if (diagnosticarPagina(html2) === "login") {
    return falha(ncm, "SESSAO_EXPIRADA", "A sessão venceu no meio da consulta. Renove e tente de novo.");
  }

  // Parse: abas + tipo por precedência
  const abas = extraiAbas(html2);
  const abasNorm = abas.map(semAcento);
  const tiposDetectados: Array<keyof typeof TIPO_CFG> = [];
  for (const { kws, tipo } of ABA_TIPO) {
    if (abasNorm.some((a) => kws.some((k) => a.includes(k)))) {
      tiposDetectados.push(tipo);
    }
  }
  tiposDetectados.sort(
    (a, b) => (PRECEDENCIA.indexOf(a) === -1 ? 99 : PRECEDENCIA.indexOf(a)) - (PRECEDENCIA.indexOf(b) === -1 ? 99 : PRECEDENCIA.indexOf(b)),
  );

  // ⚠️ DISTINÇÃO CRÍTICA (16/08/2026).
  //
  // Antes, qualquer resultado sem aba correspondente virava "normal". Isso
  // confundia dois casos MUITO diferentes:
  //
  //   a) a página veio e nenhuma aba é de regime especial → é tributação
  //      normal de verdade, conclusão legítima;
  //   b) a página não veio (layout mudou, sessão sem acesso ao conteúdo) →
  //      não sabemos nada, e responder "normal" é ADIVINHAR.
  //
  // O caso (b) chegou a acontecer em produção: 69 NCMs seguidos voltaram
  // "Tributacao Normal - 0" com ZERO abas, incluindo xampu (monofásico
  // clássico). Gravar isso na NcmBase — que é compartilhada entre escritórios —
  // teria transformado produto de alíquota zero em tributado para todo mundo.
  if (abas.length === 0) {
    return falha(
      ncm,
      "LAYOUT_MUDOU",
      "Econet não devolveu as abas de tributação — não é possível classificar. " +
        "A sessão está viva, então ou este NCM abre num formato diferente, ou o layout do site mudou.",
      { todasAbas: [] },
    );
  }

  const tipoEscolhido = (tiposDetectados[0] ?? "normal") as keyof typeof TIPO_CFG;
  const cfg = TIPO_CFG[tipoEscolhido];

  // Natureza: escolhe a aba apropriada
  let idxAbaAlvo = -1;
  let abaUsada = "";
  if (tipoEscolhido === "monofasico") {
    // escolhe a aba com o sufixo da atividade (Varejo, Atacado, Importador/Fabricante)
    const sufixos = SUFIXOS_ATIVIDADE[atividade];
    idxAbaAlvo = abasNorm.findIndex((a) => a.includes("monofasico") && sufixos.some((s) => a.includes(s)));
    if (idxAbaAlvo === -1) idxAbaAlvo = abasNorm.findIndex((a) => a.includes("monofasico"));
  } else {
    const kws = ABA_TIPO.find((r) => r.tipo === tipoEscolhido)?.kws ?? [];
    idxAbaAlvo = abasNorm.findIndex((a) => kws.some((k) => a.includes(k)));
  }

  let natureza = tipoEscolhido === "normal" ? "0" : "";
  if (idxAbaAlvo >= 0) {
    abaUsada = abas[idxAbaAlvo];
    const conteudo = extraiConteudoAba(html2, idxAbaAlvo);
    natureza = extraiNatureza(conteudo) || natureza;
  }

  return {
    ncm,
    tipo: tipoEscolhido as "aliquota_zero" | "monofasico" | "isenta" | "substituicao" | "normal" | "revisar",
    cstEntrada: cfg.cstE,
    cstSaida: cfg.cstS,
    descricaoBase: cfg.desc,
    natureza,
    abaUsada,
    todasAbas: abas,
    diagnostico: "OK",
  };
}
