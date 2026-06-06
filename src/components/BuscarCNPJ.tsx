"use client";

import { useState } from "react";

const MAPA: Record<string, string> = {
  razaoSocial: "razaoSocial",
  nomeFantasia: "nomeFantasia",
  naturezaJuridica: "naturezaJuridica",
  cnaePrincipal: "cnaePrincipal",
  municipio: "municipio",
  uf: "uf",
  telefone: "telefone",
  email: "email",
  porte: "porte",
  regimeTributario: "regimeTributario",
};

function setCampo(id: string, valor?: string) {
  if (!valor) return false;
  const el = document.getElementById(id) as HTMLInputElement | HTMLSelectElement | null;
  if (!el) return false;
  el.value = valor;
  el.classList.add("ring-2", "ring-[var(--brand-2)]", "bg-[var(--brand-2-soft)]");
  return true;
}

export function BuscarCNPJ() {
  const [estado, setEstado] = useState<"idle" | "buscando" | "ok" | "erro">("idle");
  const [msg, setMsg] = useState("");

  async function buscar() {
    const input = document.getElementById("cnpj") as HTMLInputElement | null;
    const cnpj = (input?.value ?? "").replace(/\D/g, "");
    if (cnpj.length !== 14) {
      setEstado("erro");
      setMsg("Digite o CNPJ completo (14 dígitos) e clique em Buscar.");
      return;
    }
    setEstado("buscando");
    setMsg("Consultando a Receita Federal...");
    try {
      const r = await fetch(`/api/cnpj?cnpj=${cnpj}`);
      const data = await r.json();
      if (!r.ok || !data.ok) {
        setEstado("erro");
        setMsg(data.erro || "Não foi possível consultar este CNPJ.");
        return;
      }
      const d = data.dados as Record<string, string | undefined>;
      let n = 0;
      for (const [chave, id] of Object.entries(MAPA)) {
        if (setCampo(id, d[chave])) n++;
      }
      if (d.cnpj && input) input.value = d.cnpj; // formata o CNPJ
      setEstado("ok");
      setMsg(
        `${d.razaoSocial ?? "Empresa"} — ${d.situacaoCadastral ?? ""}. ${n} campo(s) preenchidos. Confira e complete antes de salvar.`,
      );
    } catch (e) {
      setEstado("erro");
      setMsg(`Erro: ${(e as Error).message}`);
    }
  }

  return (
    <div>
      <label className="label" htmlFor="cnpj">
        CNPJ <span className="text-red-500">*</span>
      </label>
      <div className="flex gap-2">
        <input
          id="cnpj"
          name="cnpj"
          className="input flex-1"
          placeholder="00.000.000/0000-00"
          required
        />
        <button type="button" onClick={buscar} className="btn btn-accent whitespace-nowrap" disabled={estado === "buscando"}>
          {estado === "buscando" ? "Buscando..." : "🔎 Buscar na Receita"}
        </button>
      </div>
      {msg && (
        <p
          className={`mt-1 text-xs ${
            estado === "erro" ? "text-red-600" : estado === "ok" ? "text-green-700" : "text-slate-500"
          }`}
        >
          {msg}
        </p>
      )}
    </div>
  );
}
