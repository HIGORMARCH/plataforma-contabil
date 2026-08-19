/**
 * Sessão logada da Econet — guardada no banco, não em arquivo de rede.
 *
 * HISTÓRICO (por que isto existe):
 * Até 18/08/2026 os cookies viviam em
 * `Z:\HIGOR OBRIGACOES MENSAIS\TRIBUTACAO NCM\config\econet-storage.json`,
 * gerados por um script Python (`econet-login.py`) que rodava fora da
 * plataforma. Três problemas nasciam daí:
 *
 *   1. Se o Z: não estivesse mapeado, a consulta morria sem explicação útil.
 *   2. Ninguém sabia quando a sessão tinha sido renovada — ela venceu em
 *      17/07/2026 e só se descobriu um mês depois, com 70 consultas erradas.
 *   3. O conhecimento morava fora do sistema: quem não lembrasse do script
 *      não tinha como descobrir que ele existia.
 *
 * Agora a sessão fica em `Escritorio.econetSessao`, cifrada (cookie de sessão
 * vale tanto quanto senha enquanto está viva), com a data em `econetSessaoEm`
 * visível na tela de Configurações.
 *
 * O arquivo antigo ainda é aceito UMA vez, como ponte: se o banco não tem
 * sessão e o arquivo existe, ele é importado e registrado no log. Depois disso
 * o Z: deixa de ser consultado.
 */

import { readFile } from "node:fs/promises";
import { prisma } from "@/lib/db";
import { cifrar, decifrar } from "@/lib/crypto";

/** Caminho do arquivo do fluxo antigo, mantido só pra importação única. */
export const ARQUIVO_SESSAO_LEGADO =
  "Z:\\HIGOR OBRIGACOES MENSAIS\\TRIBUTACAO NCM\\config\\econet-storage.json";

/** Formato do `storageState()` do Playwright — só a parte que usamos. */
export interface StorageStateEconet {
  cookies: Array<{ name: string; value: string; domain: string; path?: string }>;
  origins?: unknown;
}

/**
 * Sessão pronta pra uso: headers HTTP com o cookie montado.
 * Carregada UMA vez por lote — decifrar custa scrypt (~100ms), então não vale
 * refazer isso a cada NCM de uma lista de 136.
 */
export interface SessaoEconet {
  headers: Record<string, string>;
  renovadaEm: Date | null;
  /** De onde veio: banco (normal) ou o arquivo legado do Z: (importação). */
  origem: "banco" | "arquivo-legado";
}

function montarHeaders(storage: StorageStateEconet): Record<string, string> {
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

/** Grava a sessão cifrada e carimba a data. Chamado ao fim do login assistido. */
export async function salvarSessaoEconet(
  escritorioId: string,
  storage: StorageStateEconet,
): Promise<Date> {
  const agora = new Date();
  await prisma.escritorio.update({
    where: { id: escritorioId },
    data: {
      econetSessao: cifrar(JSON.stringify({ cookies: storage.cookies })),
      econetSessaoEm: agora,
    },
  });
  return agora;
}

/**
 * Carrega a sessão do escritório. Devolve `null` quando não há sessão alguma —
 * quem chama traduz isso em "renove a sessão", nunca em "NCM não encontrado".
 */
export async function carregarSessaoEconet(escritorioId: string): Promise<SessaoEconet | null> {
  const esc = await prisma.escritorio.findUnique({
    where: { id: escritorioId },
    select: { econetSessao: true, econetSessaoEm: true },
  });

  if (esc?.econetSessao) {
    let storage: StorageStateEconet;
    try {
      storage = JSON.parse(decifrar(esc.econetSessao));
    } catch {
      // Cifra ilegível (ENCRYPTION_KEY rotacionada, por exemplo). Tratar como
      // ausência de sessão é melhor que estourar erro técnico na cara do
      // contador — a tela vai pedir pra renovar, que é a ação certa.
      return null;
    }
    return {
      headers: montarHeaders(storage),
      renovadaEm: esc.econetSessaoEm,
      origem: "banco",
    };
  }

  // Ponte com o fluxo antigo: importa o arquivo do Z: uma única vez.
  const importada = await importarSessaoLegado(escritorioId);
  return importada;
}

/**
 * Importa o `econet-storage.json` do Z: pro banco, se ele existir.
 * Roda só quando o banco ainda não tem sessão — depois disso o Z: some do
 * caminho. Falha em silêncio (devolve null) quando o arquivo não está lá:
 * ausência de arquivo legado é o caso normal daqui pra frente.
 */
async function importarSessaoLegado(escritorioId: string): Promise<SessaoEconet | null> {
  let storage: StorageStateEconet;
  try {
    storage = JSON.parse(await readFile(ARQUIVO_SESSAO_LEGADO, "utf-8"));
  } catch {
    return null;
  }
  if (!Array.isArray(storage?.cookies) || storage.cookies.length === 0) return null;

  const renovadaEm = await salvarSessaoEconet(escritorioId, storage);
  await prisma.logAcesso.create({
    data: {
      acao: "SESSAO_ECONET_IMPORTADA",
      detalhe: `Importada do arquivo legado ${ARQUIVO_SESSAO_LEGADO} (${storage.cookies.length} cookies)`,
    },
  });

  return { headers: montarHeaders(storage), renovadaEm, origem: "arquivo-legado" };
}
