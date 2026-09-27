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
  /**
   * Caminho REAL da pasta do cliente, escolhido no cadastro. Quando presente,
   * manda — a convenção `<RAZAO>_<CNPJ>` é só o palpite para quem ainda não
   * escolheu. As pastas de verdade foram criadas à mão, com o apelido da equipe
   * ("LUPO - PALMAS QUIOSQUE ..."), e nenhum nome derivado acerta isso.
   *
   * OBRIGATÓRIO no tipo (pode ser null), de propósito: enquanto era opcional,
   * seis telas montavam o ClienteRef sem ele — o `select` do Prisma não trazia o
   * campo e ninguém percebia. O resultado foi uma SEGUNDA árvore de pastas por
   * cliente, no formato `<RAZAO>_<CNPJ>`, recebendo arquivo enquanto a pasta
   * escolhida no cadastro ficava vazia. Com o campo obrigatório, esquecer vira
   * erro de compilação.
   */
  pastaLocal: string | null;
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

/**
 * Path da pasta do cliente (não cria — só compõe). É SEMPRE a pasta escolhida
 * no cadastro (`pastaLocal`), absoluta ou relativa à raiz.
 *
 * Sem `pastaLocal`, ERRA de propósito. Até 19/09/2026 esta função caía na
 * convenção `<RAZAO>_<CNPJ>`, e o palpite virava pasta de verdade: o sistema
 * criava uma segunda árvore por cliente e gravava documento nela, enquanto a
 * pasta organizada pelo contador ficava para trás. Pasta errada é pior que
 * pasta faltando — melhor a tela reclamar do cadastro incompleto.
 *
 * Para exibir o nome que a convenção geraria (placeholder do cadastro), use
 * `nomearCliente`; para checar sem quebrar a tela, `pastaClienteOuNull`.
 */
export function pastaCliente(cliente: ClienteRef): string {
  const p = pastaClienteOuNull(cliente);
  if (!p) {
    throw new Error(
      `Cliente "${cliente.razaoSocial}" está sem a pasta configurada. ` +
        `Defina em Cadastros → editar cliente → Pastas do cliente.`,
    );
  }
  return p;
}

/** Igual a `pastaCliente`, mas devolve null em vez de erro. */
export function pastaClienteOuNull(cliente: ClienteRef): string | null {
  const escolhida = cliente.pastaLocal?.trim();
  if (!escolhida) return null;
  return path.isAbsolute(escolhida) ? escolhida : path.join(pastaRaiz(), escolhida);
}

/**
 * Pasta do razão dos impostos do cliente — `<pasta do cliente>\RAZAO`.
 * Um arquivo por tributo, com o nome dizendo qual é (ver src/lib/razao/tributos.ts).
 */
export function pastaRazaoDoCliente(cliente: ClienteRef): string {
  return path.join(pastaCliente(cliente), PASTA_RAZAO);
}

/**
 * Cria a pasta do razão se ela ainda não existir. Chamado ao salvar o cadastro:
 * o contador precisa ter onde largar os PDFs, e a pasta some do caminho de
 * ninguém — é criada dentro da própria pasta do cliente.
 */
export async function garantirPastaRazao(cliente: ClienteRef): Promise<string | null> {
  const destino = pastaRazaoDoCliente(cliente);
  try {
    // Só cria o RAZAO quando a pasta do cliente já existe: criar a árvore
    // inteira a partir de um caminho convencionado inventaria pasta de cliente.
    if (!existsSync(pastaCliente(cliente))) return null;
    await mkdir(destino, { recursive: true });
    return destino;
  } catch {
    return null;
  }
}

/**
 * Pastas que existem hoje na raiz — alimenta o seletor do cadastro para o
 * contador escolher a do cliente em vez de digitar caminho. Ordenadas por nome.
 */
export function listarPastasDaRaiz(): string[] {
  try {
    const { readdirSync } = require("node:fs") as typeof import("node:fs");
    return readdirSync(pastaRaiz(), { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => e.name)
      .sort((a, b) => a.localeCompare(b, "pt-BR"));
  } catch {
    return [];
  }
}

/**
 * Onde cada tipo mora dentro da pasta do cliente.
 *
 * Estrutura definida pelo Higor em 02/09/2026, para o painel de obrigações
 * conseguir varrer as pastas e dizer de quais clientes os comprovantes já estão
 * ali. Três lugares, e a pergunta que cada um responde:
 *
 *   DECLARAÇÕES  — o que foi DECLARADO ao fisco (SPED, GIAM, DCTF, DEFIS)
 *   GUIAS        — o que foi PAGO (guia e comprovante de pagamento)
 *   RAZÃO        — os razões que a plataforma usa para comparar
 *
 * O que não responde a nenhuma das três (balanço, processo, notificação) fica
 * em OUTROS, para não sujar as pastas que o painel varre.
 */
export const PASTA_DECLARACOES = "DECLARAÇÕES";
export const PASTA_GUIAS = "GUIAS";
export const PASTA_RAZAO = "RAZÃO";
export const PASTA_OUTROS = "OUTROS";

/** Path da pasta de um tipo de documento pra um ano específico. */
export function pastaTipoAno(cliente: ClienteRef, tipo: TipoDocumento, ano: number): string {
  const grupo = tipo === "BALANCOS-DOMINIO" ? PASTA_OUTROS : PASTA_DECLARACOES;
  return path.join(pastaCliente(cliente), grupo, tipo, String(ano));
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
