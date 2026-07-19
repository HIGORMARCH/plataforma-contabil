/**
 * Configuração do cliente SERPRO — lê de env vars.
 * O certificado da MARCH (escritório) fica no filesystem apontado por
 * SERPRO_CERT_PATH, senha em SERPRO_CERT_PASSWORD.
 * Certificados de cliente (quando metodoAcessoEcac=CERTIFICADO_PROPRIO) ficam
 * no path armazenado em Cliente.certificadoCaminho, senha cifrada em
 * Cliente.certificadoSenha (ver src/lib/crypto.ts).
 */
export type SerproConfig = {
  consumerKey: string;
  consumerSecret: string;
  certPath: string;
  certPassword: string;
  cnpjMarch: string;
  cronToken: string;
  authUrl: string;
  gatewayUrl: string;
};

export function getSerproConfig(): SerproConfig {
  const {
    SERPRO_CONSUMER_KEY,
    SERPRO_CONSUMER_SECRET,
    SERPRO_CERT_PATH,
    SERPRO_CERT_PASSWORD,
    SERPRO_CNPJ_MARCH,
    SERPRO_CRON_TOKEN,
  } = process.env;

  if (!SERPRO_CONSUMER_KEY || !SERPRO_CONSUMER_SECRET) {
    throw new Error("SERPRO_CONSUMER_KEY/SERPRO_CONSUMER_SECRET não configurados no .env.local");
  }
  if (!SERPRO_CERT_PATH || !SERPRO_CERT_PASSWORD) {
    throw new Error("SERPRO_CERT_PATH/SERPRO_CERT_PASSWORD não configurados no .env.local");
  }

  return {
    consumerKey: SERPRO_CONSUMER_KEY,
    consumerSecret: SERPRO_CONSUMER_SECRET,
    certPath: SERPRO_CERT_PATH,
    certPassword: SERPRO_CERT_PASSWORD,
    cnpjMarch: SERPRO_CNPJ_MARCH ?? "22397212000197",
    cronToken: SERPRO_CRON_TOKEN ?? "",
    authUrl: "https://autenticacao.sapi.serpro.gov.br/authenticate",
    gatewayUrl: "https://gateway.apiserpro.serpro.gov.br/integra-contador/v1",
  };
}
