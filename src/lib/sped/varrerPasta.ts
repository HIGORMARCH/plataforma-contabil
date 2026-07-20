import { readdir, readFile, stat } from "node:fs/promises";
import { join, relative } from "node:path";
import { createHash } from "node:crypto";
import { prisma } from "@/lib/db";
import { importarSped, type ResultadoImportacaoSped } from "./importarSped";

/**
 * Confirma que um arquivo é um SPED-FISCAL (EFD ICMS/IPI) — não um SPED de
 * outro tipo (Contribuições, ECD, ECF). Critério: começa com |0000| (todo SPED)
 * E contém pelo menos um registro |E110| (só EFD ICMS/IPI tem).
 */
function pareceSpedFiscal(conteudo: string): boolean {
  if (!conteudo.startsWith("|0000|")) return false;
  // Busca simples por |E110| — se existir em qualquer linha, é SPED-Fiscal.
  return /\n\|E110\|/.test(conteudo);
}

/**
 * Lista recursivamente todos os arquivos .txt em uma árvore de diretórios.
 * Retorna paths absolutos. Ignora pastas ocultas (começando com .) e a pasta
 * "tmp" (comum em ambientes Windows como cache temporário).
 */
async function listarTxtsRecursivo(raiz: string): Promise<string[]> {
  const encontrados: string[] = [];
  async function descer(dir: string) {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const nome = entry.name;
      if (nome.startsWith(".")) continue;
      const caminho = join(dir, nome);
      if (entry.isDirectory()) {
        if (nome.toLowerCase() === "tmp") continue;
        await descer(caminho);
      } else if (entry.isFile() && nome.toLowerCase().endsWith(".txt")) {
        encontrados.push(caminho);
      }
    }
  }
  await descer(raiz);
  return encontrados;
}

export interface RelatorioVarredura {
  pasta: string;
  totalArquivos: number;
  arquivosProcessados: number;
  arquivosPulados: number; // já importados (mesmo hash) ou sem cara de SPED
  novosImportados: number;
  competenciasSubstituidas: number;
  erros: number;
  detalhes: Array<{
    arquivo: string;
    status: "novo" | "duplicado" | "ignorado" | "erro";
    mensagem?: string;
    resultado?: ResultadoImportacaoSped;
  }>;
}

/**
 * Varre a `pastaFiscal` configurada no cadastro do cliente atrás de arquivos
 * SPED-Fiscal (.txt que começam com |0000|). Pra cada arquivo:
 *  - Calcula SHA-256 do conteúdo.
 *  - Se já existir uma SpedImportacao pra esse cliente com o mesmo hash, pula.
 *  - Senão, importa via `importarSped` (que persiste os valores extraídos e
 *    descarta o conteúdo — nenhum arquivo é copiado ou armazenado).
 *
 * Só lê `.txt` no nível raiz da pasta (não desce em subpastas — se precisar
 * depois, mudar `readdir` pra recursivo).
 */
export async function varrerPastaSped(params: {
  clienteId: string;
  importadoPor?: string;
}): Promise<RelatorioVarredura> {
  const cliente = await prisma.cliente.findUnique({
    where: { id: params.clienteId },
    select: { pastaFiscal: true },
  });

  if (!cliente?.pastaFiscal) {
    throw new Error(
      "Cliente sem pasta fiscal cadastrada. Configure 'Pasta de arquivos fiscais' no cadastro.",
    );
  }

  const pasta = cliente.pastaFiscal;

  // Confere que a pasta existe e é acessível.
  try {
    const st = await stat(pasta);
    if (!st.isDirectory()) {
      throw new Error(`"${pasta}" não é uma pasta`);
    }
  } catch (e) {
    const motivo = e instanceof Error ? e.message : String(e);
    throw new Error(`Não consegui ler a pasta "${pasta}": ${motivo}`);
  }

  const caminhosCompletos = await listarTxtsRecursivo(pasta);

  const relatorio: RelatorioVarredura = {
    pasta,
    totalArquivos: caminhosCompletos.length,
    arquivosProcessados: 0,
    arquivosPulados: 0,
    novosImportados: 0,
    competenciasSubstituidas: 0,
    erros: 0,
    detalhes: [],
  };

  for (const caminho of caminhosCompletos) {
    const rotulo = relative(pasta, caminho) || caminho;
    try {
      // Lê como UTF-8. SPED oficial é ASCII (compatível). Se algum arquivo for
      // Windows-1252, os acentos podem ficar estranhos mas os números batem.
      const conteudo = await readFile(caminho, "utf8");

      if (!pareceSpedFiscal(conteudo)) {
        relatorio.arquivosPulados++;
        relatorio.detalhes.push({
          arquivo: rotulo,
          status: "ignorado",
          mensagem: "não é SPED-Fiscal (sem registro E110 — provavelmente SPED-Contribuições, ECF ou ECD)",
        });
        continue;
      }

      const hash = createHash("sha256").update(conteudo, "utf8").digest("hex");

      // Dedup: já importado antes?
      const jaImportado = await prisma.spedImportacao.findFirst({
        where: { clienteId: params.clienteId, hashArquivo: hash, sucesso: true },
        select: { id: true, importadoEm: true },
      });
      if (jaImportado) {
        relatorio.arquivosPulados++;
        relatorio.detalhes.push({
          arquivo: rotulo,
          status: "duplicado",
          mensagem: `mesmo conteúdo já importado em ${jaImportado.importadoEm.toISOString().slice(0, 10)}`,
        });
        continue;
      }

      const resultado = await importarSped({
        clienteId: params.clienteId,
        nomeArquivo: rotulo,
        conteudo,
        importadoPor: params.importadoPor,
        hashArquivo: hash,
        origem: "VARREDURA_PASTA",
        caminhoOrigem: caminho,
      });

      relatorio.arquivosProcessados++;
      if (resultado.sucesso) {
        relatorio.novosImportados += resultado.apuracoesGravadas;
        relatorio.competenciasSubstituidas += resultado.apuracoesSubstituidas;
        relatorio.detalhes.push({
          arquivo: rotulo,
          status: "novo",
          mensagem: resultado.mensagem,
          resultado,
        });
      } else {
        relatorio.erros++;
        relatorio.detalhes.push({
          arquivo: rotulo,
          status: "erro",
          mensagem: resultado.mensagem,
          resultado,
        });
      }
    } catch (e) {
      relatorio.erros++;
      relatorio.detalhes.push({
        arquivo: rotulo,
        status: "erro",
        mensagem: e instanceof Error ? e.message : String(e),
      });
    }
  }

  return relatorio;
}
