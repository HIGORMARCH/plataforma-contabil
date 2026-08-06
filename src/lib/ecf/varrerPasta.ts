/**
 * Varre uma pasta procurando arquivos SPED-ECF e importa cada um.
 * Padrão de nome: SPEDECF-CNPJ-DTINI-DTFIN-CARIMBO.txt
 * Aceita .txt e valida por CNPJ + presença do 0000 LECF.
 */
import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { prisma } from "@/lib/db";
import { importarSpedEcf } from "./importar";

export interface ResultadoVarreduraEcf {
  arquivosVistos: number;
  ignoradosNaoEcf: number;
  ignoradosCnpjDiferente: number;
  ignoradosJaImportados: number;
  importadosNovos: number;
  substituidos: number;
  falhas: Array<{ arquivo: string; motivo: string }>;
  detalhes: Array<{ arquivo: string; ano?: number; acao: string }>;
}

function soDigitos(s: string | null | undefined): string {
  return (s ?? "").replace(/\D/g, "");
}

function decodificarLatin1(bytes: Buffer): string {
  // SPED brasileiro é latin1/CP1252
  return bytes.toString("latin1");
}

// Detecta pelo início do arquivo — evita ler MB de dados de um SPED que não é ECF
function pareceSpedEcf(conteudo: string): boolean {
  const primeirasLinhas = conteudo.slice(0, 2000);
  return /^\|0000\|LECF\|/m.test(primeirasLinhas);
}

export async function varrerPastaEcf(params: {
  clienteId: string;
  pasta: string;
  usuarioId?: string;
}): Promise<ResultadoVarreduraEcf> {
  const { clienteId, pasta } = params;

  const cliente = await prisma.cliente.findUnique({
    where: { id: clienteId },
    select: { cnpj: true },
  });
  if (!cliente) throw new Error("Cliente não encontrado.");
  const cnpjCliente = soDigitos(cliente.cnpj);

  const st = await stat(pasta).catch(() => null);
  if (!st || !st.isDirectory()) throw new Error(`Pasta inválida: ${pasta}`);

  const res: ResultadoVarreduraEcf = {
    arquivosVistos: 0,
    ignoradosNaoEcf: 0,
    ignoradosCnpjDiferente: 0,
    ignoradosJaImportados: 0,
    importadosNovos: 0,
    substituidos: 0,
    falhas: [],
    detalhes: [],
  };

  async function coletar(dir: string, prof = 0): Promise<string[]> {
    if (prof > 4) return [];
    const entradas = await readdir(dir, { withFileTypes: true }).catch(() => []);
    const arqs: string[] = [];
    for (const e of entradas) {
      const p = path.join(dir, e.name);
      if (e.isFile() && /\.(txt|ecf|sped)$/i.test(e.name)) arqs.push(p);
      else if (e.isDirectory()) arqs.push(...(await coletar(p, prof + 1)));
    }
    return arqs;
  }
  const arquivos = await coletar(pasta);

  for (const caminho of arquivos) {
    const nomeArquivo = path.basename(caminho);
    res.arquivosVistos++;
    try {
      const bytes = await readFile(caminho);
      const conteudo = decodificarLatin1(bytes);

      if (!pareceSpedEcf(conteudo)) {
        res.ignoradosNaoEcf++;
        res.detalhes.push({ arquivo: nomeArquivo, acao: "ignorado (não é SPED-ECF)" });
        continue;
      }

      // Confere CNPJ direto do 0000 sem parse completo pra performance
      const m0000 = conteudo.match(/^\|0000\|LECF\|[^|]*\|(\d{14})\|/m);
      if (!m0000 || m0000[1] !== cnpjCliente) {
        res.ignoradosCnpjDiferente++;
        res.detalhes.push({
          arquivo: nomeArquivo,
          acao: `ignorado (CNPJ ${m0000?.[1] ?? "??"} != cliente ${cnpjCliente})`,
        });
        continue;
      }

      const r = await importarSpedEcf({
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

      if (r.mensagem.includes("já importado")) {
        res.ignoradosJaImportados++;
        res.detalhes.push({ arquivo: nomeArquivo, ano: r.ano, acao: "já importado (hash igual)" });
      } else if (r.substituiu) {
        res.substituidos++;
        res.detalhes.push({ arquivo: nomeArquivo, ano: r.ano, acao: "substituído" });
      } else {
        res.importadosNovos++;
        res.detalhes.push({ arquivo: nomeArquivo, ano: r.ano, acao: "importado" });
      }
    } catch (e) {
      res.falhas.push({ arquivo: nomeArquivo, motivo: (e as Error).message });
    }
  }

  return res;
}
