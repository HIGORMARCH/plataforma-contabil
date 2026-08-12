/**
 * Storage local — fonte ÚNICA de arquivos da plataforma.
 *
 * Todo parser (SPED, DCTF, balanço, DEFIS) lê SOMENTE de C:\PlataformaContabil\
 * (raiz configurável via env PLATAFORMA_ROOT). Arquivos que ainda estão em
 * pastas legadas (Cliente.pastaFiscal, Z:\, ReceitanetBX) são COPIADOS pra cá
 * antes de serem processados — a plataforma NUNCA opera no arquivo original
 * do cliente/servidor. Ver memória project_fonte_unica_arquivos.
 *
 * Estrutura da pasta:
 *   <root>\<NOME_CLIENTE>_<CNPJ>\
 *     DCTF-ANTIGA\<AAAA>\<MM>.dec
 *     DCTFWEB\<AAAA>\<MM>.xml
 *     SPED-CONTRIBUICOES\<AAAA>\<MM>.txt
 *     SPED-FISCAL\<AAAA>\<MM>.txt
 *     SPED-ECD\<AAAA>\<AAAA>.txt          (anual)
 *     SPED-ECF\<AAAA>\<AAAA>.txt          (anual)
 *     BALANCOS-DOMINIO\<AAAA>\balanco.pdf, dre.pdf
 *     DEFIS\<AAAA>\<AAAA>.xml             (anual, Simples)
 */

import { createHash } from "node:crypto";
import { createReadStream, existsSync } from "node:fs";
import { copyFile, mkdir, readFile, writeFile, stat } from "node:fs/promises";
import path from "node:path";

/** Tipos de documento reconhecidos — determinam a subpasta. */
export type TipoDocumento =
  | "DCTF-ANTIGA"
  | "DCTFWEB"
  | "SPED-CONTRIBUICOES"
  | "SPED-FISCAL"
  | "SPED-ECD"
  | "SPED-ECD-DOMINIO"
  | "SPED-ECF"
  | "BALANCOS-DOMINIO"
  | "DEFIS";

export interface ClienteRef {
  razaoSocial: string;
  cnpj: string;
}

/** Raiz da pasta única — configurável via env, default no C:\. */
export function pastaRaiz(): string {
  return process.env.PLATAFORMA_ROOT ?? "C:\\PlataformaContabil";
}

/**
 * Normaliza o nome de um cliente pra ser usado como nome de pasta:
 * MAIÚSCULO_COM_UNDERSCORE_<CNPJ_SO_DIGITOS>. Sem acentos, sem caracteres
 * especiais. Duas chamadas com o mesmo cliente sempre produzem a mesma pasta.
 */
export function nomearCliente(cliente: ClienteRef): string {
  const razao = cliente.razaoSocial
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^A-Za-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .toUpperCase();
  const cnpjDigits = cliente.cnpj.replace(/\D/g, "");
  return `${razao}_${cnpjDigits}`;
}

/** Path da pasta raiz do cliente (não cria — só compõe). */
export function pastaCliente(cliente: ClienteRef): string {
  return path.join(pastaRaiz(), nomearCliente(cliente));
}

/** Path da pasta de um tipo de documento pra um ano específico. */
export function pastaTipoAno(cliente: ClienteRef, tipo: TipoDocumento, ano: number): string {
  return path.join(pastaCliente(cliente), tipo, String(ano));
}

/**
 * Path completo de um arquivo padronizado. `periodo` é opcional pra
 * documentos anuais (ECD, ECF, DEFIS) — nesses casos usa o próprio ano.
 * Para documentos mensais (DCTF, SPED-Contribuições, SPED-Fiscal, DCTFWEB),
 * passar mês 1-12 → gera `01.ext`, `02.ext`, etc.
 */
export function caminhoArquivo(
  cliente: ClienteRef,
  tipo: TipoDocumento,
  ano: number,
  periodo: number | null,
  extensao: string,
): string {
  const nome = periodo === null ? `${ano}${normalizarExt(extensao)}` : `${String(periodo).padStart(2, "0")}${normalizarExt(extensao)}`;
  return path.join(pastaTipoAno(cliente, tipo, ano), nome);
}

function normalizarExt(ext: string): string {
  const e = ext.trim().toLowerCase();
  return e.startsWith(".") ? e : `.${e}`;
}

/** Booleano de conveniência — false se qualquer erro (arquivo, permissão, etc.). */
export function existe(caminho: string): boolean {
  try {
    return existsSync(caminho);
  } catch {
    return false;
  }
}

/** Garante que a pasta pai do arquivo existe (cria recursivamente se preciso). */
async function garantirPasta(caminhoArquivo: string): Promise<void> {
  await mkdir(path.dirname(caminhoArquivo), { recursive: true });
}

/**
 * Copia um arquivo de qualquer lugar do disco pra o path padronizado do
 * cliente. Idempotente: se o destino já existe, PULA (não sobrescreve —
 * ver decisão em project_fonte_unica_arquivos regra 2). Nunca modifica a
 * origem — só lê.
 *
 * Retorna:
 *   - "copiado": arquivo foi copiado agora
 *   - "existente": destino já tinha arquivo (pulado)
 *   - "origem_ausente": arquivo de origem não existe
 */
export async function copiarDeOrigem(
  origem: string,
  destino: string,
): Promise<"copiado" | "existente" | "origem_ausente"> {
  if (!existsSync(origem)) return "origem_ausente";
  if (existsSync(destino)) return "existente";
  await garantirPasta(destino);
  await copyFile(origem, destino);
  return "copiado";
}

/**
 * Grava conteúdo (Buffer ou string) direto no path padronizado. Usado por
 * downloads da rede (eCAC, SERPRO) que já chegam como bytes na memória.
 * Idempotente igual copiarDeOrigem.
 */
export async function salvar(
  destino: string,
  conteudo: Buffer | string,
): Promise<"gravado" | "existente"> {
  if (existsSync(destino)) return "existente";
  await garantirPasta(destino);
  await writeFile(destino, conteudo);
  return "gravado";
}

/**
 * Hash SHA-256 do arquivo em stream (não carrega tudo em memória). Usado
 * pra rastrear se o arquivo mudou desde a última importação — o banco
 * guarda o hash, não o binário.
 */
export function hashSha256(caminho: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const h = createHash("sha256");
    const s = createReadStream(caminho);
    s.on("data", (d) => h.update(d));
    s.on("end", () => resolve(h.digest("hex")));
    s.on("error", reject);
  });
}

export async function tamanhoArquivo(caminho: string): Promise<number> {
  const st = await stat(caminho);
  return st.size;
}

/** Retorna o conteúdo do arquivo como Buffer (ler pra parsear). */
export function ler(caminho: string): Promise<Buffer> {
  return readFile(caminho);
}
