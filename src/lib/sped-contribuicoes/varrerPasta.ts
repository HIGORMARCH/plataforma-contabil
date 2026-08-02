/**
 * Varredura de pasta procurando arquivos SPED-Contribuições e importando-os
 * automaticamente.
 *
 * Estratégia:
 * - Aceita .txt, .rec, e .zip (o ReceitanetBX às vezes empacota o resultado
 *   como .zip). Se for .zip, descompacta em pasta temp e processa os .txt lá.
 * - Valida cada arquivo lendo o registro 0000 e conferindo se o CNPJ bate com
 *   o cliente. Se não bater, pula (evita importar arquivo de outro contribuinte
 *   se o operador apontou pasta mestra por engano).
 * - Deduplica por SHA-256 do conteúdo (mesmo arquivo já importado = pula).
 */

import { readdir, readFile, stat } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import { prisma } from "@/lib/db";
import { importarSpedContribuicoes } from "./importar";
import { parseEfdContribuicoes } from "./parseEfdContribuicoes";

export interface ResultadoVarredura {
  arquivosVistos: number;
  ignoradosNaoSped: number;
  ignoradosCnpjDiferente: number;
  ignoradosJaImportados: number;
  importadosNovos: number;
  substituidos: number;
  falhas: Array<{ arquivo: string; motivo: string }>;
  detalhes: Array<{ arquivo: string; periodo?: string; acao: string }>;
}

function soDigitos(s: string | null | undefined): string {
  return (s ?? "").replace(/\D/g, "");
}

function decodificarConteudo(bytes: Buffer): string {
  // BOM UTF-8?
  if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    return bytes.toString("utf8").slice(1);
  }
  // SPED costuma ser latin1/CP1252 no Brasil
  return bytes.toString("latin1");
}

/**
 * Detecta se um conteúdo é SPED-Contribuições (bloco M ou registro 0000
 * característico). Retorna o CNPJ do arquivo se for válido; null caso contrário.
 */
function detectarSpedContribuicoes(conteudo: string): { valido: boolean; cnpj?: string } {
  const parsed = parseEfdContribuicoes(conteudo);
  if (!parsed.cabecalho.cnpj || !parsed.cabecalho.dataInicial) {
    return { valido: false };
  }
  // SPED-Fiscal e SPED-Contribuições compartilham o registro 0000, então
  // diferenciamos pela presença do bloco M (M200 PIS ou M600 COFINS).
  if (!parsed.pis && !parsed.cofins) {
    return { valido: false };
  }
  return { valido: true, cnpj: soDigitos(parsed.cabecalho.cnpj) };
}

export async function varrerPastaSpedContribuicoes(params: {
  clienteId: string;
  pasta: string;
  usuarioId?: string;
}): Promise<ResultadoVarredura> {
  const { clienteId, pasta } = params;

  const cliente = await prisma.cliente.findUnique({
    where: { id: clienteId },
    select: { cnpj: true },
  });
  if (!cliente) throw new Error("Cliente não encontrado.");
  const cnpjCliente = soDigitos(cliente.cnpj);

  const st = await stat(pasta).catch(() => null);
  if (!st || !st.isDirectory()) {
    throw new Error(`Pasta inválida ou inacessível: ${pasta}`);
  }

  const res: ResultadoVarredura = {
    arquivosVistos: 0,
    ignoradosNaoSped: 0,
    ignoradosCnpjDiferente: 0,
    ignoradosJaImportados: 0,
    importadosNovos: 0,
    substituidos: 0,
    falhas: [],
    detalhes: [],
  };

  const entradas = await readdir(pasta, { withFileTypes: true });
  const arquivos = entradas
    .filter((e) => e.isFile())
    .map((e) => path.join(pasta, e.name))
    .filter((p) => /\.(txt|rec|sped)$/i.test(p));
  // TODO fase 2: suportar .zip descompactando. Requer 'unzipper' ou 'yauzl'.

  for (const caminho of arquivos) {
    const nomeArquivo = path.basename(caminho);
    res.arquivosVistos++;
    try {
      const bytes = await readFile(caminho);
      const conteudo = decodificarConteudo(bytes);

      const check = detectarSpedContribuicoes(conteudo);
      if (!check.valido) {
        res.ignoradosNaoSped++;
        res.detalhes.push({ arquivo: nomeArquivo, acao: "ignorado (não é SPED-Contribuições)" });
        continue;
      }
      if (check.cnpj !== cnpjCliente) {
        res.ignoradosCnpjDiferente++;
        res.detalhes.push({
          arquivo: nomeArquivo,
          acao: `ignorado (CNPJ ${check.cnpj} != cliente ${cnpjCliente})`,
        });
        continue;
      }

      // Deduplicação por hash — se já foi importado, pula.
      const hash = createHash("sha256").update(conteudo).digest("hex");
      const jaImportado = await prisma.spedContribImportacao.findFirst({
        where: { clienteId, hashArquivo: hash },
        select: { id: true },
      });
      if (jaImportado) {
        res.ignoradosJaImportados++;
        res.detalhes.push({ arquivo: nomeArquivo, acao: "já importado (hash igual)" });
        continue;
      }

      const r = await importarSpedContribuicoes({
        clienteId,
        nomeArquivo,
        conteudo,
        origem: "VARREDURA_PASTA",
        caminhoOrigem: caminho,
        importadoPor: params.usuarioId,
      });

      if (!r.ok) {
        res.falhas.push({ arquivo: nomeArquivo, motivo: r.mensagem });
        continue;
      }

      const periodo = r.periodoApuracao?.toLocaleDateString("pt-BR");
      if (r.substituiu) {
        res.substituidos++;
        res.detalhes.push({ arquivo: nomeArquivo, periodo, acao: "substituído" });
      } else {
        res.importadosNovos++;
        res.detalhes.push({ arquivo: nomeArquivo, periodo, acao: "importado" });
      }
    } catch (e) {
      res.falhas.push({ arquivo: nomeArquivo, motivo: (e as Error).message });
    }
  }

  return res;
}
