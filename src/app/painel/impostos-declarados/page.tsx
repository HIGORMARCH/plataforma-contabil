import { ModuloClienteIndex } from "@/components/ModuloClienteIndex";

/**
 * Índice do módulo "Impostos a Pagar (declarados)". Lista os clientes e leva
 * pro relatório dentro do cliente escolhido.
 */
export default function ImpostosDeclaradosIndexPage() {
  return (
    <ModuloClienteIndex
      titulo="Impostos a Pagar"
      descricao="O que as declarações apontam como a pagar — GIAM (ICMS por tipo), SPED-Fiscal, DCTFWeb e ECF — reunido por competência, sem confrontar com a contabilidade."
      categoria="Contábil"
      caminhoModulo="impostos-declarados"
      icone="🧾"
    />
  );
}
