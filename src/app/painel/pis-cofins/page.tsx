import { ModuloClienteIndex } from "@/components/ModuloClienteIndex";

export default function Page() {
  return (
    <ModuloClienteIndex
      titulo="PIS/COFINS"
      descricao="Conciliação da EFD-Contribuições com DCTF/DCTFWeb. Selecione um cliente pra abrir o módulo."
      categoria="Fiscal"
      caminhoModulo="pis-cofins"
      icone="💰"
    />
  );
}
