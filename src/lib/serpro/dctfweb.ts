/**
 * Sincronização DCTFWeb — orquestra a chamada ao Integra Contador e grava as
 * declarações no banco (DctfWebDeclaracao com origem="DCTFWEB").
 *
 * Modo controlado por env `SERPRO_DCTFWEB_MODE` (mock|real) — ver dctfwebClient.ts.
 * A tela PIS/COFINS consome DctfWebDeclaracao independente da origem, então o
 * mock alimenta a tela normalmente pra dev/validação.
 */

import { comCertificadoDoCliente } from "@/lib/certificados/runtime";
import { prisma } from "@/lib/db";
import { consultarDeclaracaoCompleta, modoAtual, type DctfWebResposta } from "./dctfwebClient";

function soDigitos(s: string | null | undefined): string {
  return (s ?? "").replace(/\D/g, "");
}

/**
 * Sincroniza a DCTFWeb do cliente pro range de competências informado.
 * - Cria 1 DctfWebSincronizacao (log da chamada).
 * - Pra cada mês do range, chama SERPRO (mock ou real).
 * - Grava cada declaração retornada como DctfWebDeclaracao (upsert por
 *   clienteId+periodoApuracao+categoria).
 * - Consolida PIS + COFINS por competência somando débitos dos códigos
 *   8109/6912 (PIS) e 2172/5856 (COFINS). Outros códigos (IRPJ/CSLL/IRRF)
 *   ficam preservados no payloadBruto pro cross-reference com IRPJ/CSLL.
 */
export async function sincronizarDctfWeb(params: {
  clienteId: string;
  periodoInicial: Date; // primeiro dia do primeiro mês
  periodoFinal: Date; // último dia do último mês (inclusive)
  usuarioId?: string;
}): Promise<{
  ok: boolean;
  declaracoes: number;
  erro?: string;
  sincronizacaoId?: string;
  modo: "mock" | "real";
}> {
  const { clienteId, periodoInicial, periodoFinal } = params;
  const modo = modoAtual();

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
    const cnpjDigits = soDigitos(cliente.cnpj);

    // Enumera cada mês do range
    const meses: Array<{ ano: number; mes: number; primeiroDia: Date }> = [];
    const cursor = new Date(periodoInicial.getFullYear(), periodoInicial.getMonth(), 1);
    const limite = new Date(periodoFinal.getFullYear(), periodoFinal.getMonth(), 1);
    while (cursor <= limite) {
      meses.push({
        ano: cursor.getFullYear(),
        mes: cursor.getMonth() + 1, // 1..12
        primeiroDia: new Date(cursor),
      });
      cursor.setMonth(cursor.getMonth() + 1);
    }

    let totalDeclaracoes = 0;

    // Processa mês a mês. No modo real, cada iteração é uma chamada SERPRO
    // (custa). No modo mock, tudo local.
    async function processarMes(item: { ano: number; mes: number; primeiroDia: Date }, resposta: DctfWebResposta) {
      if (resposta.status !== 200 || resposta.declaracoes.length === 0) return;
      for (const dec of resposta.declaracoes) {
        // Consolida PIS/COFINS pra facilitar a query da tela.
        let pisConfessado = 0;
        let cofinsConfessado = 0;
        for (const d of dec.debitos) {
          if (d.codigoReceita === "8109" || d.codigoReceita === "6912") pisConfessado += d.valor;
          if (d.codigoReceita === "2172" || d.codigoReceita === "5856") cofinsConfessado += d.valor;
        }

        await prisma.dctfWebDeclaracao.upsert({
          where: {
            clienteId_periodoApuracao_categoria: {
              clienteId,
              periodoApuracao: item.primeiroDia,
              categoria: dec.categoria,
            },
          },
          create: {
            clienteId,
            origem: "DCTFWEB",
            periodoApuracao: item.primeiroDia,
            categoria: dec.categoria,
            pisConfessado,
            cofinsConfessado,
            numeroRecibo: dec.numeroRecibo,
            situacao: dec.situacao,
            dataRecepcao: dec.dataRecepcao ? new Date(dec.dataRecepcao) : undefined,
            transmitida: dec.transmitida,
            payloadBruto: {
              debitos: dec.debitos.map((d) => ({
                codigo: d.codigoReceita,
                denominacao: d.denominacaoReceita,
                periodicidade: d.periodicidade,
                valor: d.valor,
                situacao: d.situacao,
              })),
              respostaBruta: resposta.bruto,
            },
            sincronizacaoId: sinc.id,
          },
          update: {
            origem: "DCTFWEB",
            pisConfessado,
            cofinsConfessado,
            numeroRecibo: dec.numeroRecibo,
            situacao: dec.situacao,
            dataRecepcao: dec.dataRecepcao ? new Date(dec.dataRecepcao) : undefined,
            transmitida: dec.transmitida,
            payloadBruto: {
              debitos: dec.debitos.map((d) => ({
                codigo: d.codigoReceita,
                denominacao: d.denominacaoReceita,
                periodicidade: d.periodicidade,
                valor: d.valor,
                situacao: d.situacao,
              })),
              respostaBruta: resposta.bruto,
            },
            sincronizacaoId: sinc.id,
          },
        });
        totalDeclaracoes++;
      }
    }

    if (modo === "mock") {
      // Sem cert. Chama direto pra cada mês.
      for (const item of meses) {
        const resp = await consultarDeclaracaoCompleta({ cnpj: cnpjDigits, ano: item.ano, mes: item.mes });
        await processarMes(item, resp);
      }
    } else {
      // Modo real — abre cert 1x, faz N chamadas dentro do handler.
      // TODO: no modo real, se cliente.metodoAcessoEcac === "PROCURACAO_MARCH",
      // usar cert do escritório em vez do do cliente.
      await comCertificadoDoCliente(clienteId, async (cert) => {
        for (const item of meses) {
          const resp = await consultarDeclaracaoCompleta({
            cert,
            cnpj: cnpjDigits,
            ano: item.ano,
            mes: item.mes,
          });
          await processarMes(item, resp);
        }
      });
    }

    await prisma.dctfWebSincronizacao.update({
      where: { id: sinc.id },
      data: {
        declaracoesRetornadas: totalDeclaracoes,
        sucesso: true,
        mensagem:
          modo === "mock"
            ? `MOCK: ${totalDeclaracoes} declaração(ões) sintética(s) gravada(s). Alterne SERPRO_DCTFWEB_MODE=real quando cert/procuração estiverem prontos.`
            : `${totalDeclaracoes} declaração(ões) sincronizada(s) via Integra Contador.`,
      },
    });

    return { ok: true, declaracoes: totalDeclaracoes, sincronizacaoId: sinc.id, modo };
  } catch (e) {
    const erro = (e as Error).message;
    await prisma.dctfWebSincronizacao.update({
      where: { id: sinc.id },
      data: { sucesso: false, mensagem: erro },
    });
    return { ok: false, declaracoes: 0, erro, sincronizacaoId: sinc.id, modo };
  }
}
