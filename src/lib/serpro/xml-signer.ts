import { SignedXml } from "xml-crypto";
import type { CertificadoCarregado } from "./pkcs12";

/**
 * Assina o XML "Termo de Autorização" (SERPRO Autentica-Procurador).
 *
 * Requisitos SERPRO (validados no Python via signxml):
 *   - Root element: <termoDeAutorizacao>
 *   - Signature xmlns="http://www.w3.org/2000/09/xmldsig#" ANEXADA dentro do root
 *   - SignedInfo:
 *       CanonicalizationMethod: c14n (http://www.w3.org/TR/2001/REC-xml-c14n-20010315)
 *       SignatureMethod: rsa-sha256 (http://www.w3.org/2001/04/xmldsig-more#rsa-sha256)
 *       Reference URI="":
 *         Transforms: enveloped-signature + c14n
 *         DigestMethod: sha256 (http://www.w3.org/2001/04/xmlenc#sha256)
 *   - KeyInfo/X509Data/X509Certificate (cert do assinante em base64)
 */

const C14N = "http://www.w3.org/TR/2001/REC-xml-c14n-20010315";
const RSA_SHA256 = "http://www.w3.org/2001/04/xmldsig-more#rsa-sha256";
const SHA256 = "http://www.w3.org/2001/04/xmlenc#sha256";
const ENVELOPED = "http://www.w3.org/2000/09/xmldsig#enveloped-signature";

export function assinarTermoDeAutorizacao(xml: string, cert: CertificadoCarregado): string {
  const sig = new SignedXml({
    privateKey: cert.privateKeyPem,
    publicCert: cert.certPem,
    signatureAlgorithm: RSA_SHA256,
    canonicalizationAlgorithm: C14N,
  });

  sig.addReference({
    xpath: "/*[local-name()='termoDeAutorizacao']",
    transforms: [ENVELOPED, C14N],
    digestAlgorithm: SHA256,
    // SERPRO exige URI="" (assina o documento inteiro, sem Id no root).
    // isEmptyUri=true no xml-crypto força URI="" E não adiciona Id="_0".
    isEmptyUri: true,
  });

  sig.computeSignature(xml, {
    location: {
      reference: "/*[local-name()='termoDeAutorizacao']",
      action: "append", // <Signature/> vai como último filho de <termoDeAutorizacao>
    },
  });

  return sig.getSignedXml();
}

/**
 * Constrói o XML "Termo de Autorização" (sem assinatura ainda — o assinador
 * anexa depois). Template idêntico ao termo_autorizacao_request.dart:41.
 */
export function construirTermoDeAutorizacao(params: {
  contratanteCnpj: string;
  contratanteNome: string;
  autorCnpj: string;
  autorNome: string;
  dataAssinatura?: Date;
  dataVigencia?: Date;
}): string {
  const hoje = params.dataAssinatura ?? new Date();
  const vigencia = params.dataVigencia ?? new Date(hoje.getTime() + 365 * 24 * 60 * 60 * 1000);
  const fmt = (d: Date) =>
    `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;

  const cleanCnpj = (c: string) => c.replace(/\D/g, "");

  return (
    '<?xml version="1.0" encoding="UTF-8"?>' +
    "<termoDeAutorizacao>" +
    "<dados>" +
    '<sistema id="API Integra Contador"/>' +
    '<termo texto="Autorizo a empresa CONTRATANTE, identificada neste termo de autorização como DESTINATÁRIO, a executar as requisições dos serviços web disponibilizados pela API INTEGRA CONTADOR, onde terei o papel de AUTOR PEDIDO DE DADOS no corpo da mensagem enviada na requisição do serviço web. Esse termo de autorização está assinado digitalmente com o certificado digital do PROCURADOR ou OUTORGADO DO CONTRIBUINTE responsável, identificado como AUTOR DO PEDIDO DE DADOS."/>' +
    '<avisoLegal texto="O acesso a estas informações foi autorizado pelo próprio PROCURADOR ou OUTORGADO DO CONTRIBUINTE, responsável pela informação, via assinatura digital. É dever do destinatário da autorização e consumidor deste acesso observar a adoção de base legal para o tratamento dos dados recebidos conforme artigos 7º ou 11º da LGPD (Lei n.º 13.709, de 14 de agosto de 2018), aos direitos do titular dos dados (art. 9º, 17 e 18, da LGPD) e aos princípios que norteiam todos os tratamentos de dados no Brasil (art. 6º, da LGPD)."/>' +
    '<finalidade texto="A finalidade única e exclusiva desse TERMO DE AUTORIZAÇÃO, é garantir que o CONTRATANTE apresente a API INTEGRA CONTADOR esse consentimento do PROCURADOR ou OUTORGADO DO CONTRIBUINTE assinado digitalmente, para que possa realizar as requisições dos serviços web da API INTEGRA CONTADOR em nome do AUTOR PEDIDO DE DADOS (PROCURADOR ou OUTORGADO DO CONTRIBUINTE)."/>' +
    `<dataAssinatura data="${fmt(hoje)}"/>` +
    `<vigencia data="${fmt(vigencia)}"/>` +
    `<destinatario numero="${cleanCnpj(params.contratanteCnpj)}" nome="${params.contratanteNome}" tipo="PJ" papel="contratante"/>` +
    `<assinadoPor numero="${cleanCnpj(params.autorCnpj)}" nome="${params.autorNome}" tipo="PJ" papel="autor pedido de dados"/>` +
    "</dados>" +
    "</termoDeAutorizacao>"
  );
}
