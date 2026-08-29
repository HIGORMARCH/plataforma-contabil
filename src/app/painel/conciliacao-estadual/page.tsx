import { ModuloClienteIndex } from "@/components/ModuloClienteIndex";

/**
 * Índice do módulo de Conciliação de Impostos (Razão × pagamentos).
 *
 * Era uma página única e só de ICMS ("Conciliação — Pagamentos de Impostos
 * Estaduais", em construção desde 20/07/2026). Virou índice de cliente em
 * 29/08/2026, quando o Higor definiu o escopo real: o confronto é do RAZÃO de
 * cada tributo (Simples, INSS, FGTS, IRRF, PIS, COFINS, ICMS, IRPJ, CSLL)
 * contra os comprovantes de pagamento — e cada empresa tem só os razões que tem.
 */
export default function ConciliacaoImpostosIndexPage() {
  return (
    <ModuloClienteIndex
      titulo="Conciliação de Impostos"
      descricao="O razão de cada tributo contra o que foi efetivamente pago — Simples Nacional, INSS, FGTS, IRRF, PIS, COFINS, ICMS, IRPJ e CSLL. Cada empresa entra com os razões que tem."
      categoria="Contábil"
      caminhoModulo="conciliacao-impostos"
      icone="⚖️"
    />
  );
}
