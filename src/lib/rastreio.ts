/**
 * Rastreamento de relatórios: registra cada abertura/download do link
 * rastreável, com IP, dispositivo e data — inclusive de quem recebeu por
 * encaminhamento (cada abertura do link é registrada separadamente).
 */

import crypto from "node:crypto";
import { headers } from "next/headers";
import { prisma } from "./db";

export function gerarToken(): string {
  return crypto.randomBytes(16).toString("hex");
}

/** Resumo legível do dispositivo a partir do User-Agent. */
export function resumoDispositivo(ua: string | null | undefined): string {
  if (!ua) return "Dispositivo desconhecido";
  const so = /Windows/i.test(ua)
    ? "Windows"
    : /Android/i.test(ua)
      ? "Android"
      : /iPhone|iPad|iPod|iOS/i.test(ua)
        ? "iOS"
        : /Mac OS X|Macintosh/i.test(ua)
          ? "macOS"
          : /Linux/i.test(ua)
            ? "Linux"
            : "outro sistema";
  const nav = /Edg\//i.test(ua)
    ? "Edge"
    : /OPR\/|Opera/i.test(ua)
      ? "Opera"
      : /Chrome\//i.test(ua)
        ? "Chrome"
        : /Firefox\//i.test(ua)
          ? "Firefox"
          : /Safari\//i.test(ua)
            ? "Safari"
            : "navegador";
  const movel = /Mobile|Android|iPhone|iPad/i.test(ua) ? " (celular/tablet)" : "";
  return `${nav} em ${so}${movel}`;
}

export async function registrarAcesso(relatorioId: string, tipo: "ABERTURA" | "DOWNLOAD") {
  try {
    const h = await headers();
    const ip =
      (h.get("x-forwarded-for")?.split(",")[0] || h.get("x-real-ip") || "").trim() || null;
    const ua = h.get("user-agent");
    const referer = h.get("referer");
    await prisma.acessoRelatorio.create({
      data: {
        relatorioId,
        tipo,
        ip,
        userAgent: ua ?? undefined,
        dispositivo: resumoDispositivo(ua),
        referer: referer ?? undefined,
      },
    });
  } catch {
    // O registro de rastreio nunca deve quebrar a entrega do documento.
  }
}
