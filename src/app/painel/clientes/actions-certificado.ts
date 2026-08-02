"use server";

import { readFile } from "node:fs/promises";
import { prisma } from "@/lib/db";
import { requireSessao, PAPEIS_INTERNOS } from "@/lib/auth";
import { cifrar, cifrarBytes } from "@/lib/crypto";
import { revalidatePath } from "next/cache";
import { escanearPasta, similaridade } from "@/lib/certificados/scanner";

/**
 * Extrai a data de validade (VENC dd.mm.aaaa) do nome do arquivo, se seguir
 * o padrão March. Retorna null se não bater.
 */
function extrairValidadeDoNome(nome: string): Date | null {
  const m = nome.match(/VENC(?:IDO|IMENTO)?\s+(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})/i);
  if (!m) return null;
  const dia = Number(m[1]);
  const mes = Number(m[2]) - 1;
  let ano = Number(m[3]);
  if (ano < 100) ano += 2000;
  const d = new Date(ano, mes, dia);
  return isNaN(d.getTime()) ? null : d;
}

export async function uploadCertificadoAction(
  fd: FormData,
): Promise<{ ok: true; validade?: string } | { ok: false; erro: string }> {
  try {
    const sessao = await requireSessao();
    if (!PAPEIS_INTERNOS.includes(sessao.papel)) return { ok: false, erro: "Não autorizado" };

    const clienteId = String(fd.get("clienteId") ?? "");
    const file = fd.get("file") as File | null;
    const senha = String(fd.get("senha") ?? "");
    if (!clienteId || !file || !senha) return { ok: false, erro: "Faltam dados." };
    if (file.size === 0) return { ok: false, erro: "Arquivo vazio." };
    if (file.size > 500 * 1024) return { ok: false, erro: "Arquivo > 500KB — .pfx costuma ser menor." };

    const bytes = Buffer.from(await file.arrayBuffer());
    const validade = extrairValidadeDoNome(file.name);

    await prisma.cliente.update({
      where: { id: clienteId },
      data: {
        certificadoArquivo: cifrarBytes(bytes),
        certificadoNomeArquivo: file.name,
        certificadoSenha: cifrar(senha),
        certificadoValidade: validade,
        metodoAcessoEcac: "CERTIFICADO_PROPRIO",
      },
    });

    await prisma.logAcesso.create({
      data: {
        acao: "CERTIFICADO_INSTALADO",
        detalhe: `${file.name} (${bytes.length}B)`,
        usuarioId: sessao.userId,
      },
    });

    revalidatePath(`/painel/clientes/${clienteId}`);
    return { ok: true, validade: validade?.toLocaleDateString("pt-BR") };
  } catch (e) {
    return { ok: false, erro: (e as Error).message };
  }
}

export async function detectarECapturarCertificadoAction(
  fd: FormData,
): Promise<{ ok: true; nomeArquivo: string; validade?: string } | { ok: false; erro: string }> {
  try {
    const sessao = await requireSessao();
    if (!PAPEIS_INTERNOS.includes(sessao.papel)) return { ok: false, erro: "Não autorizado" };

    const clienteId = String(fd.get("clienteId") ?? "");
    const pasta = String(fd.get("pasta") ?? "");
    if (!clienteId || !pasta) return { ok: false, erro: "Faltam clienteId ou pasta." };

    const cliente = await prisma.cliente.findUnique({
      where: { id: clienteId },
      select: { razaoSocial: true },
    });
    if (!cliente) return { ok: false, erro: "Cliente não encontrado." };

    const certs = await escanearPasta(pasta);
    let melhor = null;
    let melhorScore = 0;
    for (const c of certs) {
      const s = similaridade(cliente.razaoSocial, c.razaoSocialInferida);
      if (s > melhorScore) {
        melhorScore = s;
        melhor = c;
      }
    }
    if (!melhor || melhorScore < 0.6)
      return { ok: false, erro: "Nenhum .pfx da pasta combina com essa razão social." };
    if (!melhor.senha) {
      return {
        ok: false,
        erro: `Achei "${melhor.arquivo}" mas o nome não tem a senha embutida. Faça upload manual com a senha.`,
      };
    }

    // Lê o .pfx da pasta e faz o upload no cliente
    const bytes = await readFile(melhor.caminhoCompleto);
    await prisma.cliente.update({
      where: { id: clienteId },
      data: {
        certificadoArquivo: cifrarBytes(bytes),
        certificadoNomeArquivo: melhor.arquivo,
        certificadoSenha: cifrar(melhor.senha),
        certificadoValidade: melhor.validadeDate ?? null,
        metodoAcessoEcac: "CERTIFICADO_PROPRIO",
      },
    });

    await prisma.logAcesso.create({
      data: {
        acao: "CERTIFICADO_DETECTADO_DA_PASTA",
        detalhe: `${melhor.arquivo} (${bytes.length}B, match ${(melhorScore * 100).toFixed(0)}%)`,
        usuarioId: sessao.userId,
      },
    });

    revalidatePath(`/painel/clientes/${clienteId}`);
    return {
      ok: true,
      nomeArquivo: melhor.arquivo,
      validade: melhor.validadeDate?.toLocaleDateString("pt-BR"),
    };
  } catch (e) {
    return { ok: false, erro: (e as Error).message };
  }
}

export async function removerCertificadoAction(
  fd: FormData,
): Promise<{ ok: true } | { ok: false; erro: string }> {
  try {
    const sessao = await requireSessao();
    if (!PAPEIS_INTERNOS.includes(sessao.papel)) return { ok: false, erro: "Não autorizado" };
    const clienteId = String(fd.get("clienteId") ?? "");
    if (!clienteId) return { ok: false, erro: "Falta clienteId." };

    await prisma.cliente.update({
      where: { id: clienteId },
      data: {
        certificadoArquivo: null,
        certificadoNomeArquivo: null,
        certificadoSenha: null,
        certificadoValidade: null,
      },
    });

    await prisma.logAcesso.create({
      data: { acao: "CERTIFICADO_REMOVIDO", detalhe: clienteId, usuarioId: sessao.userId },
    });

    revalidatePath(`/painel/clientes/${clienteId}`);
    return { ok: true };
  } catch (e) {
    return { ok: false, erro: (e as Error).message };
  }
}
