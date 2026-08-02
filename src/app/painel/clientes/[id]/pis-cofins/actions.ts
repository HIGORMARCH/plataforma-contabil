"use server";

import { revalidatePath } from "next/cache";
import { requireSessao, PAPEIS_INTERNOS } from "@/lib/auth";
import { importarSpedContribuicoes } from "@/lib/sped-contribuicoes/importar";
import { varrerPastaSpedContribuicoes } from "@/lib/sped-contribuicoes/varrerPasta";
import { sincronizarDctfWeb } from "@/lib/serpro/dctfweb";
import { prisma } from "@/lib/db";

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

export async function varrerPastaSpedAction(
  fd: FormData,
): Promise<
  | { ok: true; resumo: string; detalhes: Array<{ arquivo: string; periodo?: string; acao: string }> }
  | { ok: false; erro: string }
> {
  try {
    const sessao = await requireSessao();
    if (!PAPEIS_INTERNOS.includes(sessao.papel)) return { ok: false, erro: "Não autorizado" };

    const clienteId = String(fd.get("clienteId") ?? "");
    const pastaOverride = String(fd.get("pasta") ?? "").trim();
    if (!clienteId) return { ok: false, erro: "Falta clienteId." };

    // Usa a pasta do form (se preenchida) ou a pastaFiscal cadastrada no cliente.
    let pasta = pastaOverride;
    if (!pasta) {
      const c = await prisma.cliente.findUnique({
        where: { id: clienteId },
        select: { pastaFiscal: true },
      });
      pasta = c?.pastaFiscal ?? "";
    }
    if (!pasta) {
      return {
        ok: false,
        erro:
          "Nenhuma pasta informada e o cliente não tem pastaFiscal cadastrada. Preencha o campo ou cadastre no editar cliente.",
      };
    }

    const res = await varrerPastaSpedContribuicoes({
      clienteId,
      pasta,
      usuarioId: sessao.userId,
    });

    revalidatePath(`/painel/clientes/${clienteId}/pis-cofins`);

    const resumo =
      `${res.arquivosVistos} arquivo(s) verificado(s) · ` +
      `${res.importadosNovos} novo(s) · ${res.substituidos} substituído(s) · ` +
      `${res.ignoradosJaImportados} já importado(s) · ` +
      `${res.ignoradosCnpjDiferente} de outro CNPJ · ` +
      `${res.ignoradosNaoSped} não-SPED · ${res.falhas.length} falha(s)`;

    return { ok: true, resumo, detalhes: res.detalhes };
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
