/**
 * Importa 1 arquivo SPED-ECF: parseia, valida CNPJ, dedup por hash, grava
 * EcfImportacao + N EcfApuracao (1 por trimestre).
 */
import { createHash } from "node:crypto";
import { prisma } from "@/lib/db";
import { parseSpedEcf, type EcfParsed } from "./parseSpedEcf";

export interface ResultadoImport {
  ok: boolean;
  importacaoId?: string;
  ano?: number;
  apuracoesGravadas?: number;
  substituiu?: boolean;
  mensagem: string;
}

function soDigitos(s: string | null | undefined): string {
  return (s ?? "").replace(/\D/g, "");
}

export async function importarSpedEcf(params: {
  clienteId: string;
  nomeArquivo: string;
  conteudo: string;
  origem?: "UPLOAD" | "VARREDURA_PASTA";
  caminhoOrigem?: string;
  importadoPor?: string;
}): Promise<ResultadoImport> {
  const { clienteId, nomeArquivo, conteudo } = params;

  const cliente = await prisma.cliente.findUnique({
    where: { id: clienteId },
    select: { cnpj: true },
  });
  if (!cliente) return { ok: false, mensagem: "Cliente não encontrado" };

  const parsed = parseSpedEcf(conteudo);
  if (!parsed.cnpj) return { ok: false, mensagem: "Arquivo sem CNPJ (registro 0000 inválido)" };
  if (soDigitos(parsed.cnpj) !== soDigitos(cliente.cnpj)) {
    return {
      ok: false,
      mensagem: `CNPJ do arquivo (${parsed.cnpj}) diferente do cliente (${cliente.cnpj})`,
    };
  }
  if (!parsed.ano || !parsed.dataInicial || !parsed.dataFinal) {
    return { ok: false, mensagem: "Período do arquivo (0000) inválido" };
  }
  if (parsed.apuracoes.length === 0) {
    return { ok: false, mensagem: "Arquivo sem apurações trimestrais (bloco P/M/N)" };
  }

  const hash = createHash("sha256").update(conteudo).digest("hex");
  const jaImportado = await prisma.ecfImportacao.findFirst({
    where: { clienteId, hashArquivo: hash },
    select: { id: true },
  });
  if (jaImportado) {
    return {
      ok: true,
      importacaoId: jaImportado.id,
      ano: parsed.ano,
      apuracoesGravadas: 0,
      substituiu: false,
      mensagem: "Arquivo já importado antes (hash igual) — nada a fazer",
    };
  }

  // Se já existe importação anterior pro mesmo ano/cliente, substituímos.
  const anterior = await prisma.ecfImportacao.findFirst({
    where: { clienteId, ano: parsed.ano },
    select: { id: true },
  });
  const substituiu = !!anterior;

  const [imp] = await prisma.$transaction(async (tx) => {
    if (anterior) {
      // Cascade delete das apurações via FK. Depois apaga a importação antiga.
      await tx.ecfImportacao.delete({ where: { id: anterior.id } });
    }

    const imp = await tx.ecfImportacao.create({
      data: {
        clienteId,
        nomeArquivo,
        tamanhoBytes: Buffer.byteLength(conteudo, "latin1"),
        hashArquivo: hash,
        origem: params.origem ?? "UPLOAD",
        caminhoOrigem: params.caminhoOrigem,
        totalLinhas: conteudo.split(/\r?\n/).length,
        cnpjArquivo: soDigitos(parsed.cnpj),
        dataInicioArq: parsed.dataInicial,
        dataFimArq: parsed.dataFinal,
        ano: parsed.ano,
        regimeAno: parsed.regimeAno,
        importadoPor: params.importadoPor,
        apuracoesGravadas: parsed.apuracoes.length,
        sucesso: true,
      },
    });

    for (const a of parsed.apuracoes) {
      await tx.ecfApuracao.create({
        data: {
          clienteId,
          ano: parsed.ano!,
          trimestre: a.trimestre,
          dataInicial: a.dataInicial,
          dataFinal: a.dataFinal,
          regime: a.regime,
          irpjApurado: a.irpjApurado,
          csllApurada: a.csllApurado,
          importacaoId: imp.id,
        },
      });
    }

    return [imp];
  });

  return {
    ok: true,
    importacaoId: imp.id,
    ano: parsed.ano,
    apuracoesGravadas: parsed.apuracoes.length,
    substituiu,
    mensagem: substituiu
      ? `Substituiu importação anterior de ${parsed.ano}. ${parsed.apuracoes.length} trimestres gravados.`
      : `${parsed.apuracoes.length} trimestres gravados.`,
  };
}

// Re-exporta o tipo pra quem quiser usar
export type { EcfParsed };
