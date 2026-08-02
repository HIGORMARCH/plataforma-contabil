"use client";

import { useState, useTransition, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  uploadCertificadoAction,
  detectarECapturarCertificadoAction,
  removerCertificadoAction,
} from "../actions-certificado";

interface Props {
  clienteId: string;
  razaoSocial: string;
  temCertificado: boolean;
  nomeArquivoAtual?: string | null;
  validadeAtual?: Date | null;
}

const PASTA_PADRAO_PJ = "Z:\\MARCH - CERTIFICADOS DIGITAIS\\PJ";

export function CertificadoUpload({
  clienteId,
  razaoSocial,
  temCertificado,
  nomeArquivoAtual,
  validadeAtual,
}: Props) {
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<{ tipo: "ok" | "erro" | "info"; texto: string } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const senhaRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  function upload() {
    const file = fileRef.current?.files?.[0];
    const senha = senhaRef.current?.value ?? "";
    if (!file) return setMsg({ tipo: "erro", texto: "Escolha o arquivo .pfx primeiro." });
    if (!senha) return setMsg({ tipo: "erro", texto: "Digite a senha do certificado." });
    if (!file.name.toLowerCase().endsWith(".pfx"))
      return setMsg({ tipo: "erro", texto: "Arquivo deve ser .pfx." });

    startTransition(async () => {
      const fd = new FormData();
      fd.set("clienteId", clienteId);
      fd.set("file", file);
      fd.set("senha", senha);
      const r = await uploadCertificadoAction(fd);
      if (r.ok) {
        setMsg({
          tipo: "ok",
          texto: `Certificado "${file.name}" instalado ✅${r.validade ? ` (vence ${r.validade})` : ""}`,
        });
        if (senhaRef.current) senhaRef.current.value = "";
        if (fileRef.current) fileRef.current.value = "";
        router.refresh();
      } else {
        setMsg({ tipo: "erro", texto: r.erro });
      }
    });
  }

  function detectar() {
    startTransition(async () => {
      setMsg({ tipo: "info", texto: `Procurando .pfx em ${PASTA_PADRAO_PJ}...` });
      const fd = new FormData();
      fd.set("clienteId", clienteId);
      fd.set("pasta", PASTA_PADRAO_PJ);
      const r = await detectarECapturarCertificadoAction(fd);
      if (r.ok) {
        setMsg({
          tipo: "ok",
          texto: `Encontrado e instalado: "${r.nomeArquivo}"${r.validade ? ` — vence ${r.validade}` : ""}`,
        });
        router.refresh();
      } else {
        setMsg({ tipo: "erro", texto: r.erro });
      }
    });
  }

  function remover() {
    if (!window.confirm("Remover o certificado instalado? A senha também será apagada.")) return;
    startTransition(async () => {
      const fd = new FormData();
      fd.set("clienteId", clienteId);
      const r = await removerCertificadoAction(fd);
      if (r.ok) {
        setMsg({ tipo: "ok", texto: "Certificado removido." });
        router.refresh();
      } else {
        setMsg({ tipo: "erro", texto: r.erro });
      }
    });
  }

  return (
    <div className="space-y-3">
      {temCertificado ? (
        <div className="rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-sm">
          <div className="font-semibold text-green-800">
            ✅ Certificado instalado nesta plataforma
          </div>
          <div className="mt-1 text-xs text-slate-600">
            <div>
              Arquivo: <span className="font-mono">{nomeArquivoAtual ?? "(sem nome)"}</span>
            </div>
            {validadeAtual && (
              <div>
                Vence em: <b>{new Date(validadeAtual).toLocaleDateString("pt-BR")}</b>
              </div>
            )}
          </div>
          <button type="button" onClick={remover} disabled={pending} className="btn btn-ghost mt-2 text-xs text-red-600">
            Remover certificado
          </button>
        </div>
      ) : (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          ⚠️ Nenhum certificado instalado. Suba o .pfx abaixo ou clique em Detectar da pasta.
        </div>
      )}

      <div className="grid gap-3 rounded-lg border border-slate-200 bg-white p-3">
        <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          Instalar / substituir certificado
        </div>
        <div>
          <label className="label" htmlFor="cert-file">Arquivo .pfx</label>
          <input
            id="cert-file"
            ref={fileRef}
            type="file"
            accept=".pfx,.p12"
            className="block w-full text-sm text-slate-600 file:mr-2 file:rounded file:border file:border-slate-300 file:bg-slate-50 file:px-3 file:py-1 file:text-sm hover:file:bg-slate-100"
          />
        </div>
        <div>
          <label className="label" htmlFor="cert-senha">Senha do certificado</label>
          <input
            id="cert-senha"
            ref={senhaRef}
            type="password"
            className="input"
            autoComplete="new-password"
            placeholder="Digite a senha do .pfx"
          />
          <p className="mt-1 text-[11px] text-slate-500">
            Ambos (.pfx + senha) são cifrados em AES-256-GCM ao salvar. Nunca aparecem em log/export.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={upload}
            disabled={pending}
            className="btn btn-primary text-sm"
          >
            {pending ? "Enviando..." : "Instalar"}
          </button>
          <button
            type="button"
            onClick={detectar}
            disabled={pending}
            className="btn btn-accent text-sm"
            title={`Procura em ${PASTA_PADRAO_PJ} por padrão de nome`}
          >
            🔎 Detectar da pasta Z:\
          </button>
        </div>
      </div>

      {msg && (
        <p
          className={`text-xs ${
            msg.tipo === "erro" ? "text-red-600" : msg.tipo === "ok" ? "text-green-700" : "text-slate-500"
          }`}
        >
          {msg.texto}
        </p>
      )}
    </div>
  );
}
