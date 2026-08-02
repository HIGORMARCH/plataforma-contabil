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

const PASTA_PADRAO_PJ = "Z:\\MARCH - CERTIFICADOS DIGITAIS\\PJ";

export function AcessoEcacFields({
  metodoInicial = "PROCURACAO_MARCH",
  caminhoInicial = "",
}: {
  metodoInicial?: string;
  caminhoInicial?: string;
}) {
  const [metodo, setMetodo] = useState<string>(metodoInicial);
  const [detEstado, setDetEstado] = useState<"idle" | "buscando" | "ok" | "erro">("idle");
  const [detMsg, setDetMsg] = useState<string>("");
  const proprio = metodo === "CERTIFICADO_PROPRIO";

  async function detectar() {
    const razaoEl = document.getElementById("razaoSocial") as HTMLInputElement | null;
    const razaoSocial = razaoEl?.value?.trim() || "";
    if (!razaoSocial) {
      setDetEstado("erro");
      setDetMsg("Preencha a razão social primeiro (busca o CNPJ na Receita ou digite).");
      return;
    }
    const caminhoEl = document.getElementById("certificadoCaminho") as HTMLInputElement | null;
    const senhaEl = document.getElementById("certificadoSenha") as HTMLInputElement | null;
    const validadeEl = document.getElementById("certificadoValidade") as HTMLInputElement | null;
    const caminhoAtual = caminhoEl?.value?.trim() ?? "";
    // Se ja tem path .pfx, usa a pasta pai. Se so tem uma pasta, usa ela. Senao usa padrao.
    let pasta = PASTA_PADRAO_PJ;
    if (caminhoAtual.toLowerCase().endsWith(".pfx")) {
      const idx = Math.max(caminhoAtual.lastIndexOf("\\"), caminhoAtual.lastIndexOf("/"));
      if (idx > 0) pasta = caminhoAtual.substring(0, idx);
    } else if (caminhoAtual) {
      pasta = caminhoAtual;
    }
    setDetEstado("buscando");
    setDetMsg(`Procurando .pfx pra "${razaoSocial}" em ${pasta} ...`);
    try {
      const r = await fetch(
        `/api/certificados/detectar?pasta=${encodeURIComponent(pasta)}&razaoSocial=${encodeURIComponent(razaoSocial)}`,
      );
      const data = await r.json();
      if (!r.ok || !data.ok) {
        setDetEstado("erro");
        setDetMsg(data.erro || "Não encontrei um .pfx que combine com essa razão social.");
        return;
      }
      if (caminhoEl) {
        caminhoEl.value = data.cert.caminhoCompleto;
        caminhoEl.classList.add("ring-2", "ring-[var(--brand-2)]");
      }
      if (senhaEl && data.cert.senha) {
        senhaEl.value = data.cert.senha;
        senhaEl.classList.add("ring-2", "ring-[var(--brand-2)]");
      }
      if (validadeEl && data.cert.validade) {
        validadeEl.value = data.cert.validade;
      }
      setDetEstado("ok");
      setDetMsg(
        `Encontrado: "${data.cert.razaoSocialInferida}"` +
          (data.cert.validade ? ` — vence ${data.cert.validade}` : "") +
          (data.cert.senha ? " · senha detectada do nome do arquivo" : " · sem senha no nome — preencha manualmente"),
      );
    } catch (e) {
      setDetEstado("erro");
      setDetMsg(`Erro: ${(e as Error).message}`);
    }
  }

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
              <div className="mb-2 flex items-center justify-between gap-2">
                <label className="label mb-0" htmlFor="certificadoCaminho">
                  Caminho do certificado (.pfx) <span className="text-red-500">*</span>
                </label>
                <button
                  type="button"
                  onClick={detectar}
                  className="btn btn-accent text-xs whitespace-nowrap"
                  disabled={detEstado === "buscando"}
                >
                  {detEstado === "buscando" ? "Procurando..." : "🔎 Detectar da pasta"}
                </button>
              </div>
              <input
                id="certificadoCaminho"
                name="certificadoCaminho"
                className="input font-mono text-xs"
                placeholder={`Z:\\MARCH - CERTIFICADOS DIGITAIS\\PJ\\NOME senha X VENC dd.mm.aaaa.pfx`}
                required={proprio}
                defaultValue={caminhoInicial}
              />
              <p className="mt-1 text-[11px] text-slate-500">
                Path absoluto do arquivo <b>.pfx</b> (não da pasta). Clique em <b>Detectar da pasta</b> pra
                localizar automaticamente pelo padrão de nome do arquivo.
              </p>
              {detMsg && (
                <p
                  className={`mt-1 text-xs ${
                    detEstado === "erro" ? "text-red-600" : detEstado === "ok" ? "text-green-700" : "text-slate-500"
                  }`}
                >
                  {detMsg}
                </p>
              )}
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
