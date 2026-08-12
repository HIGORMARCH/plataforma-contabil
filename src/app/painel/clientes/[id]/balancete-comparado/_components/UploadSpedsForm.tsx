"use client";

import { useState, useTransition, useRef } from "react";
import { useRouter } from "next/navigation";
import { uploadSpedEcdAction, varrerPastaEcdAction } from "../actions";

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
  const [nomeArquivo, setNomeArquivo] = useState<string | null>(null);
  const [pastaPath, setPastaPath] = useState<string>("");
  const [modo, setModo] = useState<"arquivo" | "pasta">("arquivo");
  const fileRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  function abrirPicker() {
    fileRef.current?.click();
  }

  function onArquivoEscolhido(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    setNomeArquivo(f?.name ?? null);
    setMsg(null);
    if (f) enviarArquivo(f);
  }

  function enviarArquivo(file: File) {
    startTransition(async () => {
      setMsg({ tipo: "ok", texto: "Enviando arquivo..." });
      const fd = new FormData();
      fd.set("clienteId", clienteId);
      fd.set("lado", lado);
      fd.set("file", file);
      const r = await uploadSpedEcdAction(fd);
      if (r.ok) {
        setMsg({ tipo: "ok", texto: `${r.mensagem}` });
        setNomeArquivo(null);
        if (fileRef.current) fileRef.current.value = "";
        router.refresh();
      } else {
        setMsg({ tipo: "erro", texto: r.erro });
      }
    });
  }

  function varrerPasta() {
    if (!pastaPath.trim()) {
      setMsg({ tipo: "erro", texto: "Informe o caminho da pasta." });
      return;
    }
    startTransition(async () => {
      setMsg({ tipo: "ok", texto: `Varrendo ${pastaPath}...` });
      const fd = new FormData();
      fd.set("clienteId", clienteId);
      fd.set("lado", lado);
      fd.set("pasta", pastaPath);
      const r = await varrerPastaEcdAction(fd);
      if (r.ok) {
        const anos = r.importados.map((x) => x.ano).sort().join(", ");
        setMsg({
          tipo: "ok",
          texto: `${r.importados.length} arquivo(s) importado(s) — anos ${anos}. Ignorados: ${r.ignorados}.`,
        });
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

      {/* Status atual — bloco discreto, sem cara de input */}
      <div
        className={`mb-3 rounded px-3 py-2 text-xs ${
          status.presente
            ? "border border-emerald-200 bg-emerald-50 text-emerald-800"
            : "border border-dashed border-[var(--rule)] bg-transparent text-[var(--ink-soft)]"
        }`}
      >
        {status.presente ? (
          <>
            <b>Ano {status.ano}</b> — arquivo carregado
            <br />
            <code className="text-[10px] break-all">{status.caminho}</code>
          </>
        ) : (
          <span className="italic">Nenhum arquivo carregado ainda</span>
        )}
      </div>

      {/* Tabs entre modo Arquivo e modo Pasta */}
      <div className="mb-3 flex gap-1 border-b border-[var(--rule)]">
        <button
          type="button"
          onClick={() => setModo("arquivo")}
          className={`px-3 py-1.5 text-xs font-medium border-b-2 -mb-px transition ${
            modo === "arquivo"
              ? "border-[var(--brand-darker)] text-[var(--brand-darker)]"
              : "border-transparent text-[var(--ink-soft)] hover:text-[var(--brand-deep)]"
          }`}
        >
          Escolher arquivo
        </button>
        <button
          type="button"
          onClick={() => setModo("pasta")}
          className={`px-3 py-1.5 text-xs font-medium border-b-2 -mb-px transition ${
            modo === "pasta"
              ? "border-[var(--brand-darker)] text-[var(--brand-darker)]"
              : "border-transparent text-[var(--ink-soft)] hover:text-[var(--brand-deep)]"
          }`}
        >
          Varrer pasta
        </button>
      </div>

      {modo === "arquivo" ? (
        <>
          <input
            type="file"
            ref={fileRef}
            accept=".txt,.ecd,.sped"
            className="hidden"
            onChange={onArquivoEscolhido}
          />
          <button
            type="button"
            onClick={abrirPicker}
            disabled={pending}
            className="btn btn-accent text-sm w-full"
          >
            {pending
              ? "Enviando..."
              : status.presente
                ? "Substituir arquivo"
                : "Escolher arquivo SPED-ECD"}
          </button>
          {nomeArquivo && !pending && (
            <p className="mt-2 text-[11px] text-[var(--ink-soft)]">
              Selecionado: <b>{nomeArquivo}</b>
            </p>
          )}
        </>
      ) : (
        <>
          <input
            type="text"
            value={pastaPath}
            onChange={(e) => setPastaPath(e.target.value)}
            placeholder="Ex.: C:\\Users\\Higor\\Downloads\\SPED"
            className="input font-mono text-xs mb-2"
          />
          <button
            type="button"
            onClick={varrerPasta}
            disabled={pending}
            className="btn btn-accent text-sm w-full"
          >
            {pending ? "Varrendo..." : "Varrer pasta"}
          </button>
          <p className="mt-2 text-[11px] text-[var(--ink-soft)]">
            A plataforma vai ler todos os .txt/.ecd/.sped da pasta, validar
            CNPJ do cliente e importar todos os anos que forem SPED-ECD
            válidos.
          </p>
        </>
      )}

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
