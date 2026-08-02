"use server";

import { revalidatePath } from "next/cache";
import { requireSessao, PAPEIS_INTERNOS } from "@/lib/auth";
import { importarSpedContribuicoes } from "@/lib/sped-contribuicoes/importar";
import { sincronizarDctfWeb } from "@/lib/serpro/dctfweb";

export async function uploadSpedContribAction(
  fd: FormData,
): Promise<{ ok: true; mensagem: string; periodo?: string } | { ok: false; erro: string }> {
  try {
    const sessao = await requireSessao();
    if (!PAPEIS_INTERNOS.includes(sessao.papel)) return { ok: false, erro: "Não autorizado" };

    const clienteId = String(fd.get("clienteId") ?? "");
    const file = fd.get("file") as File | null;
    if (!clienteId || !file) return { ok: false, erro: "Faltam dados." };
    if (file.size === 0) return { ok: false, erro: "Arquivo vazio." };
    if (file.size > 200 * 1024 * 1024)
      return { ok: false, erro: "Arquivo > 200MB — SPED-Contribuições costuma ser menor." };

    // SPED costuma ser latin1/CP1252 — mas a maioria dos parsers usa string, então
    // decodificamos como latin1 (BR-safe) pra não perder acentos.
    const bytes = Buffer.from(await file.arrayBuffer());
    // Tenta detectar BOM UTF-8; senão latin1 é o padrão brasileiro
    const primeirosBytes = bytes.subarray(0, 3);
    const isUtf8 =
      primeirosBytes[0] === 0xef && primeirosBytes[1] === 0xbb && primeirosBytes[2] === 0xbf;
    const conteudo = isUtf8 ? bytes.toString("utf8").slice(1) : bytes.toString("latin1");

    const r = await importarSpedContribuicoes({
      clienteId,
      nomeArquivo: file.name,
      conteudo,
      origem: "UPLOAD",
      importadoPor: sessao.userId,
    });

    if (!r.ok) return { ok: false, erro: r.mensagem };

    revalidatePath(`/painel/clientes/${clienteId}/pis-cofins`);
    return {
      ok: true,
      mensagem: r.mensagem,
      periodo: r.periodoApuracao?.toLocaleDateString("pt-BR"),
    };
  } catch (e) {
    return { ok: false, erro: (e as Error).message };
  }
}

export async function sincronizarDctfWebAction(
  fd: FormData,
): Promise<{ ok: boolean; mensagem: string; declaracoes?: number }> {
  try {
    const sessao = await requireSessao();
    if (!PAPEIS_INTERNOS.includes(sessao.papel))
      return { ok: false, mensagem: "Não autorizado" };

    const clienteId = String(fd.get("clienteId") ?? "");
    const anoStr = String(fd.get("ano") ?? "");
    const ano = Number(anoStr);
    if (!clienteId || !ano) return { ok: false, mensagem: "Faltam clienteId ou ano." };

    const periodoInicial = new Date(ano, 0, 1);
    const periodoFinal = new Date(ano, 11, 31);

    const r = await sincronizarDctfWeb({
      clienteId,
      periodoInicial,
      periodoFinal,
      usuarioId: sessao.userId,
    });

    revalidatePath(`/painel/clientes/${clienteId}/pis-cofins`);
    return {
      ok: r.ok,
      mensagem: r.erro ?? `${r.declaracoes} declaração(ões) sincronizada(s).`,
      declaracoes: r.declaracoes,
    };
  } catch (e) {
    return { ok: false, mensagem: (e as Error).message };
  }
}
