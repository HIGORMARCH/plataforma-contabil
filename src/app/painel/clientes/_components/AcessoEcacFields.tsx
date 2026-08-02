"use client";

import { useState } from "react";
import { CertificadoUpload } from "./CertificadoUpload";

/**
 * Fieldset condicional para configurar o acesso e-CAC (SERPRO).
 *
 * PROCURACAO_MARCH (padrão): usa o certificado do escritório + procuração
 *   eletrônica ativa em nome do cliente no e-CAC. Nenhum campo extra.
 * CERTIFICADO_PROPRIO: o cliente tem cert próprio — sobe o .pfx via
 *   <CertificadoUpload> (o .pfx é cifrado e armazenado no banco; runtime
 *   descifra em arquivo temp quando o SERPRO client precisa).
 *
 * Ver src/lib/crypto.ts (cifrarBytes), src/lib/certificados/runtime.ts
 * e memória seguranca-certificados-plataforma.md.
 */
export function AcessoEcacFields({
  metodoInicial = "PROCURACAO_MARCH",
  clienteId,
  razaoSocial,
  temCertificado = false,
  nomeArquivoAtual = null,
  validadeAtual = null,
}: {
  metodoInicial?: string;
  clienteId?: string;         // undefined no cadastro novo (cliente ainda não existe)
  razaoSocial?: string;
  temCertificado?: boolean;
  nomeArquivoAtual?: string | null;
  validadeAtual?: Date | null;
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

      <div className="grid gap-4">
        <div>
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
              Certificado próprio do cliente (upload do .pfx)
            </option>
          </select>
          <p className="mt-2 text-xs text-slate-500">
            {metodo === "PROCURACAO_MARCH" ? (
              <>
                O escritório usa <strong>o próprio certificado A1</strong> e a{" "}
                <strong>procuração eletrônica ativa no e-CAC</strong> desse contribuinte.
                Nenhum arquivo é armazenado no cliente.
              </>
            ) : (
              <>
                O cliente tem contrato SERPRO próprio ou fornecerá o certificado A1 dele.
                <strong> O .pfx é INSTALADO NA PLATAFORMA</strong> (cifrado em AES-256-GCM no
                banco). Fica portável (funciona em qualquer servidor) e não depende de path
                Z:\ ou pen drive. Runtime descifra em arquivo temp na hora de usar e apaga
                em seguida.
              </>
            )}
          </p>
        </div>

        {proprio && clienteId && razaoSocial && (
          <CertificadoUpload
            clienteId={clienteId}
            razaoSocial={razaoSocial}
            temCertificado={temCertificado}
            nomeArquivoAtual={nomeArquivoAtual}
            validadeAtual={validadeAtual}
          />
        )}

        {proprio && !clienteId && (
          <div className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-800">
            💡 Salve o cadastro primeiro. Depois abra a tela de edição pra fazer o upload do
            certificado (.pfx + senha).
          </div>
        )}
      </div>
    </section>
  );
}
