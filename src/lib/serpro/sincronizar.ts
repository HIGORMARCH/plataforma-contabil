import { prisma } from "@/lib/db";
import { SerproClient } from "./client";
import { getSerproConfig } from "./config";
import { carregarPfx, type CertificadoCarregado } from "./pkcs12";
import { decifrar } from "@/lib/crypto";
import type { PagtowebDocumento } from "./types";

/**
 * Serviço orquestrador de sincronização e-CAC.
 *
 * Estratégia:
 *   - Idempotente por (clienteId, tipo, periodoInicial, periodoFinal, dia de execução).
 *     Se já rodou hoje com sucesso pro mesmo range, pula (não consome cota SERPRO).
 *   - Registra tudo em EcacSincronizacao (relatório oficial com data/hora).
 *   - Upsert de EcacPagamento por (clienteId, numeroDocumento) — se doc já existia,
 *     substitui + apaga desmembramentos antigos e recria.
 *   - Um SerproClient único (MARCH) atende todos clientes com metodoAcessoEcac=PROCURACAO_MARCH,
 *     reusando access_token/procurador_token. Clientes com CERTIFICADO_PROPRIO usam o mesmo
 *     SerproClient para as chamadas de rede, mas assinam o termo de autorização com o próprio
 *     .pfx (path + senha cifrada no cadastro do cliente) e viram autor do pedido.
 */

export type TipoSincronizacao = "DIARIO" | "MENSAL" | "MANUAL";

export type ResultadoSincronizacao = {
  clienteId: string;
  clienteNome: string;
  sucesso: boolean;
  quantidade: number;
  mensagem: string;
  puladoIdempotencia: boolean;
};

export type ResultadoLoteSincronizacao = {
  totalClientes: number;
  sucesso: number;
  falha: number;
  pulados: number;
  documentosImportados: number;
  detalhes: ResultadoSincronizacao[];
};

/** Retorna 00:00:00 UTC (usamos UTC como pivô — SERPRO devolve em BRT ISO). */
function inicioDoDia(d: Date): Date {
  const x = new Date(d);
  x.setUTCHours(0, 0, 0, 0);
  return x;
}
function fimDoDia(d: Date): Date {
  const x = new Date(d);
  x.setUTCHours(23, 59, 59, 999);
  return x;
}
function saoNoMesmoDia(a: Date, b: Date): boolean {
  return (
    a.getUTCFullYear() === b.getUTCFullYear() &&
    a.getUTCMonth() === b.getUTCMonth() &&
    a.getUTCDate() === b.getUTCDate()
  );
}

/** Ontem (00:00 a 23:59 UTC). Para uso do sync-diario. */
export function rangeDiaAnterior(): { inicio: Date; fim: Date } {
  const ontem = new Date();
  ontem.setUTCDate(ontem.getUTCDate() - 1);
  return { inicio: inicioDoDia(ontem), fim: fimDoDia(ontem) };
}

/** Mês anterior completo (dia 1 00:00 até último dia 23:59 UTC). Para sync-mensal. */
export function rangeMesAnterior(): { inicio: Date; fim: Date } {
  const hoje = new Date();
  const inicioMesAnterior = new Date(Date.UTC(hoje.getUTCFullYear(), hoje.getUTCMonth() - 1, 1, 0, 0, 0));
  const fimMesAnterior = new Date(Date.UTC(hoje.getUTCFullYear(), hoje.getUTCMonth(), 0, 23, 59, 59, 999));
  return { inicio: inicioMesAnterior, fim: fimMesAnterior };
}

/**
 * Persiste documentos SERPRO em EcacPagamento + EcacDesmembramento.
 * Upsert por (clienteId, numeroDocumento). Desmembramentos são deleted+recriados.
 */
async function persistirDocumentos(clienteId: string, docs: PagtowebDocumento[]): Promise<number> {
  let importados = 0;
  for (const d of docs) {
    const dataPagamento = { clienteId, numeroDocumento: d.numeroDocumento };
    const camposPagamento = {
      tipoCodigo: d.tipo.codigo,
      tipoDescricao: d.tipo.descricao,
      referencia: d.referencia,
      periodoApuracao: new Date(d.periodoApuracao),
      dataArrecadacao: new Date(d.dataArrecadacao),
      dataVencimento: new Date(d.dataVencimento),
      codigoReceitaPrincipal: d.receitaPrincipal.codigo,
      descricaoReceitaPrincipal: d.receitaPrincipal.descricao,
      valorTotal: d.valorTotal,
      valorPrincipal: d.valorPrincipal,
      valorMulta: d.valorMulta,
      valorJuros: d.valorJuros,
      valorSaldoTotal: d.valorSaldoTotal,
      valorSaldoPrincipal: d.valorSaldoPrincipal,
      valorSaldoMulta: d.valorSaldoMulta,
      valorSaldoJuros: d.valorSaldoJuros,
      sincronizadoEm: new Date(),
    };

    const pagamento = await prisma.ecacPagamento.upsert({
      where: { clienteId_numeroDocumento: dataPagamento },
      create: { ...dataPagamento, ...camposPagamento },
      update: camposPagamento,
    });

    // Reset dos desmembramentos e recriação
    await prisma.ecacDesmembramento.deleteMany({ where: { pagamentoId: pagamento.id } });
    const desms = d.desmembramentos ?? [];
    if (desms.length > 0) {
      await prisma.ecacDesmembramento.createMany({
        data: desms.map((sub) => ({
          pagamentoId: pagamento.id,
          sequencial: sub.sequencial,
          codigoReceita: sub.receitaPrincipal.codigo,
          descricaoReceita: sub.receitaPrincipal.descricao,
          extensaoCodigo: sub.receitaPrincipal.extensaoReceita?.codigo ?? null,
          extensaoDescricao: sub.receitaPrincipal.extensaoReceita?.descricao ?? null,
          periodoApuracao: new Date(sub.periodoApuracao),
          dataVencimento: new Date(sub.dataVencimento),
          valorTotal: sub.valorTotal,
          valorPrincipal: sub.valorPrincipal,
          valorMulta: sub.valorMulta,
          valorJuros: sub.valorJuros,
          valorSaldoTotal: sub.valorSaldoTotal,
          valorSaldoPrincipal: sub.valorSaldoPrincipal,
          valorSaldoMulta: sub.valorSaldoMulta,
          valorSaldoJuros: sub.valorSaldoJuros,
          cib: sub.cib,
        })),
      });
    }
    importados++;
  }
  return importados;
}

/**
 * Verifica idempotência: retorna true se JÁ existe sincronização bem-sucedida
 * para esse cliente + tipo + range no dia de hoje (UTC).
 */
async function jaSincronizadoHoje(
  clienteId: string,
  tipo: TipoSincronizacao,
  inicio: Date,
  fim: Date,
): Promise<boolean> {
  const hoje = inicioDoDia(new Date());
  const registro = await prisma.ecacSincronizacao.findFirst({
    where: {
      clienteId,
      tipo,
      periodoInicial: inicio,
      periodoFinal: fim,
      sucesso: true,
      executadoEm: { gte: hoje },
    },
    orderBy: { executadoEm: "desc" },
  });
  if (!registro) return false;
  return saoNoMesmoDia(registro.executadoEm, new Date());
}

/**
 * Sincroniza UM cliente. Retorna resultado (não lança em caso de erro do cliente).
 * Se already-synced-today, retorna com puladoIdempotencia=true.
 */
export async function sincronizarCliente(params: {
  clienteId: string;
  tipo: TipoSincronizacao;
  inicio: Date;
  fim: Date;
  cliente?: SerproClient; // opcional — reusa entre chamadas do lote
  forcar?: boolean; // sync manual força mesmo se já rodou hoje
}): Promise<ResultadoSincronizacao> {
  const { clienteId, tipo, inicio, fim, forcar } = params;
  const clienteRegistro = await prisma.cliente.findUnique({ where: { id: clienteId } });
  if (!clienteRegistro) {
    return {
      clienteId,
      clienteNome: "(não encontrado)",
      sucesso: false,
      quantidade: 0,
      mensagem: "Cliente não encontrado no banco",
      puladoIdempotencia: false,
    };
  }
  const clienteNome = clienteRegistro.nomeFantasia || clienteRegistro.razaoSocial;

  if (!forcar && (await jaSincronizadoHoje(clienteId, tipo, inicio, fim))) {
    return {
      clienteId,
      clienteNome,
      sucesso: true,
      quantidade: 0,
      mensagem: "Pulado (já sincronizado hoje pra esse range)",
      puladoIdempotencia: true,
    };
  }

  // Método CERTIFICADO_PROPRIO: carrega o .pfx do cliente e usa como assinante do
  // termo de procuração. Autor do pedido = próprio cliente. Falhas de acesso ao
  // arquivo, senha errada ou cert expirado viram registro em EcacSincronizacao
  // com mensagem específica (nunca vazam a senha em claro).
  let signingCert: CertificadoCarregado | undefined;
  if (clienteRegistro.metodoAcessoEcac === "CERTIFICADO_PROPRIO") {
    const falhar = async (msg: string) => {
      await prisma.ecacSincronizacao.create({
        data: {
          clienteId, tipo, periodoInicial: inicio, periodoFinal: fim,
          quantidade: 0, sucesso: false, mensagem: msg.slice(0, 500),
        },
      });
      return { clienteId, clienteNome, sucesso: false, quantidade: 0, mensagem: msg, puladoIdempotencia: false };
    };
    if (!clienteRegistro.certificadoCaminho || !clienteRegistro.certificadoSenha) {
      return falhar("Certificado próprio não configurado — cadastre o caminho do .pfx e a senha.");
    }
    let senhaClara: string;
    try {
      senhaClara = decifrar(clienteRegistro.certificadoSenha);
    } catch (e) {
      return falhar(`Falha ao decifrar a senha do certificado (ENCRYPTION_KEY diferente?): ${e instanceof Error ? e.message : String(e)}`);
    }
    try {
      signingCert = await carregarPfx(clienteRegistro.certificadoCaminho, senhaClara);
    } catch (e) {
      return falhar(`Não foi possível abrir o certificado em ${clienteRegistro.certificadoCaminho}: ${e instanceof Error ? e.message : String(e)}`);
    }
    if (signingCert.notAfter.getTime() < Date.now()) {
      return falhar(`Certificado do cliente expirou em ${signingCert.notAfter.toLocaleDateString("pt-BR", { timeZone: "UTC" })} — renove antes de sincronizar.`);
    }
  }

  const clienteSerpro = params.cliente ?? new SerproClient();
  try {
    const docs = await clienteSerpro.consultarPagamentos({
      cnpjContribuinte: clienteRegistro.cnpj,
      dataInicial: inicio,
      dataFinal: fim,
      signingCert,
    });
    const importados = await persistirDocumentos(clienteId, docs);

    await prisma.ecacSincronizacao.create({
      data: {
        clienteId, tipo, periodoInicial: inicio, periodoFinal: fim,
        quantidade: importados, sucesso: true,
        mensagem: `Importados ${importados} documento(s)`,
      },
    });
    return {
      clienteId, clienteNome, sucesso: true,
      quantidade: importados,
      mensagem: `Importados ${importados} documento(s)`,
      puladoIdempotencia: false,
    };
  } catch (e) {
    const mensagem = e instanceof Error ? e.message : String(e);
    await prisma.ecacSincronizacao.create({
      data: {
        clienteId, tipo, periodoInicial: inicio, periodoFinal: fim,
        quantidade: 0, sucesso: false, mensagem: mensagem.slice(0, 500),
      },
    });
    return { clienteId, clienteNome, sucesso: false, quantidade: 0, mensagem, puladoIdempotencia: false };
  }
}

/**
 * Sincroniza TODOS os clientes do escritório para um range. Não interrompe se
 * um cliente falhar — cada falha registra em EcacSincronizacao.
 */
export async function sincronizarTodosClientes(params: {
  escritorioId: string;
  tipo: TipoSincronizacao;
  inicio: Date;
  fim: Date;
}): Promise<ResultadoLoteSincronizacao> {
  const { escritorioId, tipo, inicio, fim } = params;
  // Inclui os dois métodos: cada cliente é resolvido individualmente em sincronizarCliente.
  // PROCURACAO_MARCH reusa o SerproClient/procuradorToken cacheado; CERTIFICADO_PROPRIO
  // carrega o .pfx do cliente e refaz o step 2/3 por conta própria.
  const clientes = await prisma.cliente.findMany({
    where: { escritorioId, metodoAcessoEcac: { in: ["PROCURACAO_MARCH", "CERTIFICADO_PROPRIO"] } },
    select: { id: true },
  });
  const clienteSerpro = new SerproClient();
  // Pré-carrega tokens uma vez (evita renovar por cliente)
  await clienteSerpro.getTokens();

  const detalhes: ResultadoSincronizacao[] = [];
  for (const c of clientes) {
    const r = await sincronizarCliente({ clienteId: c.id, tipo, inicio, fim, cliente: clienteSerpro });
    detalhes.push(r);
  }

  return {
    totalClientes: clientes.length,
    sucesso: detalhes.filter((d) => d.sucesso && !d.puladoIdempotencia).length,
    falha: detalhes.filter((d) => !d.sucesso).length,
    pulados: detalhes.filter((d) => d.puladoIdempotencia).length,
    documentosImportados: detalhes.reduce((s, d) => s + d.quantidade, 0),
    detalhes,
  };
}

/** Header check pra endpoints de cron. Retorna true se autorizado. */
export function autorizarCron(req: Request): boolean {
  const config = getSerproConfig();
  const enviado = req.headers.get("x-cron-token") ?? "";
  return enviado.length > 0 && enviado === config.cronToken;
}
