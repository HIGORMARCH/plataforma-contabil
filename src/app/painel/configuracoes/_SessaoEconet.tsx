"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/**
 * Painel de sessão da Econet: testar e renovar.
 *
 * Fica FORA do formulário da credencial de propósito — botão dentro de <form>
 * dispara o submit dele, e salvar credencial não tem nada a ver com renovar
 * sessão.
 */

type Situacao =
  | "SESSAO_OK"
  | "SESSAO_AUSENTE"
  | "SESSAO_EXPIRADA"
  | "LAYOUT_MUDOU"
  | "ERRO_REDE"
  | "RESULTADO_INESPERADO";

interface RespostaTeste {
  ok: boolean;
  situacao: Situacao;
  mensagem: string;
  acao: string;
  ncmTestado: string;
  tipoRecebido?: string;
}

interface RespostaRenovacao {
  ok: boolean;
  preencheuCredencial?: boolean;
  cookies?: number;
  erro?: string;
}

const CORES: Record<Situacao | "ERRO", string> = {
  SESSAO_OK: "border-green-200 bg-green-50 text-green-900",
  SESSAO_AUSENTE: "border-amber-200 bg-amber-50 text-amber-900",
  SESSAO_EXPIRADA: "border-amber-200 bg-amber-50 text-amber-900",
  LAYOUT_MUDOU: "border-red-200 bg-red-50 text-red-900",
  RESULTADO_INESPERADO: "border-red-200 bg-red-50 text-red-900",
  ERRO_REDE: "border-slate-200 bg-slate-50 text-slate-700",
  ERRO: "border-red-200 bg-red-50 text-red-900",
};

export function SessaoEconet({ temCredencial }: { temCredencial: boolean }) {
  const router = useRouter();
  const [testando, setTestando] = useState(false);
  const [renovando, setRenovando] = useState(false);
  const [teste, setTeste] = useState<RespostaTeste | null>(null);
  const [erroRenovacao, setErroRenovacao] = useState<string | null>(null);
  const [okRenovacao, setOkRenovacao] = useState<string | null>(null);

  async function testar() {
    setTestando(true);
    setTeste(null);
    setErroRenovacao(null);
    setOkRenovacao(null);
    try {
      const r = await fetch("/api/econet/testar-sessao", { method: "POST" });
      setTeste(await r.json());
    } catch (e) {
      setTeste({
        ok: false,
        situacao: "ERRO_REDE",
        mensagem: e instanceof Error ? e.message : "Falha ao chamar o servidor.",
        acao: "Confirme se a plataforma continua rodando e tente de novo.",
        ncmTestado: "-",
      });
    } finally {
      setTestando(false);
    }
  }

  async function renovar() {
    setRenovando(true);
    setTeste(null);
    setErroRenovacao(null);
    setOkRenovacao(null);
    try {
      const r = await fetch("/api/econet/renovar-sessao", { method: "POST" });
      const dados: RespostaRenovacao = await r.json();
      if (dados.ok) {
        setOkRenovacao(
          `Sessão renovada (${dados.cookies} cookies guardados).` +
            (dados.preencheuCredencial === false
              ? " Obs.: usuário e senha não puderam ser pré-preenchidos — a tela de login da Econet mudou de formato."
              : ""),
        );
        router.refresh();
      } else {
        setErroRenovacao(dados.erro ?? "Não foi possível renovar a sessão.");
      }
    } catch (e) {
      setErroRenovacao(e instanceof Error ? e.message : "Falha ao chamar o servidor.");
    } finally {
      setRenovando(false);
    }
  }

  return (
    <section className="card mt-4 p-5">
      <h2 className="mb-1 text-sm font-bold uppercase tracking-wide text-slate-500">
        Sessão da Econet
      </h2>
      <p className="mb-4 max-w-[70ch] text-xs text-slate-500">
        A consulta de NCM usa uma sessão logada guardada no banco. Renovar abre uma janela do
        navegador já na Econet, com usuário e senha preenchidos — resta a você resolver o CAPTCHA.
        A janela fecha sozinha quando o login é reconhecido.
      </p>

      <div className="flex flex-wrap gap-2">
        <button type="button" className="btn" onClick={testar} disabled={testando || renovando}>
          {testando ? "Testando…" : "Testar sessão agora"}
        </button>
        <button
          type="button"
          className="btn btn-primary"
          onClick={renovar}
          disabled={testando || renovando}
        >
          {renovando ? "Aguardando o login na janela…" : "Renovar sessão da Econet"}
        </button>
      </div>

      {!temCredencial && (
        <p className="mt-3 text-xs text-slate-500">
          Sem usuário e senha cadastrados acima, a janela abre em branco e você digita na mão.
        </p>
      )}

      {renovando && (
        <p className="mt-3 text-xs text-slate-500">
          Uma janela do navegador foi aberta. Conclua o login nela — inclusive o CAPTCHA. Esta tela
          espera até 5 minutos.
        </p>
      )}

      {okRenovacao && (
        <div className="mt-4 rounded border border-green-200 bg-green-50 px-3 py-2 text-xs text-green-900">
          {okRenovacao}
        </div>
      )}

      {erroRenovacao && (
        <div className={`mt-4 rounded border px-3 py-2 text-xs ${CORES.ERRO}`}>{erroRenovacao}</div>
      )}

      {teste && (
        <div className={`mt-4 rounded border px-3 py-2 text-xs ${CORES[teste.situacao] ?? CORES.ERRO}`}>
          <p className="font-semibold">{teste.mensagem}</p>
          <p className="mt-1">{teste.acao}</p>
          <p className="mt-1 opacity-70">
            NCM de teste: {teste.ncmTestado}
            {teste.tipoRecebido ? ` — respondeu “${teste.tipoRecebido}”` : ""}
          </p>
        </div>
      )}
    </section>
  );
}
