"use client";

/**
 * Fieldset para configurar o acesso ao Portal da SEFAZ-TO (GIAM).
 *
 * Login por Inscrição Estadual (campo já capturado na seção "Identificação") +
 * SENHA. Não é certificado digital — é a mesma senha que o contribuinte usa
 * no giam.sefaz.to.gov.br pra consultar declarações entregues.
 *
 * A senha é cifrada AES-256-GCM antes de gravar no banco (ver src/lib/crypto.ts).
 * Nunca volta pra tela nem aparece em log — se já estiver cadastrada, o campo
 * mostra apenas o aviso "•••••• cadastrada" e permite substituir por uma nova.
 *
 * Usada pelo robô que raspa a ConsGIAM.Asp e (no futuro) pelo módulo que baixa
 * DARE no Portal do Contribuinte.
 *
 * As pastas de arquivos ficam em PastasLocaisFields.
 */
export function AcessoSefazFields({
  inscricaoEstadualInicial = "",
  jaCadastrada = false,
}: {
  inscricaoEstadualInicial?: string;
  jaCadastrada?: boolean;
}) {
  return (
    <section className="card p-5">
      <h2 className="mb-1 text-sm font-bold uppercase tracking-wide text-slate-500">
        Acesso ao Portal da SEFAZ-TO (GIAM)
      </h2>
      <p className="mb-4 text-xs text-slate-500">
        Credenciais que a plataforma vai usar pra consultar as declarações da GIAM em nome
        desse cliente: Inscrição Estadual + senha do portal.
      </p>

      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <label className="label" htmlFor="inscricaoEstadual">
            Inscrição Estadual
          </label>
          <input
            id="inscricaoEstadual"
            name="inscricaoEstadual"
            className="input"
            defaultValue={inscricaoEstadualInicial}
            placeholder="00.000.000-0"
          />
          <p className="mt-1 text-[11px] text-slate-500">
            Usada como usuário no login do portal SEFAZ.
          </p>
        </div>
        <div>
          <label className="label" htmlFor="senhaSefaz">
            Senha do portal SEFAZ-TO
            {jaCadastrada && (
              <span className="ml-2 text-xs font-normal text-emerald-700">
                •••••• já cadastrada
              </span>
            )}
          </label>
          <input
            id="senhaSefaz"
            name="senhaSefaz"
            type="password"
            className="input"
            autoComplete="new-password"
            placeholder={jaCadastrada ? "Em branco = manter" : "Digite a senha do portal"}
          />
          <p className="mt-1 text-[11px] text-slate-500">
            Cifrada em AES-256-GCM antes de gravar. Nunca aparece em texto claro
            em log, exportação ou tela.
          </p>
        </div>
      </div>
    </section>
  );
}
