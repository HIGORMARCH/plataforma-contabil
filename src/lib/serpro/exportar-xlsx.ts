import ExcelJS from "exceljs";
import { tributoDeCodigo } from "./mapeamento-tributos";

/**
 * Gera uma planilha .xlsx multi-aba com os DARFs sincronizados de um cliente,
 * herdando o padrão do auditor-guias-pagas.html original (março 2025):
 *   - Dashboard: cabeçalho + totalizadores
 *   - Documentos: uma linha por EcacPagamento (nº autenticação bancária)
 *   - Detalhado: uma linha por EcacDesmembramento (código de receita)
 *   - Resumo por Tributo: agregado por sigla (IRPJ/CSLL/PIS...)
 *   - Resumo por Competência: agregado por MM/AAAA
 */

const FONT = "Arial";
const FMT_MONEY = '#,##0.00;[Red](#,##0.00);-';

type Pagamento = {
  numeroDocumento: string;
  tipoDescricao: string;
  periodoApuracao: Date;
  dataArrecadacao: Date;
  dataVencimento: Date;
  codigoReceitaPrincipal: string;
  descricaoReceitaPrincipal: string | null;
  valorTotal: number;
  valorPrincipal: number;
  valorMulta: number | null;
  valorJuros: number | null;
  desmembramentos: Array<{
    sequencial: string;
    codigoReceita: string;
    descricaoReceita: string | null;
    periodoApuracao: Date;
    dataVencimento: Date;
    valorTotal: number;
    valorPrincipal: number;
    valorMulta: number | null;
    valorJuros: number | null;
  }>;
};

export type DadosCliente = {
  razaoSocial: string;
  nomeFantasia: string | null;
  cnpj: string;
  metodoAcessoEcac: string;
};

function fmtCompetencia(d: Date): string {
  return `${String(d.getUTCMonth() + 1).padStart(2, "0")}/${d.getUTCFullYear()}`;
}

export async function gerarPlanilhaAuditoria(params: {
  cliente: DadosCliente;
  pagamentos: Pagamento[];
  periodoInicial?: Date;
  periodoFinal?: Date;
}): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Plataforma Contábil — Auditoria Tributária";
  wb.created = new Date();

  const fillHead = { type: "pattern", pattern: "solid", fgColor: { argb: "FF4D4B40" } } as const;
  const fillTot = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF4EFE4" } } as const;
  const thin = { style: "thin", color: { argb: "FFB4B4B4" } } as const;
  const border = { top: thin, left: thin, right: thin, bottom: thin } as const;
  const headerFont = { name: FONT, bold: true, color: { argb: "FFFFFFFF" }, size: 11 } as const;
  const titleFont = { name: FONT, bold: true, color: { argb: "FF4D4B40" }, size: 14 } as const;
  const cellFont = { name: FONT, size: 10 } as const;
  const boldFont = { name: FONT, size: 10, bold: true } as const;
  const italFont = { name: FONT, italic: true, size: 10, color: { argb: "FF595959" } } as const;

  function writeHeader(ws: ExcelJS.Worksheet, headers: string[], rowNum: number) {
    headers.forEach((h, i) => {
      const cell = ws.getRow(rowNum).getCell(i + 1);
      cell.value = h; cell.font = headerFont; cell.fill = fillHead;
      cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
      cell.border = border;
    });
  }
  function fillCell(
    ws: ExcelJS.Worksheet, r: number, c: number, val: string | number | Date | null,
    opt: { money?: boolean; font?: typeof cellFont; align?: object; fill?: typeof fillTot } = {},
  ) {
    const cell = ws.getRow(r).getCell(c);
    cell.value = val;
    cell.font = opt.font ?? cellFont;
    cell.border = border;
    if (opt.money) {
      cell.numFmt = FMT_MONEY;
      cell.alignment = { horizontal: "right", vertical: "middle" };
    } else {
      cell.alignment = opt.align ?? { horizontal: "left", vertical: "middle", wrapText: true };
    }
    if (opt.fill) cell.fill = opt.fill;
    return cell;
  }

  const totalGeral = params.pagamentos.reduce((s, d) => s + d.valorTotal, 0);
  const totalPrincipal = params.pagamentos.reduce((s, d) => s + d.valorPrincipal, 0);
  const totalMulta = params.pagamentos.reduce((s, d) => s + (d.valorMulta ?? 0), 0);
  const totalJuros = params.pagamentos.reduce((s, d) => s + (d.valorJuros ?? 0), 0);

  /* ---- Aba Dashboard ---- */
  const ws0 = wb.addWorksheet("Dashboard", { views: [{ showGridLines: false }] });
  ws0.getCell("A1").value = "AUDITORIA TRIBUTÁRIA — PORTAL e-CAC (SERPRO PAGTOWEB)";
  ws0.getCell("A1").font = { name: FONT, bold: true, size: 18, color: { argb: "FF4D4B40" } };
  ws0.mergeCells("A1:D1"); ws0.getRow(1).height = 26;
  ws0.getCell("A2").value = `${params.cliente.razaoSocial} · CNPJ ${params.cliente.cnpj}`;
  ws0.getCell("A2").font = italFont; ws0.mergeCells("A2:D2");
  const periodo = params.periodoInicial && params.periodoFinal
    ? `Período ${params.periodoInicial.toLocaleDateString("pt-BR", { timeZone: "UTC" })} a ${params.periodoFinal.toLocaleDateString("pt-BR", { timeZone: "UTC" })}`
    : "Todos os documentos sincronizados";
  ws0.getCell("A3").value = periodo;
  ws0.getCell("A3").font = italFont; ws0.mergeCells("A3:D3");
  ws0.getCell("A4").value = `Gerado em ${new Date().toLocaleString("pt-BR")} · Método de acesso: ${params.cliente.metodoAcessoEcac === "CERTIFICADO_PROPRIO" ? "Certificado próprio do cliente" : "Procuração eletrônica do escritório"}`;
  ws0.getCell("A4").font = italFont; ws0.mergeCells("A4:D4");

  const totalDesms = params.pagamentos.reduce((s, d) => s + d.desmembramentos.length, 0);
  const compostas = params.pagamentos.filter((d) => d.desmembramentos.length > 1).length;
  const resumo: Array<[string, number | string]> = [
    ["Documentos importados", params.pagamentos.length],
    ["Desmembramentos (linhas fiscais)", totalDesms],
    ["Guias compostas (mais de um código)", compostas],
    ["Total principal", totalPrincipal],
    ["Total multa", totalMulta],
    ["Total juros", totalJuros],
    ["TOTAL PAGO", totalGeral],
  ];
  let r0 = 6;
  for (const [lbl, val] of resumo) {
    const money = /principal|multa|juros|pago/i.test(String(lbl)) && typeof val === "number";
    const isTotal = lbl === "TOTAL PAGO";
    fillCell(ws0, r0, 1, lbl, { font: isTotal ? boldFont : cellFont, fill: isTotal ? fillTot : undefined });
    fillCell(ws0, r0, 2, val, { money, font: boldFont, fill: isTotal ? fillTot : undefined });
    r0++;
  }
  ws0.columns = [{ width: 42 }, { width: 22 }, { width: 4 }, { width: 4 }];

  /* ---- Aba Documentos (uma linha por EcacPagamento) ---- */
  const ws1 = wb.addWorksheet("Documentos", { views: [{ showGridLines: false, state: "frozen", ySplit: 3 }] });
  ws1.getCell("A1").value = "DOCUMENTOS — uma linha por comprovante (número de autenticação bancária)";
  ws1.getCell("A1").font = titleFont; ws1.mergeCells("A1:L1");
  const h1 = [
    "Nº Autenticação", "Tipo", "Período Apuração", "Vencimento", "Arrecadação",
    "Cód. Receita", "Tributo (nossa sigla)", "Descrição Receita",
    "Principal", "Multa", "Juros", "Total",
  ];
  writeHeader(ws1, h1, 3);
  params.pagamentos.forEach((d, i) => {
    const R = 4 + i;
    fillCell(ws1, R, 1, d.numeroDocumento);
    fillCell(ws1, R, 2, d.tipoDescricao);
    fillCell(ws1, R, 3, fmtCompetencia(d.periodoApuracao), { align: { horizontal: "center" } });
    fillCell(ws1, R, 4, d.dataVencimento.toISOString().slice(0, 10));
    fillCell(ws1, R, 5, d.dataArrecadacao.toISOString().slice(0, 10));
    fillCell(ws1, R, 6, d.codigoReceitaPrincipal, { align: { horizontal: "center" } });
    fillCell(ws1, R, 7, tributoDeCodigo(d.codigoReceitaPrincipal), { align: { horizontal: "center" }, font: boldFont });
    fillCell(ws1, R, 8, d.descricaoReceitaPrincipal ?? "");
    fillCell(ws1, R, 9, d.valorPrincipal, { money: true });
    fillCell(ws1, R, 10, d.valorMulta ?? 0, { money: true });
    fillCell(ws1, R, 11, d.valorJuros ?? 0, { money: true });
    fillCell(ws1, R, 12, d.valorTotal, { money: true });
  });
  ws1.autoFilter = `A3:L${3 + params.pagamentos.length}`;
  ws1.columns = [
    { width: 22 }, { width: 24 }, { width: 12 }, { width: 12 }, { width: 12 },
    { width: 10 }, { width: 12 }, { width: 40 },
    { width: 14 }, { width: 12 }, { width: 12 }, { width: 14 },
  ];

  /* ---- Aba Detalhado (uma linha por Desmembramento) ---- */
  const linhas: Array<{ p: Pagamento; d: Pagamento["desmembramentos"][number] | null }> = [];
  for (const p of params.pagamentos) {
    if (p.desmembramentos.length === 0) linhas.push({ p, d: null });
    else for (const d of p.desmembramentos) linhas.push({ p, d });
  }
  const ws2 = wb.addWorksheet("Detalhado", { views: [{ showGridLines: false, state: "frozen", ySplit: 3 }] });
  ws2.getCell("A1").value = "BASE DETALHADA — uma linha por código de receita (desmembramentos)";
  ws2.getCell("A1").font = titleFont; ws2.mergeCells("A1:L1");
  const h2 = [
    "Nº Autenticação", "Seq.", "Período Apuração", "Vencimento", "Arrecadação",
    "Cód. Receita", "Tributo (sigla)", "Descrição Receita",
    "Principal", "Multa", "Juros", "Total",
  ];
  writeHeader(ws2, h2, 3);
  linhas.forEach(({ p, d }, i) => {
    const R = 4 + i;
    const cod = d?.codigoReceita ?? p.codigoReceitaPrincipal;
    const desc = d?.descricaoReceita ?? p.descricaoReceitaPrincipal ?? "";
    const principal = d?.valorPrincipal ?? p.valorPrincipal;
    const multa = d?.valorMulta ?? p.valorMulta ?? 0;
    const juros = d?.valorJuros ?? p.valorJuros ?? 0;
    const total = d?.valorTotal ?? p.valorTotal;
    fillCell(ws2, R, 1, p.numeroDocumento);
    fillCell(ws2, R, 2, d?.sequencial ?? "-", { align: { horizontal: "center" } });
    fillCell(ws2, R, 3, fmtCompetencia(d?.periodoApuracao ?? p.periodoApuracao), { align: { horizontal: "center" } });
    fillCell(ws2, R, 4, (d?.dataVencimento ?? p.dataVencimento).toISOString().slice(0, 10));
    fillCell(ws2, R, 5, p.dataArrecadacao.toISOString().slice(0, 10));
    fillCell(ws2, R, 6, cod, { align: { horizontal: "center" } });
    fillCell(ws2, R, 7, tributoDeCodigo(cod), { align: { horizontal: "center" }, font: boldFont });
    fillCell(ws2, R, 8, desc);
    fillCell(ws2, R, 9, principal, { money: true });
    fillCell(ws2, R, 10, multa, { money: true });
    fillCell(ws2, R, 11, juros, { money: true });
    fillCell(ws2, R, 12, total, { money: true });
  });
  ws2.autoFilter = `A3:L${3 + linhas.length}`;
  ws2.columns = ws1.columns;

  /* ---- Aba Resumo por Tributo ---- */
  const porTributo = new Map<string, { qtd: number; principal: number; multa: number; juros: number; total: number }>();
  for (const { p, d } of linhas) {
    const cod = d?.codigoReceita ?? p.codigoReceitaPrincipal;
    const sigla = tributoDeCodigo(cod);
    const e = porTributo.get(sigla) ?? { qtd: 0, principal: 0, multa: 0, juros: 0, total: 0 };
    e.qtd++;
    e.principal += d?.valorPrincipal ?? p.valorPrincipal;
    e.multa += d?.valorMulta ?? p.valorMulta ?? 0;
    e.juros += d?.valorJuros ?? p.valorJuros ?? 0;
    e.total += d?.valorTotal ?? p.valorTotal;
    porTributo.set(sigla, e);
  }
  const ws3 = wb.addWorksheet("Resumo por Tributo", { views: [{ showGridLines: false, state: "frozen", ySplit: 3 }] });
  ws3.getCell("A1").value = "RESUMO POR TRIBUTO";
  ws3.getCell("A1").font = titleFont; ws3.mergeCells("A1:F1");
  writeHeader(ws3, ["Tributo (sigla)", "Qtd Linhas", "Principal", "Multa", "Juros", "Total"], 3);
  const tribs = [...porTributo.entries()].sort((a, b) => b[1].total - a[1].total);
  tribs.forEach(([sigla, info], i) => {
    const R = 4 + i;
    fillCell(ws3, R, 1, sigla, { font: boldFont, align: { horizontal: "center" } });
    fillCell(ws3, R, 2, info.qtd, { align: { horizontal: "center" } });
    fillCell(ws3, R, 3, info.principal, { money: true });
    fillCell(ws3, R, 4, info.multa, { money: true });
    fillCell(ws3, R, 5, info.juros, { money: true });
    fillCell(ws3, R, 6, info.total, { money: true });
  });
  const tR = 4 + tribs.length;
  fillCell(ws3, tR, 1, "TOTAL", { font: boldFont, fill: fillTot });
  fillCell(ws3, tR, 2, tribs.reduce((s, [, t]) => s + t.qtd, 0), { font: boldFont, fill: fillTot, align: { horizontal: "center" } });
  fillCell(ws3, tR, 3, totalPrincipal, { money: true, font: boldFont, fill: fillTot });
  fillCell(ws3, tR, 4, totalMulta, { money: true, font: boldFont, fill: fillTot });
  fillCell(ws3, tR, 5, totalJuros, { money: true, font: boldFont, fill: fillTot });
  fillCell(ws3, tR, 6, totalGeral, { money: true, font: boldFont, fill: fillTot });
  ws3.columns = [{ width: 18 }, { width: 12 }, { width: 16 }, { width: 14 }, { width: 14 }, { width: 16 }];

  /* ---- Aba Resumo por Competência ---- */
  const porComp = new Map<string, { qtd: number; total: number; tributos: Set<string> }>();
  for (const { p, d } of linhas) {
    const comp = fmtCompetencia(d?.periodoApuracao ?? p.periodoApuracao);
    const cod = d?.codigoReceita ?? p.codigoReceitaPrincipal;
    const e = porComp.get(comp) ?? { qtd: 0, total: 0, tributos: new Set<string>() };
    e.qtd++;
    e.total += d?.valorTotal ?? p.valorTotal;
    e.tributos.add(tributoDeCodigo(cod));
    porComp.set(comp, e);
  }
  const ws4 = wb.addWorksheet("Resumo por Competência", { views: [{ showGridLines: false, state: "frozen", ySplit: 3 }] });
  ws4.getCell("A1").value = "RESUMO POR COMPETÊNCIA";
  ws4.getCell("A1").font = titleFont; ws4.mergeCells("A1:D1");
  writeHeader(ws4, ["Competência", "Qtd Linhas", "Tributos", "Total Pago"], 3);
  const comps = [...porComp.entries()].sort(([a], [b]) => {
    const [ma, ya] = a.split("/"), [mb, yb] = b.split("/");
    return (ya + ma).localeCompare(yb + mb);
  });
  comps.forEach(([comp, info], i) => {
    const R = 4 + i;
    fillCell(ws4, R, 1, comp, { align: { horizontal: "center" } });
    fillCell(ws4, R, 2, info.qtd, { align: { horizontal: "center" } });
    fillCell(ws4, R, 3, [...info.tributos].sort().join(", "));
    fillCell(ws4, R, 4, info.total, { money: true });
  });
  ws4.columns = [{ width: 14 }, { width: 12 }, { width: 50 }, { width: 16 }];

  const arrayBuffer = await wb.xlsx.writeBuffer();
  return Buffer.from(arrayBuffer);
}
