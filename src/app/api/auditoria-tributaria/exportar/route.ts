import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireSessao, PAPEIS_INTERNOS } from "@/lib/auth";
import { gerarPlanilhaAuditoria } from "@/lib/serpro/exportar-xlsx";

/**
 * GET /api/auditoria-tributaria/exportar?clienteId=xxx&de=YYYY-MM&ate=YYYY-MM
 *
 * Gera .xlsx multi-aba com os DARFs sincronizados pra esse cliente
 * (opcionalmente filtrado por intervalo de competência).
 */
export async function GET(req: Request) {
  const sessao = await requireSessao();
  if (!PAPEIS_INTERNOS.includes(sessao.papel)) {
    return NextResponse.json({ erro: "acesso restrito" }, { status: 403 });
  }

  const url = new URL(req.url);
  const clienteId = url.searchParams.get("clienteId");
  const de = url.searchParams.get("de"); // YYYY-MM
  const ate = url.searchParams.get("ate");

  if (!clienteId) return NextResponse.json({ erro: "clienteId é obrigatório" }, { status: 400 });

  const cliente = await prisma.cliente.findFirst({
    where: { id: clienteId, escritorioId: sessao.escritorioId },
    select: { razaoSocial: true, nomeFantasia: true, cnpj: true, metodoAcessoEcac: true },
  });
  if (!cliente) return NextResponse.json({ erro: "cliente não encontrado" }, { status: 404 });

  // Filtro por competência (periodoApuracao)
  const where: {
    clienteId: string;
    periodoApuracao?: { gte?: Date; lte?: Date };
  } = { clienteId };
  if (de || ate) {
    where.periodoApuracao = {};
    if (de) {
      const [ano, mes] = de.split("-").map(Number);
      where.periodoApuracao.gte = new Date(Date.UTC(ano, mes - 1, 1));
    }
    if (ate) {
      const [ano, mes] = ate.split("-").map(Number);
      // último dia do mês
      where.periodoApuracao.lte = new Date(Date.UTC(ano, mes, 0, 23, 59, 59, 999));
    }
  }

  const pagamentosRaw = await prisma.ecacPagamento.findMany({
    where,
    include: { desmembramentos: true },
    orderBy: { dataArrecadacao: "asc" },
  });

  // Converte Decimal do Prisma pra number
  const pagamentos = pagamentosRaw.map((p) => ({
    numeroDocumento: p.numeroDocumento,
    tipoDescricao: p.tipoDescricao,
    periodoApuracao: p.periodoApuracao,
    dataArrecadacao: p.dataArrecadacao,
    dataVencimento: p.dataVencimento,
    codigoReceitaPrincipal: p.codigoReceitaPrincipal,
    descricaoReceitaPrincipal: p.descricaoReceitaPrincipal,
    valorTotal: Number(p.valorTotal),
    valorPrincipal: Number(p.valorPrincipal),
    valorMulta: p.valorMulta === null ? null : Number(p.valorMulta),
    valorJuros: p.valorJuros === null ? null : Number(p.valorJuros),
    desmembramentos: p.desmembramentos.map((d) => ({
      sequencial: d.sequencial,
      codigoReceita: d.codigoReceita,
      descricaoReceita: d.descricaoReceita,
      periodoApuracao: d.periodoApuracao,
      dataVencimento: d.dataVencimento,
      valorTotal: Number(d.valorTotal),
      valorPrincipal: Number(d.valorPrincipal),
      valorMulta: d.valorMulta === null ? null : Number(d.valorMulta),
      valorJuros: d.valorJuros === null ? null : Number(d.valorJuros),
    })),
  }));

  const periodoInicial = where.periodoApuracao?.gte;
  const periodoFinal = where.periodoApuracao?.lte;

  const buffer = await gerarPlanilhaAuditoria({
    cliente,
    pagamentos,
    periodoInicial,
    periodoFinal,
  });

  const nomeArquivo = `auditoria-${(cliente.nomeFantasia || cliente.razaoSocial)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")}${de ? `-de-${de}` : ""}${ate ? `-ate-${ate}` : ""}.xlsx`;

  return new NextResponse(new Uint8Array(buffer), {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${nomeArquivo}"`,
    },
  });
}
