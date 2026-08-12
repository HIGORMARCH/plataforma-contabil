import { ModuloClienteIndex } from "@/components/ModuloClienteIndex";

export default function Page() {
  return (
    <ModuloClienteIndex
      titulo="Balanço Comparado"
      descricao="Cruza a POSIÇÃO patrimonial (Ativo/Passivo/PL) do SPED-ECD do sistema contábil com o SPED-ECD transmitido à Receita. Foco no saldo final."
      categoria="Contábil"
      caminhoModulo="balanco-comparado"
      icone="📋"
    />
  );
}
