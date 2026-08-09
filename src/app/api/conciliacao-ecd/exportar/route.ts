/**
 * Exporta o relatório "Contas divergentes" da conciliação Domínio × ECD
 * em Excel. Query string: ?clienteId=<id>&ano=<AAAA>&filtro=<divergentes|todas>
 *
 * A planilha traz colunas Status (dropdown) e Observação em branco pra o
 * contador responsável preencher com a ação tomada e devolver.
 */

import { NextRequest, NextResponse } from "next/server";
import { getSessao, PAPEIS_INTERNOS } from "@/lib/auth";
import { prisma } from "@/lib/db";
import {
  contasAnaliticasDominioDoAno,
  contasAnaliticasEcdDoAno,
  contasAnaliticasEcdViaI155DoAno,
} from "@/lib/accounting/contasAnaliticas";
import { conciliarPorCodigoDominio, conciliarPorSintetica } from "@/lib/accounting/conciliacaoEcd";
import { gerarExcelConciliacao } from "@/lib/accounting/exportarConciliacaoExcel";

export async function GET(req: NextRequest) {
  const sessao = await getSessao();
  if (!sessao || !PAPEIS_INTERNOS.includes(sessao.papel)) {
    return NextResponse.json({ erro: "Não autorizado" }, { status: 401 });
  }

  const params = req.nextUrl.searchParams;
  const clienteId = params.get("clienteId") ?? "";
  const ano = Number(params.get("ano") ?? "0");
  const filtro = params.get("filtro") === "todas" ? "todas" : "divergentes";

  if (!clienteId || !ano || !Number.isFinite(ano)) {
    return NextResponse.json({ erro: "Parâmetros inválidos" }, { status: 400 });
  }

  const cliente = await prisma.cliente.findFirst({
    where: { id: clienteId, escritorioId: sessao.escritorioId },
    select: { razaoSocial: true, cnpj: true },
  });
  if (!cliente) {
    return NextResponse.json({ erro: "Cliente não encontrado" }, { status: 404 });
  }

  const [contasDom, contasEcdI155] = await Promise.all([
    contasAnaliticasDominioDoAno(cliente, ano),
    contasAnaliticasEcdViaI155DoAno(cliente, ano),
  ]);

  if (contasDom.length === 0) {
    return NextResponse.json(
      { erro: "Balanço PDF do Domínio não encontrado na pasta única do cliente." },
      { status: 422 },
    );
  }

  // Preferência: matching determinístico via I155. Fallback: J100 por descrição.
  let relatorio;
  if (contasEcdI155.length > 0) {
    relatorio = conciliarPorCodigoDominio(contasDom, contasEcdI155, ano);
  } else {
    const contasEcdJ100 = await contasAnaliticasEcdDoAno(cliente, ano);
    if (contasEcdJ100.length === 0) {
      return NextResponse.json(
        { erro: "SPED-ECD sem contas analíticas (I155 e J100 vazios)." },
        { status: 422 },
      );
    }
    relatorio = conciliarPorSintetica(contasDom, contasEcdJ100, ano);
  }
  const buffer = await gerarExcelConciliacao(relatorio, {
    razaoSocial: cliente.razaoSocial,
    cnpj: cliente.cnpj,
    ano,
    filtro,
  });

  const cnpjLimpo = cliente.cnpj.replace(/\D/g, "");
  const nomeArquivo = `conciliacao-ecd-${cnpjLimpo}-${ano}${filtro === "divergentes" ? "-divergentes" : ""}.xlsx`;

  return new NextResponse(new Uint8Array(buffer), {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${nomeArquivo}"`,
    },
  });
}
