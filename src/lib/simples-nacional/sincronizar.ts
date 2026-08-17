import { prisma } from "@/lib/db";
import { decifrar } from "@/lib/crypto";
import { rasparPortalSimples, type EntregaSimplesRaspada } from "./scraperPortal";
import { recortarPeriodo, competenciaUtc } from "@/lib/atendimento";

/**
 * Orquestrador: decifra o PFX do cliente, dispara o robô, persiste as entregas
 * encontradas em EntregaObrigacaoManual com origem=PORTAL_SIMPLES.
 *
 * Substitui entradas MANUAIS anteriores da mesma competência (portal é fonte
 * autoritativa). Já entradas com origem PORTAL_SIMPLES são atualizadas
 * (data/recibo podem ter sido retificados).
 */
export async function sincronizarSimplesNacional(params: {
  clienteId: string;
  anoInicial: number;
  anoFinal: number;
  tipos?: Array<"PGDAS_D" | "DEFIS">;
  headless?: boolean;
  executadoPor?: string;
}) {
  const cliente = await prisma.cliente.findUnique({
    where: { id: params.clienteId },
    select: {
      id: true,
      cnpj: true,
      certificadoArquivo: true,
      certificadoSenha: true,
      atendimentoInicio: true,
      atendimentoFim: true,
    },
  });
  if (!cliente) throw new Error("cliente não encontrado");

  // GUARD DE PERÍODO — não abrir o robô no portal pra ano que o escritório não
  // atendeu. PGDAS-D e DEFIS são federais, então a vigência da IE não entra aqui.
  const janela = recortarPeriodo(
    cliente,
    competenciaUtc(params.anoInicial, 1),
    competenciaUtc(params.anoFinal, 12),
  );
  if (!janela) {
    throw new Error(
      "nenhum ano do intervalo está dentro do período de atendimento do cliente — ajuste o cadastro ou o intervalo",
    );
  }
  const anoInicial = janela.de.getUTCFullYear();
  const anoFinal = janela.ate.getUTCFullYear();
  if (!cliente.cnpj) throw new Error("cliente sem CNPJ cadastrado");
  if (!cliente.certificadoArquivo || !cliente.certificadoSenha) {
    throw new Error(
      "cliente sem certificado digital cadastrado — sobe o .pfx em Editar cadastro",
    );
  }

  const senhaClara = decifrar(cliente.certificadoSenha);
  if (!senhaClara) throw new Error("falha ao decifrar senha do certificado");

  const sincronizacao = await prisma.simplesNacionalSincronizacao.create({
    data: {
      clienteId: params.clienteId,
      // Grava o range EFETIVAMENTE consultado (já recortado), não o pedido —
      // é o que explica depois por que um ano não veio.
      anoInicial,
      anoFinal,
      tiposConsultados: (params.tipos ?? ["PGDAS_D", "DEFIS"]).join(","),
      executadoPor: params.executadoPor,
    },
  });

  let entregas: EntregaSimplesRaspada[] = [];
  try {
    entregas = await rasparPortalSimples({
      cnpj: cliente.cnpj,
      pfxBuffer: Buffer.from(cliente.certificadoArquivo),
      pfxSenha: senhaClara,
      anoInicial,
      anoFinal,
      tipos: params.tipos,
      headless: params.headless ?? true,
    });
  } catch (e) {
    await prisma.simplesNacionalSincronizacao.update({
      where: { id: sincronizacao.id },
      data: {
        sucesso: false,
        mensagem: e instanceof Error ? e.message : String(e),
      },
    });
    throw e;
  }

  let novas = 0;
  let substituidas = 0;
  for (const e of entregas) {
    const existente = await prisma.entregaObrigacaoManual.findFirst({
      where: {
        clienteId: params.clienteId,
        tipoObrigacao: e.tipo,
        ano: e.ano,
        mes: e.mes,
      },
      select: { id: true, origem: true },
    });
    if (existente) {
      substituidas++;
      await prisma.entregaObrigacaoManual.update({
        where: { id: existente.id },
        data: {
          origem: "PORTAL_SIMPLES",
          dataEntrega: e.dataEntrega,
          numeroRecibo: e.numeroRecibo,
        },
      });
    } else {
      novas++;
      await prisma.entregaObrigacaoManual.create({
        data: {
          clienteId: params.clienteId,
          tipoObrigacao: e.tipo,
          origem: "PORTAL_SIMPLES",
          ano: e.ano,
          mes: e.mes,
          dataEntrega: e.dataEntrega,
          numeroRecibo: e.numeroRecibo,
        },
      });
    }
  }

  await prisma.simplesNacionalSincronizacao.update({
    where: { id: sincronizacao.id },
    data: {
      sucesso: true,
      entregasEncontradas: novas,
      entregasSubstituidas: substituidas,
      mensagem: `${novas} nova(s) + ${substituidas} atualizada(s)`,
    },
  });

  return { novas, substituidas, entregasEncontradas: entregas.length };
}
