/**
 * Importa .dec do PGD DCTF Mensal e faz varredura de pasta (bulk).
 * Grava na tabela DctfWebDeclaracao (mesmo model, campo `origem` = "DCTF_ANTIGA").
 */

import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { prisma } from "@/lib/db";
import { parseDecDctfAntiga } from "./parseDec";

export interface ResultadoImportacao {
  arquivosVistos: number;
  ignoradosNaoDctf: number;
  ignoradosCnpjDiferente: number;
  ignoradosJaImportados: number;
  importadosNovos: number;
  substituidos: number;
  falhas: Array<{ arquivo: string; motivo: string }>;
  detalhes: Array<{ arquivo: string; periodo?: string; pis?: string; cofins?: string; acao: string }>;
}

function soDigitos(s: string | null | undefined): string {
  return (s ?? "").replace(/\D/g, "");
}

function formatarBrl(v: number): string {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export async function varrerPastaDctfAntiga(params: {
  clienteId: string;
  pasta: string;
  usuarioId?: string;
}): Promise<ResultadoImportacao> {
  const { clienteId, pasta } = params;

  const cliente = await prisma.cliente.findUnique({
    where: { id: clienteId },
    select: { cnpj: true },
  });
  if (!cliente) throw new Error("Cliente não encontrado.");
  const cnpjCliente = soDigitos(cliente.cnpj);

  const res: ResultadoImportacao = {
    arquivosVistos: 0,
    ignoradosNaoDctf: 0,
    ignoradosCnpjDiferente: 0,
    ignoradosJaImportados: 0,
    importadosNovos: 0,
    substituidos: 0,
    falhas: [],
    detalhes: [],
  };

  // Cria/reusa uma "sincronização" pra agrupar
  const sinc = await prisma.dctfWebSincronizacao.create({
    data: {
      clienteId,
      periodoInicial: new Date(2000, 0, 1),
      periodoFinal: new Date(),
      sucesso: true,
      mensagem: `Import .dec da pasta ${pasta}`,
      requisitadoPor: params.usuarioId,
    },
  });

  // Coleta recursiva de .dec
  async function coletar(dir: string, prof = 0): Promise<string[]> {
    if (prof > 4) return [];
    const ents = await readdir(dir, { withFileTypes: true }).catch(() => []);
    const arqs: string[] = [];
    for (const e of ents) {
      const p = path.join(dir, e.name);
      if (e.isFile() && /\.dec$/i.test(e.name)) arqs.push(p);
      else if (e.isDirectory()) arqs.push(...(await coletar(p, prof + 1)));
    }
    return arqs;
  }

  const arquivos = await coletar(pasta);
  for (const caminho of arquivos) {
    const nome = path.basename(caminho);
    res.arquivosVistos++;
    try {
      const conteudo = (await readFile(caminho)).toString("latin1");
      const parsed = parseDecDctfAntiga(conteudo, nome);
      if (!parsed.cnpj || !parsed.periodoDeclaracao) {
        res.ignoradosNaoDctf++;
        res.detalhes.push({ arquivo: nome, acao: "ignorado (não é DCTF Mensal .dec)" });
        continue;
      }
      if (parsed.cnpj !== cnpjCliente) {
        res.ignoradosCnpjDiferente++;
        res.detalhes.push({
          arquivo: nome,
          acao: `ignorado (CNPJ ${parsed.cnpj} != cliente ${cnpjCliente})`,
        });
        continue;
      }

      // Dedup: mesma competência + origem = pula
      const jaExiste = await prisma.dctfWebDeclaracao.findFirst({
        where: {
          clienteId,
          periodoApuracao: parsed.periodoDeclaracao,
          origem: "DCTF_ANTIGA",
        },
      });

      const dados = {
        clienteId,
        origem: "DCTF_ANTIGA",
        periodoApuracao: parsed.periodoDeclaracao,
        categoria: parsed.situacao ?? "Original",
        pisConfessado: parsed.pisTotal,
        cofinsConfessado: parsed.cofinsTotal,
        transmitida: true,
        payloadBruto: {
          nomeArquivo: nome,
          razaoSocial: parsed.razaoSocial,
          debitos: parsed.debitos.map((d) => ({
            codigo: d.codigoReceita,
            periodicidade: d.periodicidade,
            periodoApuracao: d.periodoApuracao.toISOString(),
            valor: d.valor,
          })),
        },
        sincronizacaoId: sinc.id,
      };

      if (jaExiste) {
        await prisma.dctfWebDeclaracao.update({ where: { id: jaExiste.id }, data: dados });
        res.substituidos++;
        res.detalhes.push({
          arquivo: nome,
          periodo: parsed.periodoDeclaracao.toLocaleDateString("pt-BR"),
          pis: formatarBrl(parsed.pisTotal),
          cofins: formatarBrl(parsed.cofinsTotal),
          acao: "substituído",
        });
      } else {
        await prisma.dctfWebDeclaracao.create({ data: dados });
        res.importadosNovos++;
        res.detalhes.push({
          arquivo: nome,
          periodo: parsed.periodoDeclaracao.toLocaleDateString("pt-BR"),
          pis: formatarBrl(parsed.pisTotal),
          cofins: formatarBrl(parsed.cofinsTotal),
          acao: "importado",
        });
      }
    } catch (e) {
      res.falhas.push({ arquivo: nome, motivo: (e as Error).message });
    }
  }

  await prisma.dctfWebSincronizacao.update({
    where: { id: sinc.id },
    data: {
      declaracoesRetornadas: res.importadosNovos + res.substituidos,
      mensagem: `${res.arquivosVistos} arquivos, ${res.importadosNovos} novos, ${res.substituidos} substituídos`,
    },
  });

  return res;
}
