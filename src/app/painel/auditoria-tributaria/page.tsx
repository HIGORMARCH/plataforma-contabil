import { requireSessao, PAPEIS_INTERNOS } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { redirect } from "next/navigation";
import { tributoDeCodigo, categoriaDeCodigo } from "@/lib/serpro/mapeamento-tributos";
import { AuditoriaTributariaCliente, type Guia } from "./AuditoriaTributariaCliente";

/**
 * Auditoria Tributária — cruzamento SISTEMA CONTÁBIL (A) × PORTAL e-CAC (B).
 *
 * Coluna B vem do banco (EcacPagamento + EcacDesmembramento), populado pelo
 * sync automático 22h (via SERPRO PAGTOWEB/PAGAMENTOS71) — ver [[projeto-modulo-auditoria-tributaria]].
 * Coluna A ainda mock/vazia (Fase 3: parser Domínio) — as guias vêm só com B por enquanto.
 */
export default async function AuditoriaTributariaPage() {
  const sessao = await requireSessao();
  if (!PAPEIS_INTERNOS.includes(sessao.papel)) redirect("/painel");

  const clientes = await prisma.cliente.findMany({
    where: { escritorioId: sessao.escritorioId },
    orderBy: { razaoSocial: "asc" },
    select: {
      id: true,
      razaoSocial: true,
      nomeFantasia: true,
      cnpj: true,
      metodoAcessoEcac: true,
    },
  });

  // Coluna B — pagamentos já sincronizados
  const pagamentos = await prisma.ecacPagamento.findMany({
    where: { cliente: { escritorioId: sessao.escritorioId } },
    include: {
      desmembramentos: true,
      cliente: { select: { id: true, razaoSocial: true, nomeFantasia: true, cnpj: true } },
    },
    orderBy: { dataArrecadacao: "desc" },
  });

  // Flatten em Guia[]: uma linha por desmembramento (ou pelo próprio pagamento
  // quando não há desmembramentos).
  const guias: Guia[] = [];
  for (const p of pagamentos) {
    const empresa = p.cliente.nomeFantasia || p.cliente.razaoSocial;
    const subs = p.desmembramentos;

    if (subs.length === 0) {
      guias.push({
        id: p.id,
        clienteId: p.cliente.id,
        empresa,
        cnpj: p.cliente.cnpj,
        competencia: formatarCompetencia(p.periodoApuracao),
        tributo: tributoDeCodigo(p.codigoReceitaPrincipal),
        categoria: categoriaDeCodigo(p.codigoReceitaPrincipal),
        a: null,
        b: {
          principal: Number(p.valorPrincipal),
          encargos: Number(p.valorMulta ?? 0) + Number(p.valorJuros ?? 0),
          codigo: p.codigoReceitaPrincipal,
          autenticacao: p.numeroDocumento,
        },
        status: (Number(p.valorSaldoTotal ?? 0) > 0.01 ? "ABERTA" : "PAGA"),
        situacaoCadastral: "REGULAR",
      });
      continue;
    }

    for (const sub of subs) {
      guias.push({
        id: sub.id,
        clienteId: p.cliente.id,
        empresa,
        cnpj: p.cliente.cnpj,
        competencia: formatarCompetencia(sub.periodoApuracao),
        tributo: tributoDeCodigo(sub.codigoReceita),
        categoria: categoriaDeCodigo(sub.codigoReceita),
        a: null,
        b: {
          principal: Number(sub.valorPrincipal),
          encargos: Number(sub.valorMulta ?? 0) + Number(sub.valorJuros ?? 0),
          codigo: sub.codigoReceita,
          autenticacao: p.numeroDocumento,
        },
        status: (Number(sub.valorSaldoTotal ?? 0) > 0.01 ? "ABERTA" : "PAGA"),
        situacaoCadastral: "REGULAR",
      });
    }
  }

  // Última sincronização por cliente (mais recente sucesso)
  const clienteIds = clientes.map((c) => c.id);
  const ultimasSyncs = clienteIds.length === 0 ? [] : await prisma.ecacSincronizacao.findMany({
    where: { clienteId: { in: clienteIds }, sucesso: true },
    orderBy: { executadoEm: "desc" },
    distinct: ["clienteId"],
    select: {
      clienteId: true,
      executadoEm: true,
      tipo: true,
      periodoInicial: true,
      periodoFinal: true,
    },
  });
  const mapaUltimaSync: Record<
    string,
    { executadoEm: string; tipo: string; periodoInicial: string; periodoFinal: string }
  > = {};
  for (const s of ultimasSyncs) {
    mapaUltimaSync[s.clienteId] = {
      executadoEm: s.executadoEm.toISOString(),
      tipo: s.tipo,
      periodoInicial: s.periodoInicial.toISOString(),
      periodoFinal: s.periodoFinal.toISOString(),
    };
  }

  return (
    <AuditoriaTributariaCliente
      clientes={clientes}
      guias={guias}
      ultimasSyncs={mapaUltimaSync}
    />
  );
}

function formatarCompetencia(d: Date): string {
  const mes = String(d.getUTCMonth() + 1).padStart(2, "0");
  return `${mes}/${d.getUTCFullYear()}`;
}
