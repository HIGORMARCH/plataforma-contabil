import { ModuloClienteIndex } from "@/components/ModuloClienteIndex";

export default function Page() {
  return (
    <ModuloClienteIndex
      titulo="Balancete Comparado"
      descricao="Balancete de verificação completo do Sistema × ECD Transmitida, com SI, Débito, Crédito e Saldo Final de todas as contas — incluindo contas de resultado (DRE)."
      categoria="Contábil"
      caminhoModulo="balancete-comparado"
      icone="📊"
    />
  );
}
