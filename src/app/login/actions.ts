"use server";

import { redirect } from "next/navigation";
import { autenticar, criarSessao } from "@/lib/auth";

export async function loginAction(_prev: unknown, formData: FormData): Promise<{ erro?: string }> {
  const email = String(formData.get("email") ?? "");
  const senha = String(formData.get("senha") ?? "");
  if (!email || !senha) return { erro: "Informe e-mail e senha." };

  const sessao = await autenticar(email, senha);
  if (!sessao) return { erro: "E-mail ou senha inválidos." };

  await criarSessao(sessao);
  redirect("/painel");
}
