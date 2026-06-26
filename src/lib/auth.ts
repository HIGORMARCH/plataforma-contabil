/**
 * Autenticação e sessão.
 * Sessão assinada com JWT (jose) e guardada em cookie httpOnly.
 * Leitura em Server Components; gravação apenas em Server Actions / Route Handlers.
 */

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SignJWT, jwtVerify } from "jose";
import bcrypt from "bcryptjs";
import { prisma } from "./db";

export type Papel = "ADMIN" | "CONTADOR" | "ANALISTA" | "CLIENTE";

export interface Sessao {
  userId: string;
  nome: string;
  email: string;
  papel: Papel;
  escritorioId: string;
  clienteId?: string | null;
}

const COOKIE = "sessao";
const segredo = () =>
  new TextEncoder().encode(process.env.AUTH_SECRET || "dev-secret-trocar-em-producao");

export async function criarSessao(s: Sessao) {
  const token = await new SignJWT({ ...s })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("30d")
    .sign(segredo());

  const jar = await cookies();
  jar.set(COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    // Sistema interno acessado por HTTP (localhost e IP da LAN, ex.: de casa).
    // Cookie Secure só seria enviado em HTTPS, o que impediria o login pela rede.
    secure: false,
    path: "/",
    maxAge: 60 * 60 * 24 * 30, // 30 dias
  });
}

export async function encerrarSessao() {
  const jar = await cookies();
  jar.delete(COOKIE);
}

export async function getSessao(): Promise<Sessao | null> {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, segredo());
    return payload as unknown as Sessao;
  } catch {
    return null;
  }
}

/** Exige sessão válida; redireciona ao login se ausente. */
export async function requireSessao(): Promise<Sessao> {
  const s = await getSessao();
  if (!s) redirect("/login");
  return s;
}

/** Exige um dos papéis informados; caso contrário, vai para o painel. */
export async function requirePapel(papeis: Papel[]): Promise<Sessao> {
  const s = await requireSessao();
  if (!papeis.includes(s.papel)) redirect("/painel");
  return s;
}

export async function autenticar(email: string, senha: string): Promise<Sessao | null> {
  const u = await prisma.usuario.findUnique({ where: { email: email.toLowerCase().trim() } });
  if (!u || !u.ativo) return null;
  const ok = await bcrypt.compare(senha, u.senhaHash);
  if (!ok) return null;
  await prisma.logAcesso.create({
    data: { acao: "LOGIN", detalhe: `Login de ${u.email}`, usuarioId: u.id },
  });
  return {
    userId: u.id,
    nome: u.nome,
    email: u.email,
    papel: u.papel as Papel,
    escritorioId: u.escritorioId,
    clienteId: u.clienteId,
  };
}

export const ROTULO_PAPEL: Record<Papel, string> = {
  ADMIN: "Administrador do Escritório",
  CONTADOR: "Contador Responsável",
  ANALISTA: "Analista Contábil",
  CLIENTE: "Cliente",
};

/** Papéis internos do escritório (acesso à gestão). */
export const PAPEIS_INTERNOS: Papel[] = ["ADMIN", "CONTADOR", "ANALISTA"];
