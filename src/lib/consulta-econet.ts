/**
 * Consulta NCM na Econet Editora usando a sessão logada armazenada em Z:.
 *
 * Reproduz o fluxo que descobrimos no scratchpad:
 *  1. GET busca com NCM → retorna hierarquia + radio criptografado
 *  2. POST com radio + acao=abrir → retorna HTML de tributação (com abas)
 *  3. Parse: aba dominante define tipo, natureza extraída da aba correspondente à
 *     atividade do cliente (varejo/atacado/fabricante)
 *
 * Requer sessão logada válida — Higor renova em `Z:\...\config\econet-storage.json`
 * (script `econet-login.py`). Se expirar, a consulta falha com HTTP 401 e a
 * interface avisa pra ele re-logar.
 */

import { readFile } from "node:fs/promises";
import path from "node:path";

const STORAGE_PATH = "Z:\\HIGOR OBRIGACOES MENSAIS\\TRIBUTACAO NCM\\config\\econet-storage.json";
const URL_ECONET = "https://www.econeteditora.com.br/pis_cofins/pis_cofins.php";

export type AtividadeConsulta = "varejo" | "atacado" | "fabricante" | "importador";

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

/** Carrega cookies do storage_state (Playwright JSON) e prepara headers */
async function carregarSessao() {
  let storage: { cookies: Array<{ name: string; value: string; domain: string; path?: string }> };
  try {
    storage = JSON.parse(await readFile(STORAGE_PATH, "utf-8"));
  } catch (e) {
    throw new Error(
      `Sessão Econet não encontrada em ${STORAGE_PATH}. Renove o login executando ` +
        `python "${path.dirname(STORAGE_PATH)}\\econet-login.py"`,
    );
  }
  const cookies = storage.cookies
    .filter((c) => c.domain.includes("econeteditora"))
    .map((c) => `${c.name}=${c.value}`)
    .join("; ");
  return {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/131.0 Safari/537.36",
    "Accept-Language": "pt-BR,pt;q=0.9",
    Referer: "https://www.econeteditora.com.br/novo/index.php",
    Cookie: cookies,
  };
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
  const r = await fetch(url, { ...init, headers });
  if (!r.ok) throw new Error(`HTTP ${r.status} — sessão pode ter expirado`);
  const buf = new Uint8Array(await r.arrayBuffer());
  // decode windows-1252
  let s = "";
  for (const b of buf) s += String.fromCharCode(b);
  return s;
}

/**
 * Consulta um NCM na Econet.
 */
export async function consultarNcmEconet(
  ncm: string,
  atividade: AtividadeConsulta = "varejo",
): Promise<ResultadoConsultaEconet> {
  const headers = await carregarSessao();
  const ncmFmt = `${ncm.slice(0, 4)}.${ncm.slice(4, 6)}.${ncm.slice(6, 8)}`;

  // Etapa 1: GET busca por NCM
  const params = new URLSearchParams({
    "form[ncm]": ncmFmt,
    "form[palavra_chave]": "",
    "form[tipo_busca]": "ncm",
    "form[acao]": "pesquisar",
  });
  const html1 = await fetchLatin1(`${URL_ECONET}?${params.toString()}`, headers);

  const radioValue = extraiCampo(html1, "form[ncm]");
  if (!radioValue) {
    return {
      ncm,
      tipo: "revisar",
      cstEntrada: "",
      cstSaida: "",
      descricaoBase: "",
      natureza: "",
      erro: "NCM não encontrado na Econet",
    };
  }
  const formTime = extraiCampo(html1, "form[time]") ?? "";

  // Etapa 2: POST abrir
  const body = new URLSearchParams({
    "form[ncm]": radioValue,
    "form[acao]": "abrir",
    "form[time]": formTime,
  });
  const html2 = await fetchLatin1(URL_ECONET, headers, {
    method: "POST",
    body: body.toString(),
    headers: { ...headers, "Content-Type": "application/x-www-form-urlencoded", Referer: URL_ECONET },
  });

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
  };
}
