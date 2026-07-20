import { prisma } from "@/lib/db";
import {
  parseEfdIcms,
  competenciaDeApuracao,
  SpedFormatError,
  type EfdIcmsParseResult,
} from "./parseEfdIcms";

export interface ResultadoImportacaoSped {
  importacaoId: string;
  sucesso: boolean;
  mensagem: string;
  totalLinhas: number;
  registrosE110: number;
  apuracoesGravadas: number;
  apuracoesSubstituidas: number;
  metadata: EfdIcmsParseResult["metadata"];
}

/**
 * Importa o conteúdo textual de um arquivo SPED-Fiscal EFD ICMS/IPI e persiste
 * as apurações extraídas. Grava um `SpedImportacao` por chamada (mesmo em caso
 * de erro, pra manter trilha do que foi tentado).
 *
 * Idempotência: se já existir uma `SpedApuracao` pro mesmo (cliente, competência),
 * é substituída pela nova (upsert por `@@unique([clienteId, periodoApuracao])`).
 * Isso permite reimportar quando o contador gerar SPED retificador.
 */
export async function importarSped(params: {
  clienteId: string;
  nomeArquivo: string;
  conteudo: string;
  importadoPor?: string;
  hashArquivo?: string; // SHA-256 do conteúdo, pré-calculado pra dedup
  origem?: "UPLOAD" | "VARREDURA_PASTA";
  caminhoOrigem?: string; // path absoluto (só quando VARREDURA_PASTA)
}): Promise<ResultadoImportacaoSped> {
  const {
    clienteId,
    nomeArquivo,
    conteudo,
    importadoPor,
    hashArquivo,
    origem = "UPLOAD",
    caminhoOrigem,
  } = params;
  const tamanhoBytes = Buffer.byteLength(conteudo, "utf8");

  let parseResult: EfdIcmsParseResult;
  try {
    parseResult = parseEfdIcms(conteudo);
  } catch (e) {
    const msg = e instanceof SpedFormatError ? e.message : String(e);
    const imp = await prisma.spedImportacao.create({
      data: {
        clienteId,
        nomeArquivo,
        tamanhoBytes,
        hashArquivo,
        origem,
        caminhoOrigem,
        totalLinhas: 0,
        registrosE110: 0,
        apuracoesGravadas: 0,
        apuracoesSubstituidas: 0,
        sucesso: false,
        mensagem: `Erro no parser: ${msg}`,
        importadoPor,
      },
    });
    return {
      importacaoId: imp.id,
      sucesso: false,
      mensagem: imp.mensagem ?? "erro no parser",
      totalLinhas: 0,
      registrosE110: 0,
      apuracoesGravadas: 0,
      apuracoesSubstituidas: 0,
      metadata: {
        cnpj: null,
        cpf: null,
        ie: null,
        uf: null,
        nome: null,
        dataInicial: null,
        dataFinal: null,
      },
    };
  }

  const importacao = await prisma.spedImportacao.create({
    data: {
      clienteId,
      nomeArquivo,
      tamanhoBytes,
      hashArquivo,
      origem,
      caminhoOrigem,
      totalLinhas: parseResult.totalLinhas,
      registrosE110: parseResult.apuracoes.length,
      sucesso: true,
      cnpjArquivo: parseResult.metadata.cnpj,
      ieArquivo: parseResult.metadata.ie,
      uf: parseResult.metadata.uf,
      dataInicioArq: parseResult.metadata.dataInicial,
      dataFimArq: parseResult.metadata.dataFinal,
      importadoPor,
    },
  });

  let gravadas = 0;
  let substituidas = 0;

  for (const apur of parseResult.apuracoes) {
    const competencia = competenciaDeApuracao(apur);
    const existente = await prisma.spedApuracao.findUnique({
      where: { clienteId_periodoApuracao: { clienteId, periodoApuracao: competencia } },
    });
    if (existente) substituidas++;
    else gravadas++;

    const dadosApur = {
      dataInicial: apur.dataInicial,
      dataFinal: apur.dataFinal,
      totalDebitos: apur.totalDebitos,
      totalCreditos: apur.totalCreditos,
      saldoDevedorApurado: apur.saldoDevedorApurado,
      deducoes: apur.deducoes,
      icmsARecolher: apur.icmsARecolher,
      saldoCredorTransp: apur.saldoCredorTransportar,
      ajustesDebitos: apur.ajustesDebitos,
      totalAjustesDebitos: apur.totalAjustesDebitos,
      estornosCreditos: apur.estornosCreditos,
      ajustesCreditos: apur.ajustesCreditos,
      totalAjustesCreditos: apur.totalAjustesCreditos,
      estornosDebitos: apur.estornosDebitos,
      saldoCredorAnterior: apur.saldoCredorAnterior,
      debitoEspecial: apur.debitoEspecial,
      totalCompras: apur.totalCompras,
      totalVendas: apur.totalVendas,
      qtdNotasCompras: apur.qtdNotasCompras,
      qtdNotasVendas: apur.qtdNotasVendas,
      importacaoId: importacao.id,
    };
    await prisma.spedApuracao.upsert({
      where: { clienteId_periodoApuracao: { clienteId, periodoApuracao: competencia } },
      create: { clienteId, periodoApuracao: competencia, ...dadosApur },
      update: dadosApur,
    });
  }

  await prisma.spedImportacao.update({
    where: { id: importacao.id },
    data: {
      apuracoesGravadas: gravadas,
      apuracoesSubstituidas: substituidas,
      mensagem: `${gravadas} nova(s), ${substituidas} substituída(s)`,
    },
  });

  return {
    importacaoId: importacao.id,
    sucesso: true,
    mensagem: `${gravadas} nova(s), ${substituidas} substituída(s)`,
    totalLinhas: parseResult.totalLinhas,
    registrosE110: parseResult.apuracoes.length,
    apuracoesGravadas: gravadas,
    apuracoesSubstituidas: substituidas,
    metadata: parseResult.metadata,
  };
}
