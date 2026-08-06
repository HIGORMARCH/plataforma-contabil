/**
 * Robô do Portal do Simples Nacional (www8.receita.fazenda.gov.br/SimplesNacional).
 *
 * Autentica com CERTIFICADO DIGITAL do cliente (o mesmo PFX já cadastrado em
 * Cliente.certificadoArquivo). Raspa a lista de PGDAS-D e DEFIS transmitidas
 * pra um cliente/range de anos e retorna as entregas encontradas.
 *
 * ⚠️ ATENÇÃO — VALIDAÇÃO PENDENTE COM PORTAL REAL
 *
 * O layout do portal do Simples Nacional muda sem aviso. Os SELETORES marcados
 * com TODO abaixo foram escritos a partir da estrutura conhecida do portal em
 * dezembro/2025 mas PRECISAM ser confirmados na primeira execução real:
 *
 *   1. Rodar com headless=false pra ver o que acontece
 *   2. Ajustar os seletores conforme o portal responder
 *   3. Depois ativar headless=true pra prod
 *
 * O código está estruturado pra falhar EXPLICITAMENTE (SimplesPortalError com
 * etapa) e não silenciosamente — se o portal mudar, a mensagem aponta onde.
 *
 * SEM ARMAZENAMENTO DE ARQUIVOS: como o robô GIAM, este NÃO grava nada em
 * disco. Só extrai dados da tela HTML/JSON e devolve.
 */
import { chromium, type Browser, type BrowserContext } from "playwright";

export interface EntregaSimplesRaspada {
  tipo: "PGDAS_D" | "DEFIS";
  ano: number;
  mes: number | null; // null pra DEFIS (anual)
  dataEntrega: Date;
  numeroRecibo: string | null;
}

export class SimplesPortalError extends Error {
  constructor(msg: string, public etapa?: string) {
    super(etapa ? `[${etapa}] ${msg}` : msg);
    this.name = "SimplesPortalError";
  }
}

const URL_PORTAL = "https://www8.receita.fazenda.gov.br/SimplesNacional/";
// A entrada com cert vai por "acesso via certificado digital" — o portal
// coloca isso num link separado. Fazemos direto no endpoint canônico.

export async function rasparPortalSimples(opts: {
  cnpj: string;
  pfxBuffer: Buffer;
  pfxSenha: string;
  anoInicial: number;
  anoFinal: number;
  tipos?: Array<"PGDAS_D" | "DEFIS">; // default: os dois
  headless?: boolean;
}): Promise<EntregaSimplesRaspada[]> {
  const {
    cnpj,
    pfxBuffer,
    pfxSenha,
    anoInicial,
    anoFinal,
    tipos = ["PGDAS_D", "DEFIS"],
    headless = true,
  } = opts;

  const browser: Browser = await chromium.launch({ headless });

  // Playwright aceita client certificate por origem. O portal do Simples fica
  // em www8.receita.fazenda.gov.br — passamos o PFX pra essa origem.
  const context: BrowserContext = await browser.newContext({
    acceptDownloads: true,
    viewport: { width: 1280, height: 800 },
    clientCertificates: [
      {
        origin: "https://www8.receita.fazenda.gov.br",
        pfx: pfxBuffer,
        passphrase: pfxSenha,
      },
    ],
  });

  const encontradas: EntregaSimplesRaspada[] = [];

  try {
    const page = await context.newPage();

    // ------------------------------------------------------------------
    // ETAPA 1 — Entrar no portal com certificado digital
    // ------------------------------------------------------------------
    // TODO(validar): o portal pode redirecionar pra tela de escolha de acesso
    // antes de aceitar o cert. Se aparecer botão "Certificado Digital", clicar.
    await page.goto(URL_PORTAL, { waitUntil: "networkidle", timeout: 60_000 });

    // Se cair na tela de "escolha de acesso", clica na opção de certificado.
    const btnCert = page.locator(
      "a:has-text('Certificado'), button:has-text('Certificado'), a:has-text('Código de Acesso')",
    );
    if ((await btnCert.count()) > 0) {
      // Prefere o link/botão que menciona "certificado"
      await page.locator("a:has-text('Certificado'), button:has-text('Certificado')").first().click();
      await page.waitForLoadState("networkidle", { timeout: 60_000 });
    }

    // Alguns fluxos pedem confirmar o CNPJ do procurado depois do cert.
    // TODO(validar): input#cnpj / name="cnpj" — confirmar no portal real.
    const inputCnpj = page.locator("input[name='cnpj'], input#cnpj").first();
    if ((await inputCnpj.count()) > 0) {
      await inputCnpj.fill(cnpj.replace(/\D/g, ""));
      const btn = page.locator(
        "button:has-text('Continuar'), button:has-text('OK'), input[type='submit']",
      ).first();
      if ((await btn.count()) > 0) await btn.click();
      await page.waitForLoadState("networkidle", { timeout: 60_000 });
    }

    // ------------------------------------------------------------------
    // ETAPA 2 — Navegar até PGDAS-D → Consultar declarações transmitidas
    // ------------------------------------------------------------------
    if (tipos.includes("PGDAS_D")) {
      try {
        const encontradasPgdas = await consultarPgdasd(page, anoInicial, anoFinal);
        encontradas.push(...encontradasPgdas);
      } catch (e) {
        // Não aborta os outros tipos — DEFIS pode funcionar mesmo se PGDAS falhar.
        console.warn("[simples-nacional] PGDAS-D falhou:", e);
      }
    }

    // ------------------------------------------------------------------
    // ETAPA 3 — DEFIS → Consultar declarações transmitidas
    // ------------------------------------------------------------------
    if (tipos.includes("DEFIS")) {
      try {
        const encontradasDefis = await consultarDefis(page, anoInicial, anoFinal);
        encontradas.push(...encontradasDefis);
      } catch (e) {
        console.warn("[simples-nacional] DEFIS falhou:", e);
      }
    }
  } finally {
    await context.close();
    await browser.close();
  }

  return encontradas;
}

/**
 * PGDAS-D — Programa Gerador do DAS declaratório (mensal).
 *
 * TODO(validar): fluxo típico:
 *   1. Menu "PGDAS-D e DEFIS" → "Cálculo do Valor Devido e Geração do DAS"
 *   2. Dentro: aba "Consulta Declarações Transmitidas"
 *   3. Escolhe ano → tabela com uma linha por mês, cada uma com:
 *      - PA (período de apuração — MM/AAAA)
 *      - Nº do Recibo
 *      - Data de Transmissão (DD/MM/AAAA)
 *      - Situação
 */
async function consultarPgdasd(
  page: import("playwright").Page,
  anoInicial: number,
  anoFinal: number,
): Promise<EntregaSimplesRaspada[]> {
  const resultados: EntregaSimplesRaspada[] = [];

  // TODO(validar): o link/menu pode estar em outro nome.
  const linkPgdas = page.locator("a:has-text('PGDAS-D'), a:has-text('PGDAS')").first();
  if ((await linkPgdas.count()) === 0) {
    throw new SimplesPortalError("Menu PGDAS-D não encontrado", "menu-pgdas");
  }
  await linkPgdas.click();
  await page.waitForLoadState("networkidle", { timeout: 60_000 });

  const linkCalculo = page.locator(
    "a:has-text('Cálculo'), a:has-text('Valor Devido'), a:has-text('DAS')",
  ).first();
  if ((await linkCalculo.count()) > 0) {
    await linkCalculo.click();
    await page.waitForLoadState("networkidle", { timeout: 60_000 });
  }

  const abaConsulta = page.locator(
    "a:has-text('Consultar'), a:has-text('Consulta Declarações'), button:has-text('Consultar')",
  ).first();
  if ((await abaConsulta.count()) > 0) {
    await abaConsulta.click();
    await page.waitForLoadState("networkidle", { timeout: 60_000 });
  }

  for (let ano = anoInicial; ano <= anoFinal; ano++) {
    // TODO(validar): o filtro de ano pode ser <select name='ano'> ou input.
    const selectAno = page.locator("select[name='ano'], select#ano").first();
    if ((await selectAno.count()) > 0) {
      await selectAno.selectOption(String(ano));
      const btnFiltrar = page.locator(
        "button:has-text('Consultar'), button:has-text('Filtrar'), input[type='submit']",
      ).first();
      if ((await btnFiltrar.count()) > 0) await btnFiltrar.click();
      await page.waitForLoadState("networkidle", { timeout: 60_000 });
    }

    // Extrai linhas da tabela — heurística: 3 colunas úteis PA, Recibo, Data.
    const linhas = await page.evaluate(() => {
      const rows: Array<{ pa: string; recibo: string; data: string }> = [];
      const tables = document.querySelectorAll("table");
      for (const table of tables) {
        const trs = table.querySelectorAll("tbody tr, tr");
        for (const tr of trs) {
          const cells = Array.from(tr.querySelectorAll("td")).map((td) =>
            td.textContent?.trim() ?? "",
          );
          if (cells.length < 3) continue;
          // Heurística: PA em MM/AAAA, data em DD/MM/AAAA
          const pa = cells.find((c) => /^\d{2}\/\d{4}$/.test(c));
          const data = cells.find((c) => /^\d{2}\/\d{2}\/\d{4}$/.test(c));
          const recibo = cells.find(
            (c) => /^\d{2,}\.?\d*\.?\d*\.?\d*$/.test(c) && c.replace(/\D/g, "").length >= 10,
          );
          if (pa && data) rows.push({ pa, recibo: recibo ?? "", data });
        }
      }
      return rows;
    });

    for (const l of linhas) {
      const [mm, yyyy] = l.pa.split("/").map(Number);
      const [dd, mmData, yyyyData] = l.data.split("/").map(Number);
      resultados.push({
        tipo: "PGDAS_D",
        ano: yyyy,
        mes: mm,
        dataEntrega: new Date(Date.UTC(yyyyData, mmData - 1, dd)),
        numeroRecibo: l.recibo || null,
      });
    }
  }

  return resultados;
}

/**
 * DEFIS — Declaração anual do Simples Nacional.
 *
 * TODO(validar): fluxo típico:
 *   1. Menu "PGDAS-D e DEFIS" → "DEFIS - Declaração de Informações Socioeconômicas e Fiscais"
 *   2. Aba "Consulta Declarações Transmitidas"
 *   3. Tabela com uma linha por ano-base, com Nº Recibo + Data Transmissão
 */
async function consultarDefis(
  page: import("playwright").Page,
  anoInicial: number,
  anoFinal: number,
): Promise<EntregaSimplesRaspada[]> {
  const resultados: EntregaSimplesRaspada[] = [];

  const linkDefis = page.locator("a:has-text('DEFIS')").first();
  if ((await linkDefis.count()) === 0) {
    throw new SimplesPortalError("Menu DEFIS não encontrado", "menu-defis");
  }
  await linkDefis.click();
  await page.waitForLoadState("networkidle", { timeout: 60_000 });

  const abaConsulta = page.locator(
    "a:has-text('Consultar'), a:has-text('Consulta Declarações')",
  ).first();
  if ((await abaConsulta.count()) > 0) {
    await abaConsulta.click();
    await page.waitForLoadState("networkidle", { timeout: 60_000 });
  }

  // Extrai TODOS os anos exibidos e filtra depois pelo range pedido.
  const linhas = await page.evaluate(() => {
    const rows: Array<{ ano: string; recibo: string; data: string }> = [];
    const tables = document.querySelectorAll("table");
    for (const table of tables) {
      const trs = table.querySelectorAll("tbody tr, tr");
      for (const tr of trs) {
        const cells = Array.from(tr.querySelectorAll("td")).map((td) =>
          td.textContent?.trim() ?? "",
        );
        if (cells.length < 3) continue;
        const ano = cells.find((c) => /^\d{4}$/.test(c));
        const data = cells.find((c) => /^\d{2}\/\d{2}\/\d{4}$/.test(c));
        const recibo = cells.find(
          (c) => /^\d{2,}\.?\d*\.?\d*\.?\d*$/.test(c) && c.replace(/\D/g, "").length >= 10,
        );
        if (ano && data) rows.push({ ano, recibo: recibo ?? "", data });
      }
    }
    return rows;
  });

  for (const l of linhas) {
    const ano = Number(l.ano);
    if (ano < anoInicial || ano > anoFinal) continue;
    const [dd, mmData, yyyyData] = l.data.split("/").map(Number);
    resultados.push({
      tipo: "DEFIS",
      ano,
      mes: null,
      dataEntrega: new Date(Date.UTC(yyyyData, mmData - 1, dd)),
      numeroRecibo: l.recibo || null,
    });
  }

  return resultados;
}
