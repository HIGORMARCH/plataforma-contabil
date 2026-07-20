import { readdir, readFile, stat } from "node:fs/promises";
import { join, relative } from "node:path";
import { createHash } from "node:crypto";
import { prisma } from "@/lib/db";
import { pareceGiam } from "./parseGiam";
import { importarGiam, type ResultadoImportacaoGiam } from "./importarGiam";

/** Lista recursivamente arquivos numa árvore (ignora "tmp" e ocultos). */
async function listarArquivosRecursivo(raiz: string): Promise<string[]> {
  const encontrados: string[] = [];
  async function descer(dir: string) {
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return; // pasta sem permissão, ignora
    }
    for (const entry of entries) {
      const nome = entry.name;
      if (nome.startsWith(".")) continue;
      const caminho = join(dir, nome);
      if (entry.isDirectory()) {
        if (nome.toLowerCase() === "tmp") continue;
        await descer(caminho);
      } else if (entry.isFile()) {
        encontrados.push(caminho);
      }
    }
  }
  await descer(raiz);
  return encontrados;
}

export interface RelatorioVarreduraGiam {
  pasta: string;
  totalArquivos: number;
  arquivosProcessados: number;
  arquivosPulados: number;
  ieNaoBate: number; // arquivos GIAM que são de outro cliente (IE diferente)
  novosImportados: number;
  substituidos: number;
  erros: number;
  detalhes: Array<{
    arquivo: string;
    status: "novo" | "substituido" | "duplicado" | "ie-nao-bate" | "ignorado" | "erro";
    mensagem?: string;
    resultado?: ResultadoImportacaoGiam;
  }>;
}

/**
 * Varre a pasta GIAM do cliente atrás de arquivos GIAM 10.0. Filtra por IE
 * dentro do arquivo (não por nome) — permite pasta compartilhada entre clientes.
 *
 * Fallback: se pastaGiam não estiver preenchida, usa pastaFiscal.
 */
export async function varrerPastaGiam(params: {
  clienteId: string;
  importadoPor?: string;
}): Promise<RelatorioVarreduraGiam> {
  const cliente = await prisma.cliente.findUnique({
    where: { id: params.clienteId },
    select: { pastaGiam: true, pastaFiscal: true, inscricaoEstadual: true },
  });

  const pasta = cliente?.pastaGiam || cliente?.pastaFiscal;
  if (!pasta) {
    throw new Error(
      "Cliente sem pasta GIAM nem pasta fiscal cadastrada. Configure em Editar cadastro.",
    );
  }

  try {
    const st = await stat(pasta);
    if (!st.isDirectory()) throw new Error(`"${pasta}" não é uma pasta`);
  } catch (e) {
    throw new Error(`Não consegui ler a pasta "${pasta}": ${e instanceof Error ? e.message : String(e)}`);
  }

  const arquivos = await listarArquivosRecursivo(pasta);
  const ieCadastrada = (cliente?.inscricaoEstadual ?? "").replace(/\D/g, "");

  const relatorio: RelatorioVarreduraGiam = {
    pasta,
    totalArquivos: arquivos.length,
    arquivosProcessados: 0,
    arquivosPulados: 0,
    ieNaoBate: 0,
    novosImportados: 0,
    substituidos: 0,
    erros: 0,
    detalhes: [],
  };

  for (const caminho of arquivos) {
    const rotulo = relative(pasta, caminho) || caminho;
    try {
      // Lê em Latin1 — GIAM oficial é ASCII, mas nomes com acento podem estar em ISO-8859-1.
      const buf = await readFile(caminho);
      const conteudo = buf.toString("latin1");

      if (!pareceGiam(conteudo)) {
        relatorio.arquivosPulados++;
        relatorio.detalhes.push({
          arquivo: rotulo,
          status: "ignorado",
          mensagem: "não é GIAM (Segmento A não reconhecido)",
        });
        continue;
      }

      // Filtro por IE: extrai a IE do arquivo antes de importar. Se não bate com
      // a do cliente, pula sem gerar log de erro (pasta compartilhada é normal).
      const ieDoArquivo = conteudo.substring(1, 10).replace(/\D/g, "");
      if (ieCadastrada && ieDoArquivo && ieDoArquivo !== ieCadastrada) {
        relatorio.ieNaoBate++;
        relatorio.detalhes.push({
          arquivo: rotulo,
          status: "ie-nao-bate",
          mensagem: `IE ${ieDoArquivo} (esperado ${ieCadastrada}) — de outro cliente`,
        });
        continue;
      }

      const hash = createHash("sha256").update(conteudo, "latin1").digest("hex");

      const jaImportado = await prisma.giamImportacao.findFirst({
        where: { clienteId: params.clienteId, hashArquivo: hash, sucesso: true },
        select: { id: true, importadoEm: true },
      });
      if (jaImportado) {
        relatorio.arquivosPulados++;
        relatorio.detalhes.push({
          arquivo: rotulo,
          status: "duplicado",
          mensagem: `já importado em ${jaImportado.importadoEm.toISOString().slice(0, 10)}`,
        });
        continue;
      }

      const resultado = await importarGiam({
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
        if (resultado.apuracaoGravada) relatorio.novosImportados++;
        if (resultado.apuracaoSubstituida) relatorio.substituidos++;
        relatorio.detalhes.push({
          arquivo: rotulo,
          status: resultado.apuracaoSubstituida ? "substituido" : "novo",
          mensagem: `${resultado.periodoArquivo} R${resultado.retificacaoArquivo}`,
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
