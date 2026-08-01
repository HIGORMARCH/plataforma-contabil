"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { excluirClienteAction } from "../actions";

export function ExcluirClienteButton({
  clienteId,
  razaoSocial,
}: {
  clienteId: string;
  razaoSocial: string;
}) {
  const [pending, startTransition] = useTransition();
  const [confirmando, setConfirmando] = useState(false);
  const router = useRouter();

  function excluir() {
    const ok = window.confirm(
      `Excluir "${razaoSocial}" definitivamente?\n\n` +
        "Serão apagados TAMBÉM: exercícios, relatórios, sócios, apurações GIAM/SPED, importações — tudo do cliente.\n\n" +
        "Esta ação NÃO pode ser desfeita. Digite OK pra confirmar.",
    );
    if (!ok) return;
    startTransition(async () => {
      const fd = new FormData();
      fd.set("id", clienteId);
      try {
        await excluirClienteAction(fd);
        // A action redireciona pra /painel/clientes, mas garantir refresh
        router.refresh();
      } catch (e) {
        alert(`Falha ao excluir: ${(e as Error).message}`);
      }
    });
  }

  if (!confirmando) {
    return (
      <button
        type="button"
        onClick={() => setConfirmando(true)}
        className="btn btn-ghost text-red-600 hover:bg-red-50"
        disabled={pending}
      >
        🗑️ Excluir cliente
      </button>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <span className="text-sm text-red-600">Tem certeza?</span>
      <button
        type="button"
        onClick={excluir}
        className="btn bg-red-600 text-white hover:bg-red-700"
        disabled={pending}
      >
        {pending ? "Excluindo..." : "Sim, excluir"}
      </button>
      <button
        type="button"
        onClick={() => setConfirmando(false)}
        className="btn btn-ghost"
        disabled={pending}
      >
        Cancelar
      </button>
    </div>
  );
}
