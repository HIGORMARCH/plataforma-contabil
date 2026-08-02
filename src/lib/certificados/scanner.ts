/**
 * Scanner de certificados digitais (.pfx) da March.
 *
 * A March nomeia os arquivos .pfx num padrão previsível:
 *   NOME DO CLIENTE senha SENHA_AQUI VENC dd.mm.aaaa.pfx
 *
 * Este scanner lê a pasta (ex.: Z:\MARCH - CERTIFICADOS DIGITAIS\PJ),
 * extrai (nome, senha, validade) SÓ DO NOME DO ARQUIVO — sem abrir o .pfx
 * (evita dependência de node-forge / OpenSSL).
 *
 * Depois faz fuzzy match com a razão social do cliente.
 */

import { readdir } from "node:fs/promises";
import path from "node:path";

export interface CertificadoEncontrado {
  arquivo: string;      // só o nome do arquivo (sem pasta)
  caminhoCompleto: string;
  razaoSocialInferida: string; // limpa do nome (sem "senha X VENC Y.pfx")
  senha?: string;              // extraida do nome
  validade?: string;           // dd.mm.aaaa
  validadeDate?: Date;
}

/**
 * Extrai (nome limpo, senha, validade) de um nome de arquivo .pfx no padrão da March.
 * Retorna null se não bater o padrão.
 */
export function parseNomeCertificado(nomeArquivo: string): CertificadoEncontrado | null {
  if (!nomeArquivo.toLowerCase().endsWith(".pfx")) return null;
  const semExt = nomeArquivo.replace(/\.pfx$/i, "");

  // Padrões esperados (do mais estrito ao mais permissivo):
  //   "NOME senha SENHA VENC dd.mm.aaaa"
  //   "NOME senha SENHA venc dd.mm.aaaa"
  //   "NOME senha SENHA VENCIDO dd.mm.aaaa" (ignora — é vencido)
  //   "NOME VENC dd.mm.aaaa" (sem senha explícita no nome)
  const regexCompleto = /^(.+?)\s+senha\s+(.+?)\s+VENC(?:IDO|IMENTO)?\s+(\d{1,2}[./-]\d{1,2}[./-]\d{2,4})$/i;
  const regexSemSenha = /^(.+?)\s+VENC(?:IDO|IMENTO)?\s+(\d{1,2}[./-]\d{1,2}[./-]\d{2,4})$/i;

  let m = semExt.match(regexCompleto);
  if (m) {
    return {
      arquivo: nomeArquivo,
      caminhoCompleto: "",
      razaoSocialInferida: m[1].trim(),
      senha: m[2].trim(),
      validade: m[3],
      validadeDate: parseData(m[3]),
    };
  }
  m = semExt.match(regexSemSenha);
  if (m) {
    return {
      arquivo: nomeArquivo,
      caminhoCompleto: "",
      razaoSocialInferida: m[1].trim(),
      validade: m[2],
      validadeDate: parseData(m[2]),
    };
  }
  // Sem padrão: só usa o nome do arquivo como razão social
  return {
    arquivo: nomeArquivo,
    caminhoCompleto: "",
    razaoSocialInferida: semExt.trim(),
  };
}

function parseData(s: string): Date | undefined {
  const m = s.match(/(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})/);
  if (!m) return undefined;
  const dia = Number(m[1]);
  const mes = Number(m[2]) - 1;
  let ano = Number(m[3]);
  if (ano < 100) ano += 2000;
  const d = new Date(ano, mes, dia);
  return isNaN(d.getTime()) ? undefined : d;
}

/**
 * Normaliza uma string pra comparação: sem acentos, maiúsculas, colapsa espaços.
 */
function normalizar(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[.,/\\-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Similaridade simples baseada em quantas palavras significativas coincidem.
 * Retorna 0.0 a 1.0. 1.0 = todas as palavras do query aparecem no candidato.
 */
export function similaridade(query: string, candidato: string): number {
  const stopWords = new Set(["LTDA", "ME", "EPP", "EIRELI", "SA", "CIA", "S", "A", "DA", "DE", "DO", "DAS", "DOS"]);
  const palavrasQuery = normalizar(query).split(" ").filter((p) => p.length >= 3 && !stopWords.has(p));
  if (palavrasQuery.length === 0) return 0;
  const nomeCand = normalizar(candidato);
  const encontradas = palavrasQuery.filter((p) => nomeCand.includes(p));
  return encontradas.length / palavrasQuery.length;
}

/**
 * Escaneia uma pasta procurando .pfx e devolve lista de certificados parseados.
 * Não abre nenhum .pfx — só lê nomes de arquivo.
 */
export async function escanearPasta(pasta: string): Promise<CertificadoEncontrado[]> {
  let arquivos: string[];
  try {
    arquivos = await readdir(pasta);
  } catch (e) {
    throw new Error(`Não consegui ler a pasta ${pasta}: ${(e as Error).message}`);
  }
  const certs: CertificadoEncontrado[] = [];
  for (const nome of arquivos) {
    const parsed = parseNomeCertificado(nome);
    if (parsed) {
      parsed.caminhoCompleto = path.join(pasta, nome);
      certs.push(parsed);
    }
  }
  return certs;
}

/**
 * Acha o melhor certificado que combina com uma razão social.
 * Retorna null se nenhum candidato bater com similaridade > minSim (default 0.6).
 */
export async function acharCertificadoPorNome(
  pasta: string,
  razaoSocial: string,
  minSim: number = 0.6,
): Promise<CertificadoEncontrado | null> {
  const certs = await escanearPasta(pasta);
  let melhor: CertificadoEncontrado | null = null;
  let melhorScore = 0;
  for (const c of certs) {
    const s = similaridade(razaoSocial, c.razaoSocialInferida);
    if (s > melhorScore) {
      melhorScore = s;
      melhor = c;
    }
  }
  return melhorScore >= minSim ? melhor : null;
}
