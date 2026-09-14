"use server";

import { revalidatePath } from "next/cache";
import { requireSessao, PAPEIS_INTERNOS } from "@/lib/auth";
import { importarSpedEcf, type FonteEcf } from "@/lib/ecf/importar";
import { varrerPastaEcf } from "@/lib/ecf/varrerPasta";
import { prisma } from "@/lib/db";

function fonteDo(fd: FormData): FonteEcf {
  return String(fd.get("fonte") ?? "") === "DOMINIO" ? "DOMINIO" : "TRANSMITIDO";
}

export async function uploadEcfAction(
  fd: FormData,
): Promise<{ ok: true; mensagem: string; ano?: number } | { ok: false; erro: string }> {
  try {
    const sessao = await requireSessao();
    if (!PAPEIS_INTERNOS.includes(sessao.papel)) return { ok: false, erro: "Não autorizado" };

    const clienteId = String(fd.get("clienteId") ?? "");
    const file = fd.get("file") as File | null;
    if (!clienteId || !file) return { ok: false, erro: "Faltam dados." };
    if (file.size === 0) return { ok: false, erro: "Arquivo vazio." };
    if (file.size > 500 * 1024 * 1024)
      return { ok: false, erro: "Arquivo > 500MB — ECF costuma ser menor." };

    const bytes = Buffer.from(await file.arrayBuffer());
    const primeiros = bytes.subarray(0, 3);
    const isUtf8 = primeiros[0] === 0xef && primeiros[1] === 0xbb && primeiros[2] === 0xbf;
    const conteudo = isUtf8 ? bytes.toString("utf8").slice(1) : bytes.toString("latin1");

    const r = await importarSpedEcf({
      clienteId,
      nomeArquivo: file.name,
      conteudo,
      fonte: fonteDo(fd),
      origem: "UPLOAD",
      importadoPor: sessao.userId,
    });
    if (!r.ok) return { ok: false, erro: r.mensagem };

    revalidatePath(`/painel/clientes/${clienteId}/irpj-csll`);
    return { ok: true, mensagem: r.mensagem, ano: r.ano };
  } catch (e) {
    return { ok: false, erro: (e as Error).message };
  }
}

export async function varrerPastaEcfAction(
  fd: FormData,
): Promise<
  | { ok: true; resumo: string; detalhes: Array<{ arquivo: string; ano?: number; acao: string }> }
  | { ok: false; erro: string }
> {
  try {
    const sessao = await requireSessao();
    if (!PAPEIS_INTERNOS.includes(sessao.papel)) return { ok: false, erro: "Não autorizado" };

    const clienteId = String(fd.get("clienteId") ?? "");
    const pastaOverride = String(fd.get("pasta") ?? "").trim();
    const fonte = fonteDo(fd);
    if (!clienteId) return { ok: false, erro: "Falta clienteId." };

    let pasta = pastaOverride;
    if (!pasta) {
      const c = await prisma.cliente.findUnique({
        where: { id: clienteId },
        select: { pastaFiscal: true, pastaSpedEcf: true, pastaDominioEcf: true },
      });
      pasta = fonte === "DOMINIO" ? c?.pastaDominioEcf || "" : c?.pastaSpedEcf || c?.pastaFiscal || "";
    }
    if (!pasta) {
      return {
        ok: false,
        erro:
          fonte === "DOMINIO"
            ? "Nenhuma pasta informada e o cliente não tem a pasta da ECF do Domínio cadastrada."
            : "Nenhuma pasta informada e o cliente não tem a pasta da ECF transmitida cadastrada.",
      };
    }

    const res = await varrerPastaEcf({ clienteId, pasta, usuarioId: sessao.userId, fonte });
    revalidatePath(`/painel/clientes/${clienteId}/irpj-csll`);

    const resumo =
      `${res.arquivosVistos} arquivo(s) verificado(s) · ` +
      `${res.importadosNovos} novo(s) · ${res.substituidos} substituído(s) · ` +
      `${res.ignoradosJaImportados} já importado(s) · ` +
      `${res.ignoradosCnpjDiferente} de outro CNPJ · ` +
      `${res.ignoradosNaoEcf} não-ECF · ${res.falhas.length} falha(s)` +
      (res.falhas.length ? " — veja os detalhes por arquivo" : "");

    return { ok: true, resumo, detalhes: res.detalhes };
  } catch (e) {
    return { ok: false, erro: (e as Error).message };
  }
}
