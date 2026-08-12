import { ModuloClienteIndex } from "@/components/ModuloClienteIndex";

export default function Page() {
  return (
    <ModuloClienteIndex
      titulo="Razão / Contrapartida"
      descricao="Consulta lançamento a lançamento a partir da ECD, sem precisar abrir o PVA. Razão da conta com contrapartida real, ou consulta de um lançamento pelo número."
      categoria="Contábil"
      caminhoModulo="razao-contrapartida"
      icone="🔎"
    />
  );
}
