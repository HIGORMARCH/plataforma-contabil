/**
 * O robô organizador: varre os endereços cadastrados, identifica cada arquivo
 * pelo conteúdo e o arquiva na pasta do cliente, com nome padronizado.
 *
 * DUAS AÇÕES, CONFORME A ORIGEM:
 *
 *   origem DENTRO de C:\PlataformaContabil  → MOVE (organiza no lugar)
 *   origem FORA (Z:, Downloads, pen drive)  → COPIA (nunca toca no original)
 *
 * A distinção não é capricho: copiar de dentro da própria pasta criaria a
 * segunda cópia do mesmo documento — exatamente o que o organizador existe pra
 * evitar. E mover de um servidor de terceiro violaria a regra da casa.
 *
 * MODO SIMULAÇÃO É O PADRÃO. `simular: true` percorre tudo, decide tudo, e não
 * escreve um byte. É assim que se confere um robô que mexe em arquivo.
 *
 * IDEMPOTENTE POR CONTEÚDO: a chave é o SHA-256. O mesmo documento chegando por
 * dois endereços, com dois nomes, é arquivado uma vez só.
 */

import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { copyFile, mkdir, readdir, readFile, rename, stat } from "node:fs/promises";
import path from "node:path";
import { prisma } from "@/lib/db";
import { pastaCliente, pastaRaiz } from "@/lib/storage/filesystem";
import { classificarPdf, classificarTexto, type Classificacao } from "./classificar";
import { destinoDoDocumento, pastaQuarentena } from "./destino";

/** Quanto do arquivo basta ler pra identificar (o registro 0000 está no topo). */
const AMOSTRA_BYTES = 8 * 1024;
/** Teto de arquivos por execução — evita varredura infinita em pasta gigante. */
const LIMITE_ARQUIVOS = 5000;

const EXTENSOES = new Set([".pdf", ".txt", ".dec", ".xml"]);

/**
 * Pastas que o robô não varre.
 *
 * `DOCUMENTOS FISCAIS` fica de fora de propósito: são centenas de XML e zip de
 * nota por cliente, já organizados por competência pelo escritório, e que o
 * organizador não teria o que melhorar — entrariam no relatório só como ruído.
 */
const PASTAS_IGNORADAS = new Set([
  "_A CLASSIFICAR",
  "DOCUMENTOS FISCAIS",
  "node_modules",
  ".git",
  "$RECYCLE.BIN",
  "System Volume Information",
]);

export type StatusItem =
  | "ARQUIVADO"
  | "JA_NO_LUGAR"
  | "JA_EXISTIA"
  | "CONFLITO"
  | "QUARENTENA"
  | "ERRO";

export interface ItemOrganizado {
  origem: string;
  nomeArquivo: string;
  status: StatusItem;
  tipo: string | null;
  cliente: string | null;
  destino: string | null;
  acao: "mover" | "copiar" | null;
  detalhe: string;
}

export interface RelatorioOrganizacao {
  simulado: boolean;
  origens: string[];
  arquivosVistos: number;
  arquivados: number;
  jaNoLugar: number;
  jaExistia: number;
  conflitos: number;
  quarentena: number;
  erros: number;
  itens: ItemOrganizado[];
}

async function listarArquivos(raiz: string, recursivo: boolean): Promise<string[]> {
  const achados: string[] = [];
  const pilha = [raiz];
  while (pilha.length > 0 && achados.length < LIMITE_ARQUIVOS) {
    const dir = pilha.pop()!;
    let entradas;
    try {
      entradas = await readdir(dir, { withFileTypes: true });
    } catch {
      continue; // pasta sem permissão ou sumiu no meio da varredura
    }
    for (const e of entradas) {
      const completo = path.join(dir, e.name);
      if (e.isDirectory()) {
        if (recursivo && !PASTAS_IGNORADAS.has(e.name)) pilha.push(completo);
        continue;
      }
      if (!e.isFile()) continue;
      if (EXTENSOES.has(path.extname(e.name).toLowerCase())) achados.push(completo);
    }
  }
  return achados;
}

async function hashDoArquivo(caminho: string): Promise<string> {
  const bytes = await readFile(caminho);
  return createHash("sha256").update(bytes).digest("hex");
}

/** Lê o começo do arquivo como texto (identificação de SPED/DCTF/GIAM). */
async function amostraTexto(caminho: string): Promise<string> {
  const bytes = await readFile(caminho);
  return bytes.subarray(0, AMOSTRA_BYTES).toString("latin1");
}

async function classificarArquivo(
  caminho: string,
): Promise<{ ok: true; classificacao: Classificacao } | { ok: false; motivo: string }> {
  const ext = path.extname(caminho).toLowerCase();
  const nome = path.basename(caminho);

  if (ext === ".pdf") {
    try {
      const { PDFParse } = await import("pdf-parse");
      const { text } = await new PDFParse({ data: await readFile(caminho) }).getText();
      if (!text.trim()) {
        return { ok: false, motivo: "PDF sem texto (digitalizado?) — precisa de OCR" };
      }
      return classificarPdf(text, nome);
    } catch (e) {
      return { ok: false, motivo: `falha ao ler o PDF: ${e instanceof Error ? e.message : String(e)}` };
    }
  }

  return classificarTexto(ext, await amostraTexto(caminho), nome);
}

/** O arquivo está debaixo da raiz da plataforma? Define mover vs copiar. */
function dentroDaRaiz(caminho: string, raiz: string): boolean {
  const rel = path.relative(raiz, caminho);
  return !rel.startsWith("..") && !path.isAbsolute(rel);
}

export async function organizarDocumentos(params: {
  escritorioId: string;
  /** Sem escrever nada — só diz o que faria. Padrão: true. */
  simular?: boolean;
  /** Limita a execução a um endereço cadastrado. */
  origemId?: string;
}): Promise<RelatorioOrganizacao> {
  const simular = params.simular ?? true;
  const raiz = pastaRaiz();

  const origens = await prisma.origemArquivo.findMany({
    where: {
      escritorioId: params.escritorioId,
      ativo: true,
      ...(params.origemId ? { id: params.origemId } : {}),
    },
  });

  const relatorio: RelatorioOrganizacao = {
    simulado: simular,
    origens: origens.map((o) => o.caminho),
    arquivosVistos: 0,
    arquivados: 0,
    jaNoLugar: 0,
    jaExistia: 0,
    conflitos: 0,
    quarentena: 0,
    erros: 0,
    itens: [],
  };

  if (origens.length === 0) return relatorio;

  // Clientes do escritório, indexados pelos dois identificadores naturais.
  const clientes = await prisma.cliente.findMany({
    where: { escritorioId: params.escritorioId },
    select: {
      id: true,
      razaoSocial: true,
      cnpj: true,
      inscricaoEstadual: true,
      pastaLocal: true,
    },
  });
  const porCnpj = new Map(clientes.map((c) => [c.cnpj.replace(/\D/g, ""), c]));
  const porIe = new Map(
    clientes.filter((c) => c.inscricaoEstadual).map((c) => [c.inscricaoEstadual!.replace(/\D/g, ""), c]),
  );

  // Hashes já arquivados — não se arquiva o mesmo conteúdo duas vezes.
  const jaArquivados = new Set(
    (
      await prisma.arquivoOrganizado.findMany({
        where: { escritorioId: params.escritorioId, status: { in: ["ARQUIVADO", "JA_NO_LUGAR"] } },
        select: { hash: true },
      })
    ).map((a) => a.hash),
  );

  const registrar = async (item: ItemOrganizado, dados: {
    hash: string;
    tipo: string;
    clienteId: string | null;
    ano: number | null;
    mes: number | null;
  }) => {
    relatorio.itens.push(item);
    if (simular) return;
    await prisma.arquivoOrganizado.upsert({
      where: { escritorioId_hash: { escritorioId: params.escritorioId, hash: dados.hash } },
      create: {
        escritorioId: params.escritorioId,
        hash: dados.hash,
        origemCaminho: item.origem,
        destinoCaminho: item.destino,
        tipoDocumento: dados.tipo,
        clienteId: dados.clienteId,
        ano: dados.ano,
        mes: dados.mes,
        status: item.status,
        motivo: item.detalhe,
      },
      update: {
        destinoCaminho: item.destino,
        status: item.status,
        motivo: item.detalhe,
      },
    });
  };

  for (const origem of origens) {
    let arquivos: string[];
    try {
      const st = await stat(origem.caminho);
      if (!st.isDirectory()) {
        relatorio.erros++;
        relatorio.itens.push({
          origem: origem.caminho,
          nomeArquivo: origem.nome,
          status: "ERRO",
          tipo: null,
          cliente: null,
          destino: null,
          acao: null,
          detalhe: "o caminho cadastrado não é uma pasta",
        });
        continue;
      }
      arquivos = await listarArquivos(origem.caminho, origem.recursivo);
    } catch (e) {
      relatorio.erros++;
      relatorio.itens.push({
        origem: origem.caminho,
        nomeArquivo: origem.nome,
        status: "ERRO",
        tipo: null,
        cliente: null,
        destino: null,
        acao: null,
        detalhe: `não consegui ler a pasta: ${e instanceof Error ? e.message : String(e)}`,
      });
      continue;
    }

    for (const arquivo of arquivos) {
      relatorio.arquivosVistos++;
      const nomeArquivo = path.basename(arquivo);
      const base: ItemOrganizado = {
        origem: arquivo,
        nomeArquivo,
        status: "ERRO",
        tipo: null,
        cliente: null,
        destino: null,
        acao: null,
        detalhe: "",
      };

      try {
        const hash = await hashDoArquivo(arquivo);
        if (jaArquivados.has(hash)) {
          relatorio.jaExistia++;
          relatorio.itens.push({ ...base, status: "JA_EXISTIA", detalhe: "conteúdo já arquivado antes" });
          continue;
        }

        const cls = await classificarArquivo(arquivo);
        if (!cls.ok) {
          relatorio.quarentena++;
          await registrar(
            { ...base, status: "QUARENTENA", detalhe: cls.motivo },
            { hash, tipo: "DESCONHECIDO", clienteId: null, ano: null, mes: null },
          );
          continue;
        }
        const c = cls.classificacao;
        base.tipo = c.tipo;

        // --- De quem é? ---
        const cliente =
          (origem.clienteId ? clientes.find((x) => x.id === origem.clienteId) : undefined) ??
          (c.cnpj ? porCnpj.get(c.cnpj) : undefined) ??
          (c.inscricaoEstadual ? porIe.get(c.inscricaoEstadual) : undefined);

        if (!cliente) {
          relatorio.quarentena++;
          const quem = c.cnpj ? `CNPJ ${c.cnpj}` : c.inscricaoEstadual ? `IE ${c.inscricaoEstadual}` : "sem CNPJ no arquivo";
          await registrar(
            { ...base, status: "QUARENTENA", detalhe: `cliente não encontrado (${quem})` },
            { hash, tipo: c.tipo, clienteId: null, ano: c.ano, mes: c.mes },
          );
          continue;
        }
        base.cliente = cliente.razaoSocial;

        // --- Para onde vai? ---
        const dest = destinoDoDocumento(c, path.extname(arquivo));
        if (!dest.ok) {
          relatorio.quarentena++;
          await registrar(
            { ...base, status: "QUARENTENA", detalhe: dest.motivo },
            { hash, tipo: c.tipo, clienteId: cliente.id, ano: c.ano, mes: c.mes },
          );
          continue;
        }

        const destinoAbs = path.join(pastaCliente(cliente), dest.destino.relativo);
        base.destino = destinoAbs;

        if (path.resolve(destinoAbs) === path.resolve(arquivo)) {
          relatorio.jaNoLugar++;
          await registrar(
            { ...base, status: "JA_NO_LUGAR", detalhe: "já está no lugar certo, com o nome certo" },
            { hash, tipo: c.tipo, clienteId: cliente.id, ano: c.ano, mes: c.mes },
          );
          continue;
        }

        // Destino ocupado: só é conflito se o conteúdo for diferente.
        if (existsSync(destinoAbs)) {
          const hashDestino = await hashDoArquivo(destinoAbs);
          if (hashDestino === hash) {
            relatorio.jaExistia++;
            await registrar(
              { ...base, status: "JA_EXISTIA", detalhe: "o destino já tem este mesmo conteúdo" },
              { hash, tipo: c.tipo, clienteId: cliente.id, ano: c.ano, mes: c.mes },
            );
            continue;
          }
          relatorio.conflitos++;
          await registrar(
            {
              ...base,
              status: "CONFLITO",
              detalhe: "já existe outro arquivo neste destino — nada foi sobrescrito",
            },
            { hash, tipo: c.tipo, clienteId: cliente.id, ano: c.ano, mes: c.mes },
          );
          continue;
        }

        const acao: "mover" | "copiar" = dentroDaRaiz(arquivo, raiz) ? "mover" : "copiar";
        base.acao = acao;
        const detalhe = `${acao === "mover" ? "movido" : "copiado"} — ${dest.destino.explicacao}`;

        if (!simular) {
          await mkdir(path.dirname(destinoAbs), { recursive: true });
          if (acao === "mover") await rename(arquivo, destinoAbs);
          else await copyFile(arquivo, destinoAbs);
        }

        relatorio.arquivados++;
        jaArquivados.add(hash);
        await registrar(
          { ...base, status: "ARQUIVADO", detalhe: simular ? `seria ${detalhe}` : detalhe },
          { hash, tipo: c.tipo, clienteId: cliente.id, ano: c.ano, mes: c.mes },
        );
      } catch (e) {
        relatorio.erros++;
        relatorio.itens.push({
          ...base,
          status: "ERRO",
          detalhe: e instanceof Error ? e.message : String(e),
        });
      }
    }

    if (!simular) {
      await prisma.origemArquivo.update({
        where: { id: origem.id },
        data: { ultimaVarreduraEm: new Date() },
      });
    }
  }

  return relatorio;
}

/** Caminho da quarentena, exposto pra tela mostrar onde procurar. */
export function caminhoQuarentena(): string {
  return pastaQuarentena(pastaRaiz(), new Date());
}
