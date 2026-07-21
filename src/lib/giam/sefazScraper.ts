/**
 * Robô que raspa o portal GIAM da SEFAZ-TO (giam.sefaz.to.gov.br) — Etapa 2 da
 * auditoria de obrigações acessórias.
 *
 * Fluxo mapeado ao vivo em 20/07/2026:
 *
 *   1. GET  https://giam.sefaz.to.gov.br → HTML com formulário CONSULTA
 *      (form POST com campos Inscrição Estadual + Senha).
 *   2. POST no form → HTML de /consulta/ConsGIAM.Asp com a LISTA DE MESES
 *      transmitidos (uma linha por mês, com link).
 *   3. Cada link leva pra apps.sefaz.to.gov.br/espelhogiam/servlet/hgiawb002
 *      com IE + mês/ano no query string. SUBDOMÍNIO DIFERENTE — sessão nova.
 *   4. O apps.sefaz pede LOGIN DE NOVO (mesma IE + senha).
 *   5. Depois retorna o PDF do Espelho da GIAM (via servlet ogirlgiam2web).
 *
 * Escolha técnica: Playwright headless. Motivos:
 *   - Cookies de sessão em 2 subdomínios são gerenciados automaticamente.
 *   - O PDF é gerado por servlet — precisa de contexto de navegador pra baixar
 *     com os cookies certos, não é URL direta acessível.
 *   - Se a SEFAZ mudar pra JS mais dinâmico, Playwright continua funcionando.
 *
 * O PDF baixado é lido em memória com pdf-parse. NÃO é gravado em disco —
 * regra do Higor: plataforma nunca armazena arquivos originais. Só valores
 * extraídos + Nº Controle ficam no banco.
 */
import { chromium, type Browser, type BrowserContext } from "playwright";
import { PDFParse } from "pdf-parse";

export interface GiamSefazApuracaoRaspada {
  ano: number;
  mes: number; // 1-12
  retificacao: string; // "00" original, "01+" retificadora — parseia do PDF
  numeroControle: string;
  dataRecepcao: Date | null;

  // Cabeçalho útil pra sanity
  inscricaoEstadual: string;
  razaoSocial: string;

  // Item 5-8 (apuração ICMS Normal)
  debitoSaidas: number;
  creditoEntradas: number;
  saldoCredorAnterior: number;
  deducoes: number;
  icmsARecolherNormal: number;

  // Quadro 4 — CFOP × colunas
  linhasSegmentoB: LinhaEspelhoB[];

  // Totais consolidados (soma das linhas por natureza)
  totalEntradas: TotaisEspelhoB;
  totalSaidas: TotaisEspelhoB;
}

export interface LinhaEspelhoB {
  natureza: "0" | "1"; // 0 = entrada, 1 = saída
  cfop: string;
  valorContabil: number;
  baseCalculo: number;
  creditoDebitoImposto: number; // crédito se entrada, débito se saída
  isentasNaoTributadas: number;
  outras: number;
  substituicaoTributaria: number;
}

export interface TotaisEspelhoB {
  valorContabil: number;
  baseCalculo: number;
  isentasNaoTributadas: number;
  outras: number;
  substituicaoTributaria: number;
  creditoDebitoImposto: number;
  linhas: number;
}

export class SefazPortalError extends Error {
  constructor(msg: string, public etapa?: string) {
    super(etapa ? `[${etapa}] ${msg}` : msg);
    this.name = "SefazPortalError";
  }
}

const URL_GIAM = "https://giam.sefaz.to.gov.br/";
const URL_APPS_LOGIN_PARAMS = (ie: string, mes: number, ano: number) =>
  `https://apps.sefaz.to.gov.br/espelhogiam/servlet/hgiawb002?ie=${ie}&mesini=${String(mes).padStart(2, "0")}&mesfim=${String(mes).padStart(2, "0")}&ano=${ano}&Retif=00`;

/**
 * Executa a raspagem pra um cliente num ano — retorna as apurações lidas do
 * portal. Não persiste nada — quem chama grava no banco.
 *
 * @param ie          Inscrição Estadual formatada como aparece no portal
 * @param senha       Senha SEFAZ em CLARO (o chamador é responsável por decifrar)
 * @param ano         Ano fiscal (ex: 2022)
 * @param meses       Meses a buscar (1-12). Se omitido, busca todos que o portal listar.
 * @param headless    Rodar navegador oculto (default true). Passe false pra debugar visualmente.
 */
export async function raspaGiamSefaz(opts: {
  ie: string;
  senha: string;
  ano: number;
  meses?: number[];
  headless?: boolean;
}): Promise<GiamSefazApuracaoRaspada[]> {
  const { ie, senha, ano, meses, headless = true } = opts;

  const browser: Browser = await chromium.launch({ headless });
  const context: BrowserContext = await browser.newContext({
    acceptDownloads: true,
    viewport: { width: 1280, height: 800 },
  });

  try {
    // ---------- ETAPA 1: login no giam.sefaz + achar meses ----------
    const page = await context.newPage();
    await page.goto(URL_GIAM, { waitUntil: "networkidle" });

    // Área CONSULTA tem campo Inscrição Estadual, Senha e botão Consultar.
    // Descobri pelo find semântico ontem — os inputs não têm name previsível.
    // Uso a área CONSULTA como âncora e pego os primeiros 2 inputs de texto.
    const consultaSection = page.locator("form").filter({ hasText: /Inscri.*Estadual/i }).first();
    await consultaSection.locator('input[type="text"], input[name*="ie" i], input:not([type])').first().fill(ie);
    await consultaSection.locator('input[type="password"]').first().fill(senha);
    await Promise.all([
      page.waitForLoadState("networkidle"),
      consultaSection.locator('button:has-text("Consultar"), input[type="submit"][value*="Consultar" i]').first().click(),
    ]);

    if (!page.url().includes("ConsGIAM")) {
      throw new SefazPortalError(`Login falhou — URL após submit: ${page.url()}`, "login-giam");
    }

    // Lista de meses transmitidos — cada linha tem link no formato MM/YYYY.
    // Pega só os do ano solicitado. Se `meses` foi passado, filtra também.
    const linksMeses = await page.locator("a").evaluateAll((anchors, targetAno) => {
      const rx = /^(\d{2})\/(\d{4})$/;
      return anchors
        .map((a) => {
          const t = a.textContent?.trim() ?? "";
          const m = t.match(rx);
          if (!m) return null;
          const mm = Number(m[1]);
          const yyyy = Number(m[2]);
          if (yyyy !== targetAno) return null;
          return { mes: mm, ano: yyyy, href: (a as HTMLAnchorElement).href };
        })
        .filter((x): x is { mes: number; ano: number; href: string } => x !== null);
    }, ano);

    const alvos = meses
      ? linksMeses.filter((l) => meses.includes(l.mes))
      : linksMeses;

    if (alvos.length === 0) {
      throw new SefazPortalError(
        `Nenhuma competência encontrada no portal para ${ano}${meses ? " (meses " + meses.join(",") + ")" : ""}.`,
        "listar-meses",
      );
    }

    // ---------- ETAPA 2: pra cada mês, login duplo no apps.sefaz e baixar PDF ----------
    // Erros por mês NÃO abortam a batch — outros meses seguem. Retorna array
    // parcial; o chamador decide o que fazer com erros individuais.
    const resultados: GiamSefazApuracaoRaspada[] = [];
    const erros: Array<{ mes: number; ano: number; motivo: string }> = [];

    for (const alvo of alvos) {
      try {
        const parsed = await baixarEspelhoDoMes(page, ie, senha, alvo, headless);
        resultados.push(parsed);
      } catch (e) {
        const motivo = e instanceof Error ? e.message : String(e);
        console.warn(`[warn] ${String(alvo.mes).padStart(2, "0")}/${alvo.ano}: ${motivo}`);
        erros.push({ mes: alvo.mes, ano: alvo.ano, motivo });
      }
    }

    if (resultados.length === 0 && erros.length > 0) {
      throw new SefazPortalError(
        `Nenhum PDF baixado. Primeiro erro: ${erros[0].motivo}`,
        "download-pdf",
      );
    }
    return resultados;
  } finally {
    await context.close();
    await browser.close();
  }
}

/**
 * Baixa o PDF de UM mês, com retry se o portal devolver a tela de login
 * (auth expirada entre iterações). Usa `page.request` do Playwright pra
 * herdar automaticamente a session cookies do context.
 */
async function baixarEspelhoDoMes(
  page: import("playwright").Page,
  ie: string,
  senha: string,
  alvo: { mes: number; ano: number },
  headless: boolean,
): Promise<GiamSefazApuracaoRaspada> {
  const url = URL_APPS_LOGIN_PARAMS(ie, alvo.mes, alvo.ano);

  for (let tentativa = 1; tentativa <= 2; tentativa++) {
    // Estratégia observada: se o cookie de sessão do primeiro login em
    // giam.sefaz.to.gov.br JÁ existe no domínio pai .sefaz.to.gov.br, o
    // apps.sefaz aceita GET direto e devolve o PDF. Tentamos primeiro assim
    // (rápido). Se vier HTML, cai no fluxo de login manual do subdomínio.
    const respGet = await page.request.get(url);
    let buf = Buffer.from(await respGet.body());

    if (!buf.slice(0, 4).toString("ascii").startsWith("%PDF")) {
      // Não veio PDF — abre no browser, preenche o form e submete DENTRO
      // do frame (o servidor dispara download que o event 'download' pega).
      await page.goto(url, { waitUntil: "domcontentloaded" });
      const senhaInput = page.locator('#_CONSENHANV, input[type="password"]').first();
      if (await senhaInput.count()) {
        await page.locator('#_CONINSEST, input[type="text"]').first().fill(ie);
        await senhaInput.fill(senha);

        // O submit dispara download nativo. Aguarda o event 'download'.
        const downloadPromise = page.waitForEvent("download", { timeout: 30000 });
        await page.evaluate(() => {
          const form = document.querySelector<HTMLFormElement>("form#MAINFORM, form[name='MAINFORM']");
          if (form) {
            const eventName = form.querySelector<HTMLInputElement>("input[name='_EventName']");
            if (eventName) eventName.value = "EENTER.";
            form.submit();
          }
        });
        const download = await downloadPromise;
        const stream = await download.createReadStream();
        const chunks: Buffer[] = [];
        for await (const c of stream) chunks.push(c as Buffer);
        buf = Buffer.concat(chunks);
      }
    }

    const finalUrl = url;

    // Debug: se não veio PDF, dumpa o HTML pra scratchpad pra inspecionar depois.
    if (!buf.slice(0, 4).toString("ascii").startsWith("%PDF")) {
      try {
        const fs = await import("node:fs");
        const path = `C:/Users/higor/AppData/Local/Temp/claude/C--Users-higor/26fee02e-df13-4afd-b6c9-73ea580f4a5a/scratchpad/resposta-nao-pdf-${alvo.ano}-${String(alvo.mes).padStart(2, "0")}-t${tentativa}.html`;
        fs.writeFileSync(path, buf.toString("utf8").slice(0, 4000), "utf8");
      } catch {}
    }

    if (buf.slice(0, 4).toString("ascii").startsWith("%PDF")) {
      const parser = new PDFParse({ data: buf });
      const dados = await parser.getText();
      if (!headless) {
        const fs = await import("node:fs");
        const path = `C:/Users/higor/AppData/Local/Temp/claude/C--Users-higor/26fee02e-df13-4afd-b6c9-73ea580f4a5a/scratchpad/espelho-${alvo.ano}-${String(alvo.mes).padStart(2, "0")}.txt`;
        try {
          fs.writeFileSync(path, dados.text, "utf8");
        } catch {}
      }
      return parseEspelhoPdf(dados.text, alvo.mes, alvo.ano);
    }

    // Não é PDF — pode ser página de login (session apps.sefaz expirou).
    // Tenta de novo — o goto() dessa vez vai cair no branch do form e reautenticar.
    if (tentativa === 1) {
      // limpa qualquer cookie do apps.sefaz para forçar novo login
      const url2 = new URL(URL_APPS_LOGIN_PARAMS(ie, alvo.mes, alvo.ano));
      const ctx = page.context();
      const cookies = await ctx.cookies();
      const semAppsSefaz = cookies.filter((c) => !c.domain?.includes("apps.sefaz.to.gov.br"));
      await ctx.clearCookies();
      await ctx.addCookies(semAppsSefaz);
      continue;
    }
    throw new SefazPortalError(
      `Resposta de ${finalUrl} não é PDF (bytes: ${buf.slice(0, 30).toString("ascii")}...)`,
      "download-pdf",
    );
  }
  throw new SefazPortalError("Retry esgotado", "download-pdf");
}

// ============================================================================
// Parser do texto extraído do PDF do Espelho da GIAM
// ============================================================================

/**
 * O texto que o pdf-parse retorna preserva a ordem visual mas perde a
 * estrutura tabular. Usamos regex ancorados nos títulos dos quadros do
 * layout oficial pra localizar cada bloco.
 */
function parseEspelhoPdf(texto: string, mes: number, ano: number): GiamSefazApuracaoRaspada {
  // Preserva quebras de linha — o pdf-parse dispõe blocos do formulário em
  // linhas separadas. Só normaliza tabs pra espaço.
  const t = texto.replace(/\r/g, "").replace(/\t/g, " ");

  // Nº Controle: aparece explicitamente como "Nº Controle: XXXXX" no item 19,
  // ou solto como bloco de 14 dígitos perto do título "NÚMERO DE CONTROLE"
  // (dependendo de onde o pdf-parse colocou).
  const numeroControle =
    matchOne(t, /N.?\s*Controle:\s*(\d{10,})/i) ??
    matchOne(t, /NÚMERO DE CONTROLE[\s\S]{0,200}?(\d{14})/i) ??
    "";

  // Data e hora de recepção: "Data: DD/MM/AAAA HH:MM:SS" no item 19.
  const dataRecepcao = parseDataHoraBR(t);

  const razaoSocial =
    matchOne(t, /^([A-ZÀ-Ú][A-ZÀ-Ú0-9 &.,'/-]{5,}(?:LTDA|S\.?A\.?|ME|EPP|EIRELI))\s*$/im) ??
    matchOne(t, /RAZ.?O SOCIAL[\s\S]{0,10}([A-ZÀ-Ú][A-ZÀ-Ú0-9 &.,'/-]{5,})/i) ??
    "";

  const inscricaoEstadual = matchOne(t, /(\d{2}\.\d{3}\.\d{3}-\d)/) ?? "";

  // Retificação: o request pro portal passa Retif=00 (só sabemos raspar a
  // versão original hoje). A tag do PDF diferencia SIM/NÃO em posição que o
  // pdf-parse embaralha — parsear é frágil. Fixa "00" e ajusta no futuro se
  // adicionarmos suporte a raspar retificadoras (Retif=01, 02, ...).
  const retificacao = "00";

  // Quadro 4 — CFOP × 6 colunas. Cada linha tem o padrão:
  //   CFOP DESCRICAO 6-valores
  // O CFOP é 4 dígitos separados por ponto (ex: 1.102).
  const { entradas, saidas } = parseQuadro4(t);
  const totalEntradas = consolidar(entradas);
  const totalSaidas = consolidar(saidas);

  // Os totais do item 5 (Débito) e 6 (Crédito) do PDF ficam separados dos
  // rótulos no texto extraído — parsear com regex é frágil. Derivamos das
  // linhas do Quadro 4: soma da coluna Crédito das entradas = 6.1; soma da
  // coluna Débito das saídas = 5.1. Bate com o E110 do SPED.
  const debitoSaidas = totalSaidas.creditoDebitoImposto;
  const creditoEntradas = totalEntradas.creditoDebitoImposto;
  const saldoCredorAnterior = 0; // TODO: parsear se o PDF trouxer
  const deducoes = 0;
  const icmsARecolherNormal = Math.max(0, debitoSaidas - creditoEntradas - saldoCredorAnterior - deducoes);

  return {
    ano,
    mes,
    retificacao,
    numeroControle,
    dataRecepcao,
    inscricaoEstadual,
    razaoSocial,
    debitoSaidas,
    creditoEntradas,
    saldoCredorAnterior,
    deducoes,
    icmsARecolherNormal,
    linhasSegmentoB: [...entradas, ...saidas],
    totalEntradas,
    totalSaidas,
  };
}

function parseQuadro4(t: string): { entradas: LinhaEspelhoB[]; saidas: LinhaEspelhoB[] } {
  // Estratégia: procurar CFOP no formato "N.NNN" seguido de 6 números decimais.
  // Entradas começam com 1, 2 ou 3 (dentro do bloco 4.1). Saídas com 5, 6, 7 (bloco 4.2).
  //
  // Fronteira: o texto entre "4.1 ENTRADAS" e "4.2 SAÍDAS" é entradas;
  // depois de "4.2 SAÍDAS" até "5 - DÉBITO" é saídas.
  const idx41 = t.search(/4\.1\s*ENTRADAS/i);
  const idx42 = t.search(/4\.2\s*SA.?DAS/i);
  const idx5 = t.search(/\b5\s*-?\s*D.?BITO DO IMPOSTO/i);

  const bloco41 = idx41 >= 0 && idx42 >= 0 ? t.substring(idx41, idx42) : "";
  const bloco42 = idx42 >= 0 && idx5 >= 0 ? t.substring(idx42, idx5) : "";

  return {
    entradas: extrairLinhasCFOP(bloco41, "0"),
    saidas: extrairLinhasCFOP(bloco42, "1"),
  };
}

function extrairLinhasCFOP(bloco: string, natureza: "0" | "1"): LinhaEspelhoB[] {
  // Regex: CFOP N.NNN seguido de descricao + 6 valores decimais.
  // Ignora linhas que começam com "TOTAL", "4.1.x" etc — só as que tem CFOP puro.
  const re = /(\d\.\d{3})\s+([^\d\n]+?)\s+([\d\.,]+)\s+([\d\.,]+)\s+([\d\.,]+)\s+([\d\.,]+)\s+([\d\.,]+)\s+([\d\.,]+)/g;
  const linhas: LinhaEspelhoB[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(bloco)) !== null) {
    const cfop = m[1].replace(".", ""); // "1.102" -> "1102"
    const primeiroDigito = cfop.charAt(0);
    if (natureza === "0" && !"123".includes(primeiroDigito)) continue;
    if (natureza === "1" && !"567".includes(primeiroDigito)) continue;

    // O pdf-parse extrai os 6 valores em ORDEM DIFERENTE para entradas e
    // saídas por causa de como o cabeçalho do quadro é diagramado no PDF.
    //
    //   Entradas (4.1) — ordem observada no texto: VC BC D-Isentas E-Outras C-Crédito F-ST
    //   Saídas   (4.2) — ordem observada no texto: VC BC C-Débito D-Isentas E-Outras F-ST
    //
    // (Motivo: o rótulo "C - CRÉDITO/DÉBITO" fica em posição Y diferente do
    // resto do cabeçalho — pra entradas cai depois, pra saídas vem no meio.)
    const vals = [m[3], m[4], m[5], m[6], m[7], m[8]].map(parseValorBr);
    const linha: LinhaEspelhoB =
      natureza === "0"
        ? {
            natureza,
            cfop,
            valorContabil: vals[0],
            baseCalculo: vals[1],
            isentasNaoTributadas: vals[2],
            outras: vals[3],
            creditoDebitoImposto: vals[4],
            substituicaoTributaria: vals[5],
          }
        : {
            natureza,
            cfop,
            valorContabil: vals[0],
            baseCalculo: vals[1],
            creditoDebitoImposto: vals[2],
            isentasNaoTributadas: vals[3],
            outras: vals[4],
            substituicaoTributaria: vals[5],
          };
    linhas.push(linha);
  }
  return linhas;
}

function consolidar(linhas: LinhaEspelhoB[]): TotaisEspelhoB {
  return linhas.reduce(
    (acc, l) => ({
      valorContabil: acc.valorContabil + l.valorContabil,
      baseCalculo: acc.baseCalculo + l.baseCalculo,
      creditoDebitoImposto: acc.creditoDebitoImposto + l.creditoDebitoImposto,
      isentasNaoTributadas: acc.isentasNaoTributadas + l.isentasNaoTributadas,
      outras: acc.outras + l.outras,
      substituicaoTributaria: acc.substituicaoTributaria + l.substituicaoTributaria,
      linhas: acc.linhas + 1,
    }),
    {
      valorContabil: 0,
      baseCalculo: 0,
      creditoDebitoImposto: 0,
      isentasNaoTributadas: 0,
      outras: 0,
      substituicaoTributaria: 0,
      linhas: 0,
    },
  );
}

function matchOne(t: string, re: RegExp): string | null {
  const m = t.match(re);
  return m?.[1] ?? null;
}

function parseValorBr(s: string | null | undefined): number {
  if (!s) return 0;
  const clean = s.replace(/\./g, "").replace(",", ".");
  const n = Number(clean);
  return Number.isFinite(n) ? n : 0;
}

function parseDataHoraBR(txt: string): Date | null {
  // Procura "Data: DD/MM/AAAA HH:MM:SS" (item 19 do Espelho). Não pega
  // qualquer data — só a que estiver depois do rótulo "Data:", que é a
  // data/hora de recepção pela SEFAZ.
  const m = txt.match(/Data:\s*(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2}):(\d{2})/);
  if (!m) return null;
  const [, dd, mm, aaaa, hh, mi, ss] = m;
  return new Date(Date.UTC(+aaaa, +mm - 1, +dd, +hh, +mi, +ss));
}
