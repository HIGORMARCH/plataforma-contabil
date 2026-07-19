import { request as httpsRequest, Agent as HttpsAgent } from "node:https";
import type { OutgoingHttpHeaders } from "node:http";
import { assinarTermoDeAutorizacao, construirTermoDeAutorizacao } from "./xml-signer";
import { carregarPfx, type CertificadoCarregado } from "./pkcs12";
import { getSerproConfig, type SerproConfig } from "./config";
import type { PagtowebDocumento, ProcuradorToken, SerproTokens } from "./types";

/**
 * Client SERPRO Integra Contador — porta o fluxo Python validado (steps 1-3).
 *
 * Uso típico:
 *   const client = new SerproClient();
 *   await client.consultarPagamentos({
 *     cnpjContribuinte: "22397212000197",
 *     dataInicial: new Date("2026-05-01"),
 *     dataFinal: new Date("2026-05-31"),
 *   });
 *
 * Caches (in-memory only):
 *   - access_token / jwt_token: renovado quando expira
 *   - autenticar_procurador_token: reusa até meia-noite do dia seguinte
 */

type FetchJsonResult = { status: number; headers: Record<string, string>; body: string };

function fetchWithMtls(
  url: string,
  init: {
    method: string;
    headers: OutgoingHttpHeaders;
    body?: string;
    pfx?: Buffer;
    passphrase?: string;
    timeoutMs?: number;
  },
): Promise<FetchJsonResult> {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const agent = init.pfx
      ? new HttpsAgent({ pfx: init.pfx, passphrase: init.passphrase })
      : undefined;
    const req = httpsRequest(
      {
        method: init.method,
        hostname: u.hostname,
        port: u.port || 443,
        path: u.pathname + u.search,
        headers: init.headers,
        agent,
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => {
          const headers: Record<string, string> = {};
          for (const [k, v] of Object.entries(res.headers)) {
            if (Array.isArray(v)) headers[k.toLowerCase()] = v.join(", ");
            else if (typeof v === "string") headers[k.toLowerCase()] = v;
          }
          resolve({
            status: res.statusCode ?? 0,
            headers,
            body: Buffer.concat(chunks).toString("utf8"),
          });
        });
      },
    );
    req.on("error", reject);
    if (init.timeoutMs) {
      req.setTimeout(init.timeoutMs, () => {
        req.destroy(new Error(`timeout ${init.timeoutMs}ms em ${url}`));
      });
    }
    if (init.body) req.write(init.body);
    req.end();
  });
}

export class SerproClient {
  private config: SerproConfig;
  private cert: CertificadoCarregado | null = null;
  private tokens: SerproTokens | null = null;
  private procuradorToken: ProcuradorToken | null = null;

  constructor(config?: SerproConfig) {
    this.config = config ?? getSerproConfig();
  }

  /** Carrega o cert MARCH (uma vez, cacheia em memória). */
  private async getCert(): Promise<CertificadoCarregado> {
    if (this.cert) return this.cert;
    this.cert = await carregarPfx(this.config.certPath, this.config.certPassword);
    return this.cert;
  }

  /**
   * Step 1: /authenticate com mTLS (cert cliente + Basic auth).
   * Retorna access_token + jwt_token. Cacheia até faltar 30s p/ expirar.
   */
  async getTokens(): Promise<SerproTokens> {
    if (this.tokens && this.tokens.expiresAt - Date.now() > 30_000) {
      return this.tokens;
    }
    const cert = await this.getCert();
    const basic = Buffer.from(`${this.config.consumerKey}:${this.config.consumerSecret}`).toString(
      "base64",
    );
    const res = await fetchWithMtls(this.config.authUrl, {
      method: "POST",
      headers: {
        Authorization: `Basic ${basic}`,
        "role-type": "TERCEIROS",
        "content-type": "application/x-www-form-urlencoded",
      },
      body: "grant_type=client_credentials",
      pfx: cert.pfxBuffer,
      passphrase: cert.pfxPassword,
      timeoutMs: 30_000,
    });
    if (res.status !== 200) {
      throw new Error(`SERPRO /authenticate falhou ${res.status}: ${res.body.slice(0, 400)}`);
    }
    const body = JSON.parse(res.body);
    this.tokens = {
      accessToken: body.access_token,
      jwtToken: body.jwt_token,
      expiresAt: Date.now() + (Number(body.expires_in) || 3600) * 1000,
    };
    return this.tokens;
  }

  /**
   * Step 2+3: obtém autenticar_procurador_token (para consulta em nome de cliente).
   *
   * Modo default (sem args): autoconsulta MARCH — termo assinado pela MARCH,
   *   autor = MARCH. Token cacheia (vale até meia-noite do dia seguinte).
   *
   * Modo com cert próprio do cliente (opts.signingCert): termo assinado pelo
   *   certificado do cliente, autor = cliente. Não cacheia (é por-cliente e não
   *   dá pra reusar entre clientes diferentes na mesma sessão).
   */
  async getProcuradorToken(opts?: {
    signingCert?: CertificadoCarregado;
    signerCnpj?: string;
    signerNome?: string;
  }): Promise<ProcuradorToken> {
    const usarAlt = !!opts?.signingCert;
    if (!usarAlt && this.procuradorToken && this.procuradorToken.expiresAt - Date.now() > 60_000) {
      return this.procuradorToken;
    }
    const tokens = await this.getTokens();
    const cert = usarAlt ? opts!.signingCert! : await this.getCert();
    const autorCnpj = opts?.signerCnpj?.replace(/\D/g, "") ?? this.config.cnpjMarch;
    const autorNome = opts?.signerNome ?? "MARCH CONTABILIDADE E ASSESSORIA TRIBUTARIA LTDA";
    const xml = construirTermoDeAutorizacao({
      contratanteCnpj: this.config.cnpjMarch,
      contratanteNome: "MARCH CONTABILIDADE E ASSESSORIA TRIBUTARIA LTDA",
      autorCnpj,
      autorNome,
    });
    const xmlAssinado = assinarTermoDeAutorizacao(xml, cert);
    const termoB64 = Buffer.from(xmlAssinado, "utf8").toString("base64");

    const body = {
      contratante: { numero: this.config.cnpjMarch, tipo: 2 },
      autorPedidoDados: { numero: autorCnpj, tipo: 2 },
      contribuinte: { numero: autorCnpj, tipo: 2 },
      pedidoDados: {
        idSistema: "AUTENTICAPROCURADOR",
        idServico: "ENVIOXMLASSINADO81",
        dados: JSON.stringify({ xml: termoB64 }),
      },
    };

    const res = await fetchWithMtls(`${this.config.gatewayUrl}/Apoiar`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${tokens.accessToken}`,
        jwt_token: tokens.jwtToken,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      timeoutMs: 30_000,
    });

    // Cache SERPRO — 304 Not Modified com token no ETag
    if (res.status === 304) {
      const etag = res.headers["etag"] ?? "";
      const m = /"autenticar_procurador_token:([^"]+)"/.exec(etag);
      if (!m) throw new Error(`304 sem token no ETag: ${etag}`);
      const expires = res.headers["expires"];
      const tok: ProcuradorToken = {
        token: m[1],
        expiresAt: expires ? new Date(expires).getTime() : Date.now() + 6 * 60 * 60 * 1000,
      };
      if (!usarAlt) this.procuradorToken = tok;
      return tok;
    }

    if (res.status !== 200) {
      throw new Error(`SERPRO /Apoiar falhou ${res.status}: ${res.body.slice(0, 400)}`);
    }
    const j = JSON.parse(res.body);
    if (j.status !== 200) {
      throw new Error(
        `SERPRO AUTENTICAPROCURADOR: ${(j.mensagens ?? []).map((m: { codigo: string; texto: string }) => `${m.codigo} ${m.texto}`).join(" | ")}`,
      );
    }
    const dados = JSON.parse(j.dados);
    const tok: ProcuradorToken = {
      token: dados.autenticar_procurador_token,
      expiresAt: dados.data_hora_expiracao
        ? new Date(dados.data_hora_expiracao).getTime()
        : Date.now() + 6 * 60 * 60 * 1000,
    };
    if (!usarAlt) this.procuradorToken = tok;
    return tok;
  }

  /**
   * Consulta pagamentos (DARF/DAS/GPS pagos) no e-CAC via PAGTOWEB/PAGAMENTOS71.
   * Se cnpjContribuinte === cnpjMarch: autoconsulta, dispensa procurador_token.
   * Se cnpjContribuinte !== cnpjMarch: precisa de procuração eletrônica ativa em nome do
   *   contribuinte outorgando à MARCH — usa autenticar_procurador_token no header.
   *
   * Retorna a lista de documentos e pagina automaticamente se vier > tamanhoDaPagina.
   */
  async consultarPagamentos(params: {
    cnpjContribuinte: string;
    dataInicial: Date;
    dataFinal: Date;
    tamanhoDaPagina?: number;
    /**
     * Se fornecido, usa o certificado próprio do cliente pra assinar o termo
     * de procuração. Autor do pedido = próprio cliente (autoassinado).
     * Útil quando não há procuração eletrônica no e-CAC — o cliente autoriza
     * a March a consultar seus dados via a assinatura do próprio cert.
     */
    signingCert?: CertificadoCarregado;
  }): Promise<PagtowebDocumento[]> {
    const cnpj = params.cnpjContribuinte.replace(/\D/g, "");
    const isAutoconsulta = cnpj === this.config.cnpjMarch;
    const tokens = await this.getTokens();
    const usarCertProprio = !!params.signingCert;

    let procuradorToken: string | null = null;
    let autorCnpj = this.config.cnpjMarch;
    if (usarCertProprio) {
      const tok = await this.getProcuradorToken({
        signingCert: params.signingCert,
        signerCnpj: cnpj, // o próprio cliente é o autor
      });
      procuradorToken = tok.token;
      autorCnpj = cnpj;
    } else if (!isAutoconsulta) {
      procuradorToken = (await this.getProcuradorToken()).token;
    }

    const iso = (d: Date) => d.toISOString().slice(0, 10);
    const tamanhoPagina = params.tamanhoDaPagina ?? 100;

    const acumulado: PagtowebDocumento[] = [];
    let pagina = 0;
    while (true) {
      const dadosConsulta = {
        intervaloDataArrecadacao: { dataInicial: iso(params.dataInicial), dataFinal: iso(params.dataFinal) },
        primeiroDaPagina: pagina * tamanhoPagina,
        tamanhoDaPagina: tamanhoPagina,
      };
      const body = {
        contratante: { numero: this.config.cnpjMarch, tipo: 2 },
        autorPedidoDados: { numero: autorCnpj, tipo: 2 },
        contribuinte: { numero: cnpj, tipo: 2 },
        pedidoDados: {
          idSistema: "PAGTOWEB",
          idServico: "PAGAMENTOS71",
          dados: JSON.stringify(dadosConsulta),
        },
      };

      const headers: OutgoingHttpHeaders = {
        Authorization: `Bearer ${tokens.accessToken}`,
        jwt_token: tokens.jwtToken,
        "Content-Type": "application/json",
      };
      if (procuradorToken) headers.autenticar_procurador_token = procuradorToken;

      const res = await fetchWithMtls(`${this.config.gatewayUrl}/Consultar`, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
        timeoutMs: 45_000,
      });
      if (res.status !== 200) {
        throw new Error(`PAGAMENTOS71 falhou ${res.status}: ${res.body.slice(0, 400)}`);
      }
      const j = JSON.parse(res.body);
      if (j.status !== 200) {
        const msgs = (j.mensagens ?? []) as Array<{ codigo: string; texto: string }>;
        // Sem-dados é sucesso: interrompe paginação
        if (msgs.some((m) => /nao|sem.*dados|sem.*resultado/i.test(m.texto))) return acumulado;
        throw new Error(`PAGAMENTOS71 body ${j.status}: ${msgs.map((m) => `${m.codigo} ${m.texto}`).join(" | ")}`);
      }
      const docs = j.dados ? (JSON.parse(j.dados) as PagtowebDocumento[]) : [];
      acumulado.push(...docs);
      if (docs.length < tamanhoPagina) break; // última página
      pagina++;
      if (pagina > 100) throw new Error("PAGAMENTOS71 abortado — >100 páginas (loop?)");
    }
    return acumulado;
  }
}
