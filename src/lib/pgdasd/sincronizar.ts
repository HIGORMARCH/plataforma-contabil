/**
 * Consulta do PGDAS-D no SERPRO Integra Contador — orquestrador.
 *
 * FLUXO
 *   1. Guarda de regime: PGDAS-D só existe pra optante do Simples.
 *   2. Guarda de período: recorta o intervalo pelo período de atendimento —
 *      cada competência aqui é UMA CHAMADA PAGA ao SERPRO.
 *   3. Pra cada competência: CONSULTIMADECREC14 → PDF em base64 → parser em
 *      memória → upsert em PgdasdDeclaracao.
 *   4. Uma competência com erro NÃO aborta as outras (mesmo padrão da DCTFWeb).
 *
 * NÃO ARMAZENA ARQUIVO: o PDF da declaração e o do recibo existem só como
 * Buffer durante a chamada. Nada vai pra disco nem pro banco — só os valores
 * extraídos e os alertas de leitura.
 *
 * SEM MODO MOCK, de propósito: a DCTFWeb tem `SERPRO_DCTFWEB_MODE=mock` e isso
 * já encheu o banco de registros MOCK-* que depois precisaram ser caçados. Aqui
 * ou é consulta real (botão, sob solicitação) ou não é nada.
 */

import { prisma } from "@/lib/db";
import { Prisma } from "@prisma/client";
import { carregarCertificadoDoCliente } from "@/lib/certificados/runtime";
import type { CertificadoCarregado } from "@/lib/serpro/pkcs12";
import { SerproClient } from "@/lib/serpro/client";
import { recortarPeriodo, descreverRecorte, competenciaUtc } from "@/lib/atendimento";
import { ehSimples } from "@/lib/regime";
import { lerDeclaracaoPgdasdPdf, type DeclaracaoPgdasd } from "./parseDeclaracaoPdf";

export interface ResultadoConsultaPgdasd {
  ok: boolean;
  sincronizacaoId: string;
  declaracoes: number;
  semDeclaracao: number;
  comErro: number;
  mensagem: string;
  /** Detalhe por competência — o que a UI mostra depois de rodar. */
  competencias: Array<{
    label: string;
    status: "ok" | "vazio" | "erro";
    detalhe: string;
  }>;
}

/** Client compartilhado no processo — cacheia access_token e procurador_token. */
let clienteSerpro: SerproClient | null = null;
function getClienteSerpro(): SerproClient {
  if (!clienteSerpro) clienteSerpro = new SerproClient();
  return clienteSerpro;
}

function labelMes(ano: number, mes: number): string {
  return `${String(mes).padStart(2, "0")}/${ano}`;
}

/** Mensagem do SERPRO que significa "não tem declaração", não "deu erro". */
function ehSemDeclaracao(mensagens: Array<{ codigo: string; texto: string }>): boolean {
  return mensagens.some((m) =>
    /nao (existe|foi encontrad|ha )|sem declaracao|sem dados|nenhuma declaracao/i.test(
      m.texto.normalize("NFD").replace(/[̀-ͯ]/g, ""),
    ),
  );
}

export async function consultarPgdasdNoSerpro(params: {
  clienteId: string;
  anoInicial: number;
  mesInicial?: number; // default 1
  anoFinal: number;
  mesFinal?: number; // default 12
  usuarioId?: string;
}): Promise<ResultadoConsultaPgdasd> {
  const { clienteId } = params;
  const de = competenciaUtc(params.anoInicial, params.mesInicial ?? 1);
  const ate = competenciaUtc(params.anoFinal, params.mesFinal ?? 12);

  const cliente = await prisma.cliente.findUnique({
    where: { id: clienteId },
    select: {
      cnpj: true,
      regimeTributario: true,
      metodoAcessoEcac: true,
      atendimentoInicio: true,
      atendimentoFim: true,
    },
  });
  if (!cliente) throw new Error("Cliente não encontrado.");

  // Guarda de regime — antes de criar log e antes de gastar chamada.
  if (cliente.regimeTributario && !ehSimples(cliente.regimeTributario)) {
    throw new Error(
      `PGDAS-D é declaração do Simples Nacional; este cliente está cadastrado como "${cliente.regimeTributario}". Corrija o regime no cadastro se ele for optante.`,
    );
  }

  const sinc = await prisma.pgdasdSincronizacao.create({
    data: {
      clienteId,
      periodoInicial: de,
      periodoFinal: ate,
      sucesso: false,
      requisitadoPor: params.usuarioId,
    },
  });

  const competencias: ResultadoConsultaPgdasd["competencias"] = [];

  try {
    const janela = recortarPeriodo(cliente, de, ate);
    if (!janela) {
      const msg =
        "Nenhuma competência do intervalo está dentro do período de atendimento do cliente — nenhuma chamada ao SERPRO foi feita.";
      await prisma.pgdasdSincronizacao.update({
        where: { id: sinc.id },
        data: { sucesso: true, mensagem: msg },
      });
      return {
        ok: true,
        sincronizacaoId: sinc.id,
        declaracoes: 0,
        semDeclaracao: 0,
        comErro: 0,
        mensagem: msg,
        competencias,
      };
    }
    const avisoRecorte = descreverRecorte({ de, ate }, janela);

    const meses: Array<{ ano: number; mes: number }> = [];
    const cursor = new Date(janela.de);
    while (cursor.getTime() <= janela.ate.getTime()) {
      meses.push({ ano: cursor.getUTCFullYear(), mes: cursor.getUTCMonth() + 1 });
      cursor.setUTCMonth(cursor.getUTCMonth() + 1);
    }

    const cnpj = cliente.cnpj.replace(/\D/g, "");
    const client = getClienteSerpro();

    // Certificado do cliente (quando o acesso é CERTIFICADO_PROPRIO): carrega
    // UMA vez, em memória, e reusa em todas as competências.
    let signingCert: CertificadoCarregado | undefined;
    if (cliente.metodoAcessoEcac === "CERTIFICADO_PROPRIO") {
      const cert = await carregarCertificadoDoCliente(clienteId);
      if (!cert) {
        throw new Error(
          "Cliente está como CERTIFICADO_PROPRIO mas não tem certificado cadastrado — suba o .pfx e a senha na tela de edição.",
        );
      }
      if (cert.notAfter.getTime() < Date.now()) {
        throw new Error(
          `Certificado do cliente expirou em ${cert.notAfter.toLocaleDateString("pt-BR", { timeZone: "UTC" })} — renove antes de consultar.`,
        );
      }
      signingCert = cert;
    }

    const consultarMes = async (alvo: { ano: number; mes: number }) => {
      const label = labelMes(alvo.ano, alvo.mes);
      try {
        const envelope = await client.consultarPgdasd({
          cnpjContribuinte: cnpj,
          ano: alvo.ano,
          mes: alvo.mes,
          signingCert,
        });

        if (envelope.status !== 200) {
          const detalhe = envelope.mensagens.map((m) => `${m.codigo} ${m.texto}`).join(" | ");
          if (ehSemDeclaracao(envelope.mensagens)) {
            competencias.push({ label, status: "vazio", detalhe: detalhe || "sem declaração no período" });
          } else {
            competencias.push({ label, status: "erro", detalhe: detalhe || `status ${envelope.status}` });
          }
          return;
        }

        if (!envelope.declaracaoPdf) {
          competencias.push({
            label,
            status: "erro",
            detalhe:
              "SERPRO respondeu 200 mas não veio o PDF da declaração — o formato do retorno pode ter mudado.",
          });
          return;
        }

        const leitura = await lerDeclaracaoPgdasdPdf(envelope.declaracaoPdf, alvo);
        if (!leitura.ok) {
          competencias.push({ label, status: "erro", detalhe: leitura.motivo });
          return;
        }

        await gravarDeclaracao({
          clienteId,
          sincronizacaoId: sinc.id,
          competencia: competenciaUtc(alvo.ano, alvo.mes),
          declaracao: leitura.declaracao,
          numeroDeclaracaoEnvelope: envelope.numeroDeclaracao,
        });

        const d = leitura.declaracao;
        competencias.push({
          label,
          status: "ok",
          detalhe:
            `RPA ${d.rpaTotal.toFixed(2)} · débito ${d.totalDebito.toFixed(2)}` +
            (d.alertas.length ? ` · ${d.alertas.length} alerta(s)` : ""),
        });
      } catch (e) {
        competencias.push({
          label,
          status: "erro",
          detalhe: (e instanceof Error ? e.message : String(e)).slice(0, 400),
        });
      }
    };

    // Com CERTIFICADO_PROPRIO o termo é assinado pelo cert do cliente; sem ele,
    // vale a procuração eletrônica e o cert do escritório (SERPRO_CERT_PATH).
    for (const alvo of meses) await consultarMes(alvo);

    const ok = competencias.filter((c) => c.status === "ok").length;
    const vazio = competencias.filter((c) => c.status === "vazio").length;
    const erro = competencias.filter((c) => c.status === "erro").length;

    const mensagem = [
      avisoRecorte,
      `${ok} declaração(ões) lida(s), ${vazio} competência(s) sem declaração, ${erro} com erro.`,
      competencias.map((c) => `${c.label} [${c.status}] ${c.detalhe}`).join(" | "),
    ]
      .filter(Boolean)
      .join(" ")
      .slice(0, 2000);

    await prisma.pgdasdSincronizacao.update({
      where: { id: sinc.id },
      data: {
        declaracoesRetornadas: ok,
        competenciasSemDeclaracao: vazio,
        competenciasComErro: erro,
        // Sucesso quando alguma competência veio, ou quando nenhuma deu erro
        // técnico (cliente pode não ter PGDAS no intervalo — é legítimo).
        sucesso: erro === 0 || ok > 0,
        mensagem,
      },
    });

    return {
      ok: erro === 0 || ok > 0,
      sincronizacaoId: sinc.id,
      declaracoes: ok,
      semDeclaracao: vazio,
      comErro: erro,
      mensagem,
      competencias,
    };
  } catch (e) {
    const erro = e instanceof Error ? e.message : String(e);
    await prisma.pgdasdSincronizacao.update({
      where: { id: sinc.id },
      data: { sucesso: false, mensagem: erro.slice(0, 2000) },
    });
    throw e;
  }
}

async function gravarDeclaracao(params: {
  clienteId: string;
  sincronizacaoId: string;
  competencia: Date;
  declaracao: DeclaracaoPgdasd;
  numeroDeclaracaoEnvelope: string | null;
}) {
  const { declaracao: d } = params;
  const dec = (n: number) => new Prisma.Decimal(n.toFixed(2));

  const dados = {
    numeroDeclaracao: d.numeroDeclaracao ?? params.numeroDeclaracaoEnvelope,
    numeroRecibo: d.numeroRecibo,
    dataTransmissao: d.dataTransmissao,
    situacao: d.situacao,
    optanteSimples: d.optanteSimples,
    regimeApuracao: d.regimeApuracao,
    rpaInterno: dec(d.rpaInterno),
    rpaExterno: dec(d.rpaExterno),
    rpaTotal: dec(d.rpaTotal),
    rbt12: dec(d.rbt12),
    rba: dec(d.rba),
    irpj: dec(d.tributos.irpj),
    csll: dec(d.tributos.csll),
    cofins: dec(d.tributos.cofins),
    pis: dec(d.tributos.pis),
    inss: dec(d.tributos.inss),
    icms: dec(d.tributos.icms),
    ipi: dec(d.tributos.ipi),
    iss: dec(d.tributos.iss),
    totalDebito: dec(d.totalDebito),
    alertas: d.alertas,
    // Só valores — nunca o PDF nem o texto integral da declaração.
    payloadBruto: {
      cnpjMatriz: d.cnpjMatriz,
      tributos: d.tributos,
      lidoEm: new Date().toISOString(),
      fonte: "SERPRO PGDASD CONSULTIMADECREC14",
    } as Prisma.InputJsonValue,
    sincronizacaoId: params.sincronizacaoId,
  };

  await prisma.pgdasdDeclaracao.upsert({
    where: {
      clienteId_periodoApuracao: {
        clienteId: params.clienteId,
        periodoApuracao: params.competencia,
      },
    },
    create: {
      clienteId: params.clienteId,
      periodoApuracao: params.competencia,
      ...dados,
    },
    update: dados,
  });
}
