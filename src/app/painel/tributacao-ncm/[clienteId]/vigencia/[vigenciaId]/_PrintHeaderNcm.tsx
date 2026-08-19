import { PrintHeaderMarch, type EscritorioTimbre } from "@/components/print/PrintHeaderMarch";

/**
 * Cabeçalho de impressão do relatório de classificação de NCM.
 * O timbre e a estrutura vêm de `PrintHeaderMarch`; aqui fica só o que é deste
 * documento — nome, enunciado e os metadados da vigência.
 */
export function PrintHeaderNcm({
  cliente,
  cnpj,
  vigencia,
  totalNcms,
  escritorio,
}: {
  cliente: string;
  cnpj: string;
  vigencia: Date;
  totalNcms: number;
  escritorio: EscritorioTimbre | null;
}) {
  return (
    <PrintHeaderMarch
      escritorio={escritorio}
      cliente={cliente}
      cnpj={cnpj}
      titulo="Classificação de NCM — PIS/COFINS"
      subtitulo="Cruzamento entre a tabela de NCM do cliente e a base da plataforma. Aponta o regime de cada NCM, os itens em regime especial que exigem conferência e o que ainda falta classificar."
      meta={[
        { label: "Vigência", valor: vigencia.toLocaleDateString("pt-BR") },
        { label: "NCMs", valor: totalNcms },
      ]}
    />
  );
}
