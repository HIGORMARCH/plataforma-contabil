"use client";

import { useState } from "react";

/**
 * Fieldset condicional para configurar o acesso e-CAC (SERPRO).
 *
 * PROCURACAO_MARCH (padrão): usa o certificado do escritório + procuração
 *   eletrônica ativa em nome do cliente no e-CAC. Nenhum campo extra.
 * CERTIFICADO_PROPRIO: o cliente tem contrato SERPRO / cert próprio. Precisa
 *   informar path do .pfx no filesystem + senha (cifrada em repouso).
 *
 * A plataforma NÃO armazena o arquivo do certificado — só o caminho e a senha
 * cifrada. Ver src/lib/crypto.ts e memória seguranca-certificados-plataforma.md.
 */
export function AcessoEcacFields({
  metodoInicial = "PROCURACAO_MARCH",
  caminhoInicial = "",
}: {
  metodoInicial?: string;
  caminhoInicial?: string;
}) {
  const [metodo, setMetodo] = useState<string>(metodoInicial);
  const proprio = metodo === "CERTIFICADO_PROPRIO";

  return (
    <section className="card p-5">
      <h2 className="mb-1 text-sm font-bold uppercase tracking-wide text-slate-500">
        Acesso ao e-CAC (Auditoria Tributária)
      </h2>
      <p className="mb-4 text-xs text-slate-500">
        Como a plataforma vai consultar os pagamentos e-CAC (SERPRO PAGTOWEB) em nome desse cliente.
      </p>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="md:col-span-2">
          <label className="label" htmlFor="metodoAcessoEcac">Método de acesso</label>
          <select
            id="metodoAcessoEcac"
            name="metodoAcessoEcac"
            className="input"
            value={metodo}
            onChange={(e) => setMetodo(e.target.value)}
          >
            <option value="PROCURACAO_MARCH">
              Procuração eletrônica do escritório (padrão)
            </option>
            <option value="CERTIFICADO_PROPRIO">
              Certificado próprio do cliente
            </option>
          </select>
          <p className="mt-2 text-xs text-slate-500">
            {metodo === "PROCURACAO_MARCH" ? (
              <>
                O escritório usa <strong>o próprio certificado A1</strong> e a{" "}
                <strong>procuração eletrônica ativa no e-CAC</strong> desse contribuinte.
                Nenhum dado adicional é necessário.
              </>
            ) : (
              <>
                O cliente tem contrato SERPRO próprio ou fornecerá o certificado A1 dele.
                A plataforma <strong>não armazena o arquivo .pfx</strong> — só o caminho e a
                senha cifrada. Se o path ficar inacessível (pen drive removido, rede fora),
                a sincronização falha graciosamente e o log registra o motivo.
              </>
            )}
          </p>
        </div>

        {proprio && (
          <>
            <div className="md:col-span-2">
              <label className="label" htmlFor="certificadoCaminho">
                Caminho do certificado (.pfx) <span className="text-red-500">*</span>
              </label>
              <input
                id="certificadoCaminho"
                name="certificadoCaminho"
                className="input font-mono text-xs"
                placeholder={`Z:\\CERTIFICADOS\\CLIENTE X senha ... VENC DD.MM.AAAA.pfx`}
                required={proprio}
                defaultValue={caminhoInicial}
              />
              <p className="mt-1 text-[11px] text-slate-500">
                Path absoluto no filesystem do escritório. Ex.: pasta de rede, pen drive, HD local.
              </p>
            </div>
            <div className="md:col-span-2">
              <label className="label" htmlFor="certificadoSenha">
                Senha do certificado <span className="text-red-500">*</span>
              </label>
              <input
                id="certificadoSenha"
                name="certificadoSenha"
                type="password"
                className="input"
                autoComplete="new-password"
                required={proprio}
              />
              <p className="mt-1 text-[11px] text-slate-500">
                Cifrada em AES-256-GCM antes de gravar no banco. Nunca aparece em texto claro
                em nenhum log ou export.
              </p>
            </div>
          </>
        )}
      </div>
    </section>
  );
}
