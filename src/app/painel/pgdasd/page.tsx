import { ModuloClienteIndex } from "@/components/ModuloClienteIndex";

/**
 * Índice do módulo "PGDAS-D (Simples Nacional)". Lista os clientes e leva pra
 * consulta dentro do cliente escolhido.
 */
export default function PgdasdIndexPage() {
  return (
    <ModuloClienteIndex
      titulo="PGDAS-D (Simples Nacional)"
      descricao="Consulta a declaração do Simples no SERPRO Integra Contador e extrai receita bruta do período e débito por tributo — a base do confronto PGDAS × GIAM e das linhas federais do relatório de Impostos a Pagar."
      categoria="Fiscal"
      caminhoModulo="pgdasd"
      icone="🇧🇷"
    />
  );
}
