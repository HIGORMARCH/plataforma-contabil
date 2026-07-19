/**
 * Determina o caminho onde salvar uploads de estoque dos clientes.
 *
 * Estrutura no Z:
 *   Z:\HIGOR OBRIGACOES MENSAIS\TRIBUTACAO NCM\<cnpj-limpo>\<data-vigencia>\<original-ou-timestamp>.xls
 */
import { mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";

const RAIZ_TRIBUTACAO = "Z:\\HIGOR OBRIGACOES MENSAIS\\TRIBUTACAO NCM";

function limparNome(s: string): string {
  return s.replace(/[^A-Za-z0-9._-]+/g, "_").slice(0, 100);
}

function digitos(s: string): string {
  return (s || "").replace(/\D/g, "");
}

/** Retorna a pasta destino para uma vigência específica, criando se não existir. */
export async function garantirPastaVigencia(cnpjCliente: string, dataVigencia: Date): Promise<string> {
  const cnpj = digitos(cnpjCliente).padStart(14, "0").slice(0, 14) || "sem-cnpj";
  const dataIso = dataVigencia.toISOString().slice(0, 10);
  const dir = path.join(RAIZ_TRIBUTACAO, cnpj, dataIso);
  if (!existsSync(dir)) {
    await mkdir(dir, { recursive: true });
  }
  return dir;
}

/** Monta o caminho completo do arquivo a salvar. */
export function caminhoArquivoEstoque(pasta: string, nomeOriginal: string): string {
  const nome = limparNome(nomeOriginal) || `estoque-${Date.now()}.xls`;
  return path.join(pasta, nome);
}
