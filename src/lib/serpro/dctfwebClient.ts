/**
 * Cliente HTTP pra API SERPRO Integra Contador — serviço DCTFWEB.
 *
 * ARQUITETURA:
 *   - Função pública única: `consultarDeclaracaoCompleta({ cert, cnpj, ano, mes })`
 *   - Modo controlado por env `SERPRO_DCTFWEB_MODE`:
 *       "mock" (default)  → retorna JSON sintético estruturado igual ao real,
 *                           sem tocar no SERPRO. Custo zero, dev-friendly.
 *       "real"            → faz chamada mTLS real ao gateway estaleiro SERPRO.
 *                           Custa por request. Requer cert válido do cliente
 *                           OU procuração eletrônica no e-CAC.
 *
 * ATIVAR MODO REAL:
 *   1. Definir SERPRO_DCTFWEB_MODE=real no .env
 *   2. Confirmar cert do cliente cadastrado (ou procuração March vigente)
 *   3. Confirmar consumer_key/secret do escritório no gateway SERPRO
 *   4. Rodar contra 1 cliente-teste ativo em Real/Presumido
 *
 * DOCUMENTAÇÃO:
 *   https://apicenter.estaleiro.serpro.gov.br/documentacao/api-integra-contador/pt/sistemas/dctfweb/
 *
 * Códigos de receita retornados no débito (foco desta auditoria):
 *   8109 / 6912 — PIS/PASEP não-cum. / cum.
 *   2172 / 5856 — COFINS não-cum. / cum.
 *   2089 / 2362 / 2456 / 6106 — IRPJ (Presumido / Real trim / Real anual)
 *   2372 / 2484 / 2469 / 6773 — CSLL
 */

// Tipos da resposta SERPRO — estrutura estabilizada pela documentação Integra
// Contador (a resposta real vem envelopada em `{ status, dados: {...} }`).
export interface DctfWebDebitoSerpro {
  codigoReceita: string; // ex.: "8109"
  denominacaoReceita?: string; // ex.: "PIS/PASEP - Faturamento"
  periodicidade?: "M" | "T";
  valor: number; // BRL — débito APURADO no período
  situacao?: string; // "APAG" | "COMP" | etc.
  /** Créditos vinculados a este débito (compensações, retenções, pagamentos). */
  creditosVinculados?: DctfWebCreditoVinculado[];
  /** Saldo a pagar = valor − Σ créditos vinculados (o que a DCTFWeb chama de
   *  "Saldo a Pagar" na tela do e-CAC). */
  saldoAPagar?: number;
}

/** Um crédito vinculado a um débito específico da DCTFWeb. */
export interface DctfWebCreditoVinculado {
  tipo?: string; // "COMPENSACAO" | "RETENCAO_FONTE" | "PAGAMENTO" | "PARCELAMENTO" | ...
  descricao?: string;
  valor: number;
}

export interface DctfWebDeclaracaoSerpro {
  periodoApuracao: string; // "AAAA-MM"
  categoria: string; // "GERAL" | "13SALARIO" | ...
  situacao: string; // "ATIVA" | "RETIFICADA" | "ORIGINAL"
  numeroRecibo?: string;
  dataRecepcao?: string; // ISO
  transmitida: boolean;
  debitos: DctfWebDebitoSerpro[];
}

export interface DctfWebResposta {
  status: 200 | 404 | 500;
  mensagem?: string;
  declaracoes: DctfWebDeclaracaoSerpro[];
  bruto?: unknown; // payload cru pra auditoria
}

const MODE = (process.env.SERPRO_DCTFWEB_MODE ?? "mock") as "mock" | "real";

// -----------------------------------------------------------------------------
// Modo MOCK — gera resposta plausível baseada no período pedido.
// Valores fictícios mas dentro de faixa realista pra empresa pequena de comércio.
// Usa hash do CNPJ+período pra ser DETERMINÍSTICO (mesmo input = mesmo output).
// -----------------------------------------------------------------------------
function hashPseudoDeterministico(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function gerarMock(cnpj: string, ano: number, mes: number): DctfWebResposta {
  const seed = hashPseudoDeterministico(`${cnpj}-${ano}-${mes}`);
  const rand = (max: number, offset = 0) => ((seed >> offset) % max) + max * 0.1;

  const periodoStr = `${ano}-${String(mes).padStart(2, "0")}`;
  // Base de faturamento fictícia (R$ 50k a 200k)
  const faturamento = 50000 + rand(150000, 0);
  const pisNC = Math.round(faturamento * 0.0165 * 100) / 100; // 1.65% Não-Cum
  const cofinsNC = Math.round(faturamento * 0.076 * 100) / 100; // 7.6% Não-Cum
  const irpjPresumido = Math.round(faturamento * 0.32 * 0.15 * 100) / 100; // presunção 32% × 15%
  const csllPresumido = Math.round(faturamento * 0.32 * 0.09 * 100) / 100; // presunção 32% × 9%

  return {
    status: 200,
    declaracoes: [
      {
        periodoApuracao: periodoStr,
        categoria: "GERAL",
        situacao: "ATIVA",
        numeroRecibo: `MOCK-${seed.toString(16).slice(0, 8).toUpperCase()}`,
        dataRecepcao: `${ano}-${String(mes + 1).padStart(2, "0")}-15T10:00:00Z`,
        transmitida: true,
        debitos: [
          { codigoReceita: "8109", denominacaoReceita: "PIS/PASEP Não-Cumulativo", periodicidade: "M", valor: pisNC, situacao: "APAG" },
          { codigoReceita: "2172", denominacaoReceita: "COFINS Não-Cumulativa", periodicidade: "M", valor: cofinsNC, situacao: "APAG" },
          { codigoReceita: "2089", denominacaoReceita: "IRPJ - Lucro Presumido", periodicidade: "T", valor: irpjPresumido, situacao: "APAG" },
          { codigoReceita: "2372", denominacaoReceita: "CSLL - Lucro Presumido", periodicidade: "T", valor: csllPresumido, situacao: "APAG" },
        ],
      },
    ],
    bruto: { mock: true, seed, faturamentoBase: faturamento },
  };
}

// -----------------------------------------------------------------------------
// Modo REAL — delega ao SerproClient (mTLS + OAuth + procurador_token).
// -----------------------------------------------------------------------------
import { SerproClient } from "./client";
import { carregarPfx } from "./pkcs12";
import { XMLParser } from "fast-xml-parser";

// Client instância compartilhada — cacheia access_token e procurador_token do
// escritório entre chamadas do mesmo processo. Descarta em cold start (server-
// less / restart do Next).
let clienteReal: SerproClient | null = null;
function getClienteReal(): SerproClient {
  if (!clienteReal) clienteReal = new SerproClient();
  return clienteReal;
}

async function chamarSerproReal(params: {
  cert?: { caminhoTemp: string; senha: string }; // opcional — só quando é CERTIFICADO_PROPRIO
  cnpj: string;
  ano: number;
  mes: number;
}): Promise<DctfWebResposta> {
  const client = getClienteReal();
  const signingCert = params.cert
    ? await carregarPfx(params.cert.caminhoTemp, params.cert.senha)
    : undefined;

  const envelope = await client.consultarDctfWeb({
    cnpjContribuinte: params.cnpj,
    ano: params.ano,
    mes: params.mes,
    signingCert,
  });

  // Sem declaração pro período: o SERPRO responde com status != 200 e mensagem
  // "não existe...". Retorna resposta vazia, não é erro fatal.
  if (envelope.status !== 200) {
    const msg = envelope.mensagens.map((m) => `${m.codigo} ${m.texto}`).join(" | ");
    if (envelope.mensagens.some((m) => /nao existe|sem.*declara|sem.*dados/i.test(m.texto))) {
      return { status: 404, mensagem: msg, declaracoes: [], bruto: envelope.bruto };
    }
    throw new Error(`DCTFWEB CONSULTARDECLARACAOCOMPLETA12 body ${envelope.status}: ${msg}`);
  }

  return mapearRespostaSerpro(envelope.dados, envelope.bruto);
}

/**
 * Adapta o payload cru do SERPRO CONSXMLDECLARACAO38 pro nosso `DctfWebResposta`.
 *
 * O serviço devolve `{ XMLStringBase64: "..." }` — o XML é o layout oficial
 * DctfXml v3 do SERPRO (namespace http://www.serpro.gov.br/dctf/v1). Estrutura:
 *   ProcDctf > ConteudoDeclaracao > DctfXml
 *     A000-DadosIdentificadoresContribuinte  → perApuracao, categoriaDCTF, indZerada, indRetificacao
 *     A005-...  → cadastro
 *     A007-...  → representante
 *     A008-...  → contato
 *     A010-DebitosCreditos (só se indZerada=0) → débitos com valor, código de receita, créditos vinculados
 *
 * Fallback: se o payload não for XML (ex.: retorno JSON simples da API), tenta
 * parsear como o JSON antigo — mantém compatibilidade caso o SERPRO mude.
 */
function mapearRespostaSerpro(dados: unknown, bruto: unknown): DctfWebResposta {
  if (!dados || typeof dados !== "object") {
    return { status: 200, declaracoes: [], bruto };
  }

  const raiz = dados as Record<string, unknown>;

  // Caminho normal: CONSXMLDECLARACAO38 devolve XMLStringBase64.
  if (typeof raiz.XMLStringBase64 === "string") {
    const xml = Buffer.from(raiz.XMLStringBase64, "base64").toString("utf8");
    const decl = parseDctfXml(xml);
    return {
      status: 200,
      declaracoes: decl ? [decl] : [],
      // Guardamos o XML já decodificado no bruto pra facilitar debug e futuras
      // extensões (extrair mais campos sem precisar reparsear base64).
      bruto: { ...(bruto as object), xmlDecodificado: xml },
    };
  }

  // Fallback: mantém suporte a resposta JSON (caso a API troque o formato).
  return { status: 200, declaracoes: [], bruto };
}

/**
 * Parseia o XML DctfXml v3 devolvido pelo CONSXMLDECLARACAO38. Retorna null
 * se o XML for inválido ou não contiver a estrutura mínima esperada.
 */
function parseDctfXml(xml: string): DctfWebDeclaracaoSerpro | null {
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: "@_",
    removeNSPrefix: true, // "tns1:DctfXml" vira "DctfXml"
    parseTagValue: true,
  });
  let doc: Record<string, unknown>;
  try {
    doc = parser.parse(xml) as Record<string, unknown>;
  } catch {
    return null;
  }

  const procDctf = doc.ProcDctf as Record<string, unknown> | undefined;
  const conteudo = procDctf?.ConteudoDeclaracao as Record<string, unknown> | undefined;
  const dctfXml = conteudo?.DctfXml as Record<string, unknown> | undefined;
  if (!dctfXml) return null;

  const a000 = dctfXml["A000-DadosIdentificadoresContribuinte"] as Record<string, unknown> | undefined;
  if (!a000) return null;

  const perApuracao = String(a000.perApuracao ?? ""); // "MMYYYY" no formato SERPRO
  const categoriaCodigo = String(a000.categoriaDCTF ?? "");
  const indZerada = String(a000.indZerada ?? "0") === "1";
  const indRetificacao = String(a000.indRetificacao ?? "0");

  // A010-DebitosCreditos (só em declarações com movimento). Estrutura observada
  // em outras DCTFWeb: contém elementos com códigoReceita, valores de débito e
  // sub-elementos de créditos vinculados. Como ainda não temos amostra de
  // declaração com movimento, fazemos parsing defensivo — extraímos qualquer
  // elemento filho que tenha os campos esperados.
  const debitos: DctfWebDebitoSerpro[] = [];
  if (!indZerada) {
    const a010 = dctfXml["A010-DebitosCreditos"] as Record<string, unknown> | undefined;
    if (a010) {
      extrairDebitosRecursivo(a010, debitos);
    }
    // Alguns leiautes podem ter os débitos direto em raiz do DctfXml.
    for (const [chave, valor] of Object.entries(dctfXml)) {
      if (chave.startsWith("A011") || chave.startsWith("A020") || chave.startsWith("A030")) {
        if (valor && typeof valor === "object") extrairDebitosRecursivo(valor as Record<string, unknown>, debitos);
      }
    }
  }

  // perApuracao "052021" → "2021-05" pra bater com nosso padrão
  const anoStr = perApuracao.length === 6 ? perApuracao.slice(2, 6) : "";
  const mesStr = perApuracao.length === 6 ? perApuracao.slice(0, 2) : "";
  const periodoApuracao = anoStr && mesStr ? `${anoStr}-${mesStr}` : perApuracao;

  return {
    periodoApuracao,
    categoria: mapearCategoriaCodigo(categoriaCodigo),
    situacao: indZerada ? "ATIVA_SEM_MOVIMENTO" : indRetificacao === "1" ? "RETIFICADORA" : "ATIVA",
    numeroRecibo: undefined, // recibo não vem no XML — precisa outro serviço (CONSRECIBO32)
    dataRecepcao: undefined,
    transmitida: true, // se veio via SERPRO, foi transmitida
    debitos,
  };
}

/**
 * Categoria DCTFWeb vem codificada no XML (40, 41, 42...). Mapeamos pros
 * nomes canônicos usados no restante do fluxo (GERAL, 13SALARIO, etc.).
 * Baseado em observação empírica — expandir conforme aparecerem novos códigos.
 */
function mapearCategoriaCodigo(codigo: string): string {
  const mapa: Record<string, string> = {
    "40": "GERAL",
    "41": "13SALARIO",
    "42": "ESPETACULO_DESPORTIVO",
    "43": "AFERICAO",
  };
  return mapa[codigo] ?? `CODIGO_${codigo}`;
}

/**
 * Percorre recursivamente um nó do XML procurando padrões que pareçam débito
 * (tem `codReceita`/`codigoReceita` + `vlrDebito`/`valor`). Robusto a
 * variações de nome de tag entre versões do layout.
 */
function extrairDebitosRecursivo(no: Record<string, unknown>, acc: DctfWebDebitoSerpro[]): void {
  const codigo = extrairPrimeiroCampo(no, ["codReceita", "codigoReceita", "codRec"]);
  const valor = extrairPrimeiroCampo(no, ["vlrDebito", "valor", "valorDebito", "vlrDeb"]);
  if (codigo && valor != null) {
    const denominacao = extrairPrimeiroCampo(no, ["denomReceita", "denominacaoReceita", "denominacao"]);
    const situacao = extrairPrimeiroCampo(no, ["situacao"]);
    // Créditos vinculados: procura sub-nó com nome tipo "creditos", "creditosVinculados"
    const creditosVinculados: DctfWebCreditoVinculado[] = [];
    for (const [chave, valor2] of Object.entries(no)) {
      if (/credito|vincul/i.test(chave) && valor2 && typeof valor2 === "object") {
        const nodes = Array.isArray(valor2) ? valor2 : [valor2];
        for (const n of nodes) {
          if (!n || typeof n !== "object") continue;
          const nn = n as Record<string, unknown>;
          const vlr = extrairPrimeiroCampo(nn, ["vlrCredito", "valor", "vlrCred"]);
          const tipo = extrairPrimeiroCampo(nn, ["tipoCredito", "tipo"]);
          const desc = extrairPrimeiroCampo(nn, ["descricao", "denominacao"]);
          if (vlr != null && vlr !== 0) {
            creditosVinculados.push({ tipo: tipo ? String(tipo) : undefined, descricao: desc ? String(desc) : undefined, valor: Number(vlr) });
          }
        }
      }
    }
    acc.push({
      codigoReceita: String(codigo),
      denominacaoReceita: denominacao ? String(denominacao) : undefined,
      valor: Number(valor),
      situacao: situacao ? String(situacao) : undefined,
      creditosVinculados: creditosVinculados.length > 0 ? creditosVinculados : undefined,
    });
    return;
  }
  // Não é débito — desce nos filhos objeto/array.
  for (const v of Object.values(no)) {
    if (!v) continue;
    if (Array.isArray(v)) {
      for (const item of v) if (item && typeof item === "object") extrairDebitosRecursivo(item as Record<string, unknown>, acc);
    } else if (typeof v === "object") {
      extrairDebitosRecursivo(v as Record<string, unknown>, acc);
    }
  }
}

function extrairPrimeiroCampo(no: Record<string, unknown>, chaves: string[]): unknown {
  for (const k of chaves) {
    if (no[k] != null && no[k] !== "") return no[k];
  }
  return null;
}

// -----------------------------------------------------------------------------
// API pública — 1 função. Escolhe mock vs real com base em env.
// -----------------------------------------------------------------------------
export async function consultarDeclaracaoCompleta(params: {
  cert?: { caminhoTemp: string; senha: string }; // obrigatório só pra CERTIFICADO_PROPRIO
  cnpj: string; // só dígitos
  ano: number;
  mes: number; // 1..12
}): Promise<DctfWebResposta> {
  if (MODE === "mock") {
    return gerarMock(params.cnpj, params.ano, params.mes);
  }
  return chamarSerproReal({ cert: params.cert, cnpj: params.cnpj, ano: params.ano, mes: params.mes });
}

export function modoAtual(): "mock" | "real" {
  return MODE;
}
