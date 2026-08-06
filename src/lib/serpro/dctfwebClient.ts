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
  valor: number; // BRL — valor do débito
  situacao?: string; // "APAG" | "COMP" | etc.
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
// Modo REAL — mTLS + payload SERPRO. Stub pronto pra ativar.
// -----------------------------------------------------------------------------
async function chamarSerproReal(params: {
  cert: { caminhoTemp: string; senha: string };
  cnpj: string;
  ano: number;
  mes: number;
}): Promise<DctfWebResposta> {
  // TODO ao ativar:
  //   1. Ler cert.caminhoTemp (.pfx) com fs.readFileSync
  //   2. Criar https.Agent com pfx + passphrase (mTLS)
  //   3. Autenticar no OAuth2 SERPRO (client_credentials com consumer_key/secret)
  //   4. POST no gateway /integra-contador/v1/Apoiar com body:
  //        {
  //          "contratante": { "numero": "<CNPJ March>", "tipo": 2 },
  //          "autorPedidoDados": { "numero": "<CNPJ March>", "tipo": 2 },
  //          "contribuinte": { "numero": cnpj, "tipo": 2 },
  //          "pedidoDados": {
  //            "idSistema": "DCTFWEB",
  //            "idServico": "CONSULTARDECLARACAOCOMPLETA12",
  //            "versaoSistema": "1.0",
  //            "dados": JSON.stringify({ anoPA: ano, mesPA: mes, categoria: "geral" })
  //          }
  //        }
  //   5. Parsear resposta pra DctfWebResposta

  void params;
  throw new Error(
    "SERPRO_DCTFWEB_MODE=real ainda não implementado. " +
      "Volte pra SERPRO_DCTFWEB_MODE=mock ou implemente a chamada real conforme TODO em dctfwebClient.ts.",
  );
}

// -----------------------------------------------------------------------------
// API pública — 1 função. Escolhe mock vs real com base em env.
// -----------------------------------------------------------------------------
export async function consultarDeclaracaoCompleta(params: {
  cert?: { caminhoTemp: string; senha: string };
  cnpj: string; // só dígitos
  ano: number;
  mes: number; // 1..12
}): Promise<DctfWebResposta> {
  if (MODE === "mock") {
    return gerarMock(params.cnpj, params.ano, params.mes);
  }
  if (!params.cert) {
    throw new Error("SERPRO_DCTFWEB_MODE=real exige `cert` (do cliente ou do escritório).");
  }
  return chamarSerproReal({ cert: params.cert, cnpj: params.cnpj, ano: params.ano, mes: params.mes });
}

export function modoAtual(): "mock" | "real" {
  return MODE;
}
