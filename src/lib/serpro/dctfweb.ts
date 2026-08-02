/**
 * Cliente DCTFWeb via API SERPRO Integra Contador.
 *
 * Endpoint: POST /Apoiar (do gateway integra-contador/v1)
 * Sistema: DCTFWEB
 * Serviço principal usado aqui: CONSULTARDECLARACAOCOMPLETA (nome exato a
 * confirmar na doc: pode ser CONSULTARDECLARACAOCOMPLETA12 ou similar, o
 * SERPRO versionaliza).
 *
 * Documentação: https://apicenter.estaleiro.serpro.gov.br/documentacao/api-integra-contador/pt/sistemas/dctfweb/
 *
 * IMPORTANTE: esta função ainda não fez a chamada real ao SERPRO. O esqueleto
 * está pronto e usa o certificado do próprio cliente (via runtime helper) para
 * autenticar com procurador. Ativar em produção só depois de testar com CNPJ
 * ativo — o SERPRO cobra por request.
 */

import { comCertificadoDoCliente } from "@/lib/certificados/runtime";
import { prisma } from "@/lib/db";

export interface DctfWebResumo {
  periodo: Date; // primeiro dia do mês
  categoria: string; // "Geral" | "13Salario" etc.
  pisConfessado: number; // BRL
  cofinsConfessado: number; // BRL
  numeroRecibo?: string;
  situacao?: string;
  dataRecepcao?: Date;
  transmitida: boolean;
  payloadBruto: unknown; // JSON do SERPRO
}

/**
 * Consulta a DCTFWeb do cliente no SERPRO pra um range de competências e
 * grava as declarações no banco.
 *
 * Estratégia:
 * 1. Obtém o certificado do cliente (via runtime helper que descifra e
 *    materializa o .pfx em arquivo temp).
 * 2. Autentica no SERPRO com Autentica-Procurador usando o cert do cliente
 *    (ou do escritório+procuração conforme metodoAcessoEcac).
 * 3. Para cada mês do range, chama serviço CONSULTARDECLARACAOCOMPLETA.
 * 4. Extrai PIS/COFINS confessado e grava.
 *
 * ⚠️ ATUALMENTE MOCK: retorna dados de exemplo (0 valores) até o serviço
 * real ser plugado. A tela de confronto exibe "DCTFWeb ainda não sincronizada"
 * quando não há registros — nenhum dado falso.
 */
export async function sincronizarDctfWeb(params: {
  clienteId: string;
  periodoInicial: Date;
  periodoFinal: Date;
  usuarioId?: string;
}): Promise<{ ok: boolean; declaracoes: number; erro?: string; sincronizacaoId?: string }> {
  const { clienteId, periodoInicial, periodoFinal } = params;

  const sinc = await prisma.dctfWebSincronizacao.create({
    data: {
      clienteId,
      periodoInicial,
      periodoFinal,
      sucesso: false,
      requisitadoPor: params.usuarioId,
    },
  });

  try {
    const cliente = await prisma.cliente.findUnique({
      where: { id: clienteId },
      select: { metodoAcessoEcac: true, cnpj: true },
    });
    if (!cliente) throw new Error("Cliente não encontrado.");

    // TODO: chamada real ao SERPRO — esqueleto abaixo, ainda não ativado.
    // Quando ativar:
    //   if (cliente.metodoAcessoEcac === "CERTIFICADO_PROPRIO") {
    //     await comCertificadoDoCliente(clienteId, async ({ caminhoTemp, senha }) => {
    //       // usa caminhoTemp+senha pra autenticar mTLS + assinar termoDeAutorizacao
    //       // chama /Apoiar com {sistema:DCTFWEB, servico:CONSULTARDECLARACAOCOMPLETA*, dados:{...cnpj, ...periodo}}
    //       // parseia resposta, extrai debitos PIS (cod 8109/6912) e COFINS (2172/5856)
    //     });
    //   } else {
    //     // método PROCURACAO_MARCH: usa cert do escritorio + procuração no e-CAC
    //   }

    // Por enquanto: grava sincronização vazia com nota clara.
    await prisma.dctfWebSincronizacao.update({
      where: { id: sinc.id },
      data: {
        declaracoesRetornadas: 0,
        sucesso: true,
        mensagem:
          "MOCK: chamada real ao SERPRO ainda não ativada. Estrutura pronta em src/lib/serpro/dctfweb.ts.",
      },
    });

    return {
      ok: true,
      declaracoes: 0,
      sincronizacaoId: sinc.id,
      erro: "MOCK — plugar chamada real ao SERPRO quando pronto pra testar em CNPJ ativo.",
    };
  } catch (e) {
    const erro = (e as Error).message;
    await prisma.dctfWebSincronizacao.update({
      where: { id: sinc.id },
      data: { sucesso: false, mensagem: erro },
    });
    return { ok: false, declaracoes: 0, erro, sincronizacaoId: sinc.id };
  }
}

// (Import kept to signal intended usage — evita "unused import" no lint)
void comCertificadoDoCliente;
