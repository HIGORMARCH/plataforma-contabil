import { ModuloClienteIndex } from "@/components/ModuloClienteIndex";

export default function Page() {
  return (
    <ModuloClienteIndex
      titulo="IRPJ/CSLL"
      descricao="Auditoria da ECF confrontada com DCTF/DCTFWeb. Selecione um cliente pra abrir o módulo."
      categoria="Fiscal"
      caminhoModulo="irpj-csll"
      icone="🧮"
    />
  );
}
