/**
 * Login assistido na Econet — a plataforma abre o navegador, o humano resolve
 * o CAPTCHA, a plataforma guarda a sessão.
 *
 * POR QUE ASSISTIDO E NÃO AUTOMÁTICO
 * O login da Econet tem CAPTCHA. A plataforma não resolve CAPTCHA e não vai
 * resolver — o desafio existe justamente pra garantir que tem gente do outro
 * lado. O que dá pra automatizar é todo o resto: abrir a página certa,
 * pré-preencher usuário e senha guardados no cadastro, esperar, e capturar os
 * cookies no fim. Sobra pro Higor só o quebra-cabeça.
 *
 * COMO SABEMOS QUE LOGOU
 * Sem depender do layout da Econet: navegamos direto pra página de consulta de
 * PIS/COFINS. Sem sessão, ela responde a tela de login; com sessão, responde o
 * formulário de busca. É a mesma leitura que `diagnosticarPagina` faz nas
 * consultas — uma âncora só, usada nos dois lugares.
 *
 * O PRÉ-PREENCHIMENTO É BEST-EFFORT
 * Os campos de login não têm `name` previsível (mesmo caso do portal da SEFAZ),
 * então achamos o `input[type=password]` e, dentro do mesmo formulário, o
 * primeiro campo de texto. Se a Econet mudar a tela e a heurística falhar, o
 * login continua possível: os campos ficam vazios e o humano digita. Falhar em
 * preencher NUNCA aborta o processo.
 */

import { chromium, type Browser, type BrowserContext, type Page } from "playwright";
import { URL_ECONET, diagnosticarPagina } from "./consulta-econet";
import { salvarSessaoEconet, type StorageStateEconet } from "./econet-sessao";

export interface ResultadoLoginEconet {
  ok: boolean;
  renovadaEm?: Date;
  /** Se conseguimos pré-preencher usuário/senha, ou se o humano teve que digitar. */
  preencheuCredencial: boolean;
  /** Quantos cookies do domínio da Econet foram capturados. */
  cookies?: number;
  erro?: string;
}

/** Quanto tempo esperamos o humano concluir o login antes de desistir. */
const TIMEOUT_PADRAO_MS = 5 * 60 * 1000;
const INTERVALO_CHECAGEM_MS = 2000;

async function preencherCredencial(page: Page, usuario: string, senha: string): Promise<boolean> {
  try {
    const campoSenha = page.locator('input[type="password"]').first();
    await campoSenha.waitFor({ state: "visible", timeout: 10_000 });

    // O formulário que contém a senha é a âncora; o usuário é o primeiro campo
    // de texto dentro dele.
    const form = page.locator("form").filter({ has: page.locator('input[type="password"]') }).first();
    const campoUsuario = form
      .locator('input[type="text"], input[type="email"], input:not([type])')
      .first();

    if (usuario) await campoUsuario.fill(usuario);
    if (senha) await campoSenha.fill(senha);
    return true;
  } catch {
    // Heurística não pegou — o humano digita. Não é motivo pra abortar.
    return false;
  }
}

/**
 * Abre o navegador, espera o login humano e salva a sessão no banco.
 *
 * @param usuario Código do cliente (em claro). Opcional — sem ele, só não pré-preenche.
 * @param senha   Senha em claro. O chamador é quem decifra.
 */
export async function loginAssistidoEconet(opts: {
  escritorioId: string;
  usuario?: string | null;
  senha?: string | null;
  timeoutMs?: number;
}): Promise<ResultadoLoginEconet> {
  const { escritorioId, usuario, senha, timeoutMs = TIMEOUT_PADRAO_MS } = opts;

  let browser: Browser | null = null;
  try {
    // headless: false é obrigatório aqui — o humano precisa VER o CAPTCHA.
    browser = await chromium.launch({ headless: false });
    const context: BrowserContext = await browser.newContext({
      viewport: { width: 1280, height: 900 },
    });
    const page = await context.newPage();
    await page.goto(URL_ECONET, { waitUntil: "domcontentloaded" });

    // Já estava logado? Então é só recapturar os cookies e pronto.
    let estado = diagnosticarPagina(await page.content());
    let preencheuCredencial = false;

    if (estado === "login" && (usuario || senha)) {
      preencheuCredencial = await preencherCredencial(page, usuario ?? "", senha ?? "");
    }

    const limite = Date.now() + timeoutMs;
    while (estado !== "logado") {
      if (page.isClosed()) {
        return {
          ok: false,
          preencheuCredencial,
          erro: "A janela do navegador foi fechada antes de o login terminar.",
        };
      }
      if (Date.now() > limite) {
        return {
          ok: false,
          preencheuCredencial,
          erro: `O login não foi concluído em ${Math.round(timeoutMs / 60000)} minutos. Tente de novo.`,
        };
      }
      await page.waitForTimeout(INTERVALO_CHECAGEM_MS);
      try {
        estado = diagnosticarPagina(await page.content());
      } catch {
        // Navegação em curso derruba o content() no meio; tenta de novo.
      }
    }

    const storage = (await context.storageState()) as StorageStateEconet;
    const doDominio = storage.cookies.filter((c) => c.domain.includes("econeteditora"));
    if (doDominio.length === 0) {
      return {
        ok: false,
        preencheuCredencial,
        erro: "O login parece ter dado certo, mas nenhum cookie da Econet foi capturado.",
      };
    }

    const renovadaEm = await salvarSessaoEconet(escritorioId, storage);
    return { ok: true, renovadaEm, preencheuCredencial, cookies: doDominio.length };
  } catch (e) {
    return {
      ok: false,
      preencheuCredencial: false,
      erro: e instanceof Error ? e.message : String(e),
    };
  } finally {
    await browser?.close().catch(() => {});
  }
}
