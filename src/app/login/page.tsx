"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { loginAction } from "./actions";

function Entrar() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn btn-primary w-full" disabled={pending}>
      {pending ? "Entrando..." : "Entrar"}
    </button>
  );
}

export default function LoginPage() {
  const [state, action] = useActionState(loginAction, {});

  return (
    <div className="flex flex-1 items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-xl bg-[var(--brand)] text-2xl font-bold text-white">
            ◇
          </div>
          <h1 className="text-xl font-bold text-slate-800">Plataforma Contábil</h1>
          <p className="text-sm text-slate-500">
            Análise de demonstrativos e relatórios técnicos
          </p>
        </div>

        <form action={action} className="card space-y-4 p-6">
          {state?.erro && (
            <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
              {state.erro}
            </div>
          )}
          <div>
            <label className="label" htmlFor="email">
              E-mail
            </label>
            <input id="email" name="email" type="email" className="input" autoComplete="username" required />
          </div>
          <div>
            <label className="label" htmlFor="senha">
              Senha
            </label>
            <input id="senha" name="senha" type="password" className="input" autoComplete="current-password" required />
          </div>
          <Entrar />
        </form>

        <div className="card mt-4 p-4 text-xs text-slate-600">
          <p className="mb-2 font-semibold text-slate-700">Acessos de demonstração:</p>
          <ul className="space-y-1">
            <li>👤 <b>Admin:</b> admin@marchcontabilidade.com.br / admin123</li>
            <li>📊 <b>Contador:</b> contador@marchcontabilidade.com.br / contador123</li>
            <li>🗂️ <b>Analista:</b> analista@marchcontabilidade.com.br / analista123</li>
            <li>🏢 <b>Cliente:</b> cliente@lojamodelo.com.br / cliente123</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
