/**
 * Gera um arquivo Word (.doc) a partir do texto da nota técnica em Markdown.
 * Usa a técnica de "HTML disfarçado de .doc" — o Word abre corretamente,
 * preserva formatação (negrito, parágrafos, listas) e não exige biblioteca externa.
 */
import { NextResponse } from "next/server";
import { getSessao, PAPEIS_INTERNOS } from "@/lib/auth";

interface Body {
  texto: string;
  titulo?: string;
  empresa?: string;
  cnpj?: string;
  exercicio?: string;
  contador?: string;
  crc?: string;
  cidade?: string;
}

function escapeHtml(s: string): string {
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

/** Converte Markdown simples (negrito, listas com "-", parágrafos) em HTML. */
function markdownParaHtml(md: string): string {
  const linhas = md.split(/\r?\n/);
  const out: string[] = [];
  let listaAberta = false;

  for (const raw of linhas) {
    const l = raw.replace(/\s+$/g, "");
    if (!l.trim()) {
      if (listaAberta) { out.push("</ul>"); listaAberta = false; }
      continue;
    }
    const escapada = escapeHtml(l).replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
    if (/^-\s+/.test(l)) {
      if (!listaAberta) { out.push("<ul>"); listaAberta = true; }
      out.push(`<li>${escapada.replace(/^-\s+/, "")}</li>`);
    } else {
      if (listaAberta) { out.push("</ul>"); listaAberta = false; }
      out.push(`<p>${escapada}</p>`);
    }
  }
  if (listaAberta) out.push("</ul>");
  return out.join("\n");
}

export async function POST(req: Request) {
  const sessao = await getSessao();
  if (!sessao || !PAPEIS_INTERNOS.includes(sessao.papel)) {
    return NextResponse.json({ erro: "Não autorizado" }, { status: 401 });
  }

  const body = (await req.json()) as Body;
  if (!body?.texto) {
    return NextResponse.json({ erro: "texto é obrigatório" }, { status: 400 });
  }

  const corpo = markdownParaHtml(body.texto);
  const cabecalho = [
    body.empresa ? `<p><strong>Empresa:</strong> ${escapeHtml(body.empresa)}</p>` : "",
    body.cnpj ? `<p><strong>CNPJ:</strong> ${escapeHtml(body.cnpj)}</p>` : "",
    body.exercicio ? `<p><strong>Exercício analisado:</strong> ${escapeHtml(body.exercicio)}</p>` : "",
  ].filter(Boolean).join("\n");

  const assinatura = body.contador
    ? `
        <p style="margin-top: 60px;">${escapeHtml(body.cidade ?? "Palmas — TO")}, ${new Date().toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" })}.</p>
        <p style="margin-top: 40px;">________________________________________</p>
        <p><strong>${escapeHtml(body.contador)}</strong></p>
        ${body.crc ? `<p>Contador — CRC ${escapeHtml(body.crc)}</p>` : ""}
      `
    : "";

  const html = `<!DOCTYPE html>
<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40">
<head>
<meta charset="utf-8">
<title>${escapeHtml(body.titulo ?? "Nota Técnica")}</title>
<xml><w:WordDocument><w:View>Print</w:View><w:Zoom>100</w:Zoom></w:WordDocument></xml>
<style>
  @page { size: A4; margin: 3cm 2cm 2cm 3cm; }
  body { font-family: "Arial", sans-serif; font-size: 12pt; line-height: 1.5; color: #000; }
  h1 { font-size: 14pt; text-align: center; margin-bottom: 24px; }
  p { margin: 6pt 0; text-align: justify; }
  ul { margin: 6pt 0 6pt 24px; padding: 0; }
  li { margin: 3pt 0; }
  strong { font-weight: bold; }
</style>
</head>
<body>
<h1>${escapeHtml(body.titulo ?? "NOTA TÉCNICA CONTEXTUAL")}</h1>
${cabecalho}
${corpo}
${assinatura}
</body>
</html>`;

  const filename = `nota-tecnica-${(body.empresa ?? "documento").replace(/[^\w-]+/g, "_").slice(0, 40)}-${new Date().toISOString().slice(0, 10)}.doc`;

  return new Response(html, {
    headers: {
      "Content-Type": "application/msword; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
