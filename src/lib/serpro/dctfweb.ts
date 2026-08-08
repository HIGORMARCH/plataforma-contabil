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
    // Log por competência — array de {ano, mes, status, mensagem}. Preserva
    // no `mensagem` da sincronização pra o contador entender por que uma
    // competência não veio (não transmitida, em andamento, erro do SERPRO, etc.).
    const logMeses: Array<{ mesLabel: string; status: "ok" | "vazio" | "erro"; detalhe: string }> = [];

    // Processa mês a mês. No modo real, cada iteração é uma chamada SERPRO
    // (custa). No modo mock, tudo local.
    async function processarMes(item: { ano: number; mes: number; primeiroDia: Date }, resposta: DctfWebResposta) {
      const mesLabel = `${String(item.mes).padStart(2, "0")}/${item.ano}`;
      if (resposta.status !== 200) {
        logMeses.push({ mesLabel, status: "vazio", detalhe: `SERPRO status ${resposta.status}: ${resposta.mensagem ?? "sem detalhe"}` });
        return;
      }
      if (resposta.declaracoes.length === 0) {
        logMeses.push({ mesLabel, status: "vazio", detalhe: "SERPRO ok mas sem declarações no período" });
        return;
      }
      logMeses.push({ mesLabel, status: "ok", detalhe: `${resposta.declaracoes.length} declaração(ões) recebidas` });
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
            payloadBruto: JSON.parse(JSON.stringify({
              debitos: dec.debitos.map((d) => ({
                codigo: d.codigoReceita,
                denominacao: d.denominacaoReceita,
                periodicidade: d.periodicidade,
                valor: d.valor,
                situacao: d.situacao,
                creditosVinculados: d.creditosVinculados,
                saldoAPagar: d.saldoAPagar,
              })),
              respostaBruta: resposta.bruto,
            })),
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
            payloadBruto: JSON.parse(JSON.stringify({
              debitos: dec.debitos.map((d) => ({
                codigo: d.codigoReceita,
                denominacao: d.denominacaoReceita,
                periodicidade: d.periodicidade,
                valor: d.valor,
                situacao: d.situacao,
                creditosVinculados: d.creditosVinculados,
                saldoAPagar: d.saldoAPagar,
              })),
              respostaBruta: resposta.bruto,
            })),
            sincronizacaoId: sinc.id,
          },
        });
        totalDeclaracoes++;
      }
    }

    const consultarMes = async (item: { ano: number; mes: number; primeiroDia: Date }, cert?: { caminhoTemp: string; senha: string }) => {
      const mesLabel = `${String(item.mes).padStart(2, "0")}/${item.ano}`;
      try {
        const resp = await consultarDeclaracaoCompleta({ cert, cnpj: cnpjDigits, ano: item.ano, mes: item.mes });
        await processarMes(item, resp);
      } catch (e) {
        // Uma competência com erro NÃO aborta as outras. Loga e segue.
        logMeses.push({ mesLabel, status: "erro", detalhe: e instanceof Error ? e.message.slice(0, 400) : String(e).slice(0, 400) });
      }
    };

    if (modo === "mock") {
      for (const item of meses) await consultarMes(item);
    } else if (cliente.metodoAcessoEcac === "PROCURACAO_MARCH") {
      // Procuração eletrônica: SerproClient usa cert do escritório (via env
      // SERPRO_CERT_PATH) e o procurador_token cacheado — não precisa cert do cliente.
      for (const item of meses) await consultarMes(item);
    } else {
      // Certificado próprio do cliente: assina o termo com o .pfx do cliente
      // e vira autor do pedido. Abre cert 1x, faz N chamadas dentro do handler.
      await comCertificadoDoCliente(clienteId, async (cert) => {
        for (const item of meses) await consultarMes(item, cert);
      });
    }

    // Resumo por competência — útil pra explicar por que alguns meses vieram
    // vazios (empresa não transmitiu, categoria diferente, em andamento, etc.).
    const resumoOk = logMeses.filter((l) => l.status === "ok").length;
    const resumoVazio = logMeses.filter((l) => l.status === "vazio").length;
    const resumoErro = logMeses.filter((l) => l.status === "erro").length;
    const detalheMeses = logMeses.map((l) => `${l.mesLabel} [${l.status}] ${l.detalhe}`).join(" | ");

    await prisma.dctfWebSincronizacao.update({
      where: { id: sinc.id },
      data: {
        declaracoesRetornadas: totalDeclaracoes,
        // sucesso = true se pelo menos uma competência retornou dados, ou
        // se todas retornaram vazio (o cliente pode não ter DCTFWeb no
        // período — legítimo). Falha só se TODAS deram erro técnico.
        sucesso: resumoErro === 0 || resumoOk > 0,
        mensagem:
          modo === "mock"
            ? `MOCK: ${totalDeclaracoes} declaração(ões) sintética(s) gravada(s). Alterne SERPRO_DCTFWEB_MODE=real quando cert/procuração estiverem prontos.`
            : `${totalDeclaracoes} declaração(ões) sincronizada(s) via Integra Contador. Resumo: ${resumoOk} ok, ${resumoVazio} vazio(s), ${resumoErro} erro(s). Detalhe por competência: ${detalheMeses}`.slice(0, 2000),
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
