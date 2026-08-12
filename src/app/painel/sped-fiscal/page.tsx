import { ModuloClienteIndex } from "@/components/ModuloClienteIndex";

export default function Page() {
  return (
    <ModuloClienteIndex
      titulo="SPED-Fiscal"
      descricao="Auditoria da EFD-Fiscal (ICMS/IPI). Selecione um cliente pra abrir o módulo."
      categoria="Fiscal"
      caminhoModulo="sped"
      icone="🧾"
    />
  );
}
