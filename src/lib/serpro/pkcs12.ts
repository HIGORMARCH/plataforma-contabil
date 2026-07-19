import { readFile } from "node:fs/promises";
import { X509Certificate, createPrivateKey } from "node:crypto";

/**
 * Extrai certificado + chave privada de um .pfx (PKCS#12) usando OpenSSL nativo
 * do Node (>= 20). Retorna cert em PEM (base64 sem cabeçalho — pronto pra X509Data)
 * + chave privada em PEM (com cabeçalho — pronta pra assinatura).
 *
 * mTLS: para requests que precisam de client cert, passamos o buffer + senha
 * direto pro https.Agent — o Node aceita PFX nativamente, não precisa extrair.
 * Só usamos essa extração pra ASSINAR XML (o xml-crypto precisa da chave em PEM).
 */

// Node 20+ tem forma nativa via crypto.parsePKCS12 (planned) ou via pkcs12-derivar-pem via openssl?
// Aqui usamos node-forge, mas queremos evitar dependência. Alternativa: openssl CLI.
// Solução limpa: node:crypto expõe createPrivateKey/X509 a partir de PEM.
// Pra converter PFX→PEM em runtime, usamos o próprio Node via KeyObject.
// Node 21+ suporta pkcs12 direto em KeyObject.from({ format: "pkcs12", ...}).
// Como ainda não é estável em todas as versões, delegamos ao TLS: passamos o
// PFX buffer pro Node em createSecureContext() e extraímos o cert/key via APIs.
//
// A abordagem mais simples e compatível: usar node-forge SÓ pra extração.
// (node-forge já é dep transitiva de xml-crypto? Vamos ver.) — Não é: xml-crypto
// depende de @xmldom/xmldom. Vamos instalar node-forge só pra parse do PFX.

import forge from "node-forge";

export type CertificadoCarregado = {
  /** PFX bruto — pra passar direto ao https.Agent como mTLS client cert */
  pfxBuffer: Buffer;
  pfxPassword: string;
  /** Chave privada em PEM (com cabeçalho -----BEGIN PRIVATE KEY-----) */
  privateKeyPem: string;
  /** Certificado em PEM (com cabeçalho -----BEGIN CERTIFICATE-----) */
  certPem: string;
  /** Certificado em base64 puro (sem cabeçalho) — pra <X509Certificate> no XMLDSig */
  certBase64: string;
  /** Common Name do certificado (útil pra log) */
  commonName: string;
  /** Data de expiração */
  notAfter: Date;
};

export async function carregarPfx(path: string, senha: string): Promise<CertificadoCarregado> {
  const pfxBuffer = await readFile(path);
  const p12Asn1 = forge.asn1.fromDer(forge.util.createBuffer(pfxBuffer.toString("binary")));
  const p12 = forge.pkcs12.pkcs12FromAsn1(p12Asn1, senha);

  // extrai chave privada
  const keyBags = p12.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag });
  const keyBag =
    keyBags[forge.pki.oids.pkcs8ShroudedKeyBag]?.[0] ??
    p12.getBags({ bagType: forge.pki.oids.keyBag })[forge.pki.oids.keyBag]?.[0];
  if (!keyBag?.key) throw new Error(`Chave privada não encontrada em ${path}`);
  const privateKeyPem = forge.pki.privateKeyToPem(keyBag.key);

  // extrai certificado
  const certBags = p12.getBags({ bagType: forge.pki.oids.certBag });
  const certBag = certBags[forge.pki.oids.certBag]?.[0];
  if (!certBag?.cert) throw new Error(`Certificado não encontrado em ${path}`);
  const certPem = forge.pki.certificateToPem(certBag.cert);

  // extrai info via X509Certificate do Node
  const x509 = new X509Certificate(certPem);
  const cnMatch = /CN=([^,]+)/.exec(x509.subject);
  const commonName = cnMatch?.[1]?.trim() ?? "";

  const certBase64 = certPem
    .replace(/-----BEGIN CERTIFICATE-----/g, "")
    .replace(/-----END CERTIFICATE-----/g, "")
    .replace(/\s+/g, "");

  return {
    pfxBuffer,
    pfxPassword: senha,
    privateKeyPem,
    certPem,
    certBase64,
    commonName,
    notAfter: new Date(x509.validTo),
  };
}
