import { PrintHeaderMarch, type EscritorioTimbre } from "@/components/print/PrintHeaderMarch";

/**
 * Cabeçalho de impressão do relatório de Impostos a Pagar.
 * Timbre e estrutura vêm de `PrintHeaderMarch`; aqui fica só o que é deste
 * documento.
 */
export function PrintHeaderImpostos({
  cliente,
  cnpj,
  inscricaoEstadual,
  regime,
  anoInicial,
  anoFinal,
  escritorio,
}: {
  cliente: string;
  cnpj: string;
  inscricaoEstadual?: string | null;
  regime?: string | null;
  anoInicial: number;
  anoFinal: number;
  escritorio: EscritorioTimbre | null;
}) {
  const periodo = anoInicial === anoFinal ? `${anoInicial}` : `${anoInicial} a ${anoFinal}`;

  return (
    <PrintHeaderMarch
      escritorio={escritorio}
      cliente={cliente}
      cnpj={cnpj}
      titulo="Relação de Impostos a Pagar — Declarado"
      subtitulo="Obrigações apuradas nas declarações entregues (GIAM, SPED-Fiscal, DCTFWeb e ECF). Documento de conferência: use a coluna à direita para marcar cada tributo localizado no extrato bancário."
      meta={[
        ...(inscricaoEstadual ? [{ label: "IE", valor: inscricaoEstadual }] : []),
        ...(regime ? [{ label: "Regime", valor: regime }] : []),
        { label: "Período", valor: periodo },
      ]}
    />
  );
}
