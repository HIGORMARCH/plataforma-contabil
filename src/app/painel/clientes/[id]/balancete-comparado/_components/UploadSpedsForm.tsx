"use client";

import { useState, useTransition, useRef } from "react";
import { useRouter } from "next/navigation";
import { uploadSpedEcdAction } from "../actions";

interface StatusLado {
  presente: boolean;
  ano: number | null;
  caminho: string | null;
}

interface Props {
  clienteId: string;
  statusDominio: StatusLado;
  statusTransmitida: StatusLado;
}

export function UploadSpedsForm({
  clienteId,
  statusDominio,
  statusTransmitida,
}: Props) {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <UploadCard
        clienteId={clienteId}
        lado="DOMINIO"
        titulo="SPED-ECD do Sistema (atual)"
        subtitulo="Gerado agora no sistema contábil (ex.: Domínio) — reflete o estado atual da contabilidade."
        status={statusDominio}
      />
      <UploadCard
        clienteId={clienteId}
        lado="TRANSMITIDA"
        titulo="SPED-ECD Transmitido à Receita"
        subtitulo="Baixado do e-CAC ou ReceitanetBX — o que foi de fato entregue à Receita."
        status={statusTransmitida}
      />
    </div>
  );
}

function UploadCard({
  clienteId,
  lado,
  titulo,
  subtitulo,
  status,
}: {
  clienteId: string;
  lado: "DOMINIO" | "TRANSMITIDA";
  titulo: string;
  subtitulo: string;
  status: StatusLado;
}) {
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<{ tipo: "ok" | "erro"; texto: string } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  function submit() {
    const file = fileRef.current?.files?.[0];
    if (!file) {
      setMsg({ tipo: "erro", texto: "Escolha um arquivo .txt do SPED-ECD." });
      return;
    }
    startTransition(async () => {
      const fd = new FormData();
      fd.set("clienteId", clienteId);
      fd.set("lado", lado);
      fd.set("file", file);
      const r = await uploadSpedEcdAction(fd);
      if (r.ok) {
        setMsg({ tipo: "ok", texto: `${r.mensagem}` });
        if (fileRef.current) fileRef.current.value = "";
        router.refresh();
      } else {
        setMsg({ tipo: "erro", texto: r.erro });
      }
    });
  }

  return (
    <div className="rounded border border-[var(--rule)] bg-[var(--paper)] p-4">
      <div className="eyebrow mb-1">
        Lado {lado === "DOMINIO" ? "A · Sistema" : "B · ECD Transmitida"}
      </div>
      <h3 className="mb-1 font-serif text-lg leading-tight text-[var(--brand-deep)]">
        {titulo}
      </h3>
      <p className="mb-3 text-xs text-[var(--ink-soft)]">{subtitulo}</p>

      <div
        className={`mb-3 rounded border px-3 py-2 text-xs ${
          status.presente
            ? "border-emerald-200 bg-emerald-50 text-emerald-800"
            : "border-[var(--rule)] bg-white text-[var(--ink-soft)]"
        }`}
      >
        {status.presente ? (
          <>
            <b>Ano {status.ano}</b> — arquivo carregado
            <br />
            <code className="text-[10px]">{status.caminho}</code>
          </>
        ) : (
          "Nenhum arquivo carregado ainda."
        )}
      </div>

      <input
        type="file"
        ref={fileRef}
        accept=".txt,.ecd,.sped"
        className="mb-2 block w-full text-xs"
      />
      <button
        type="button"
        onClick={submit}
        disabled={pending}
        className="btn btn-accent text-sm"
      >
        {pending ? "Enviando..." : status.presente ? "Substituir arquivo" : "Enviar arquivo"}
      </button>

      {msg && (
        <p
          className={`mt-2 text-xs ${
            msg.tipo === "erro" ? "text-red-700" : "text-emerald-700"
          }`}
        >
          {msg.texto}
        </p>
      )}
    </div>
  );
}
