import { PrintHeaderMarch, type EscritorioTimbre } from "@/components/print/PrintHeaderMarch";

/**
 * Cabeçalho de impressão do Balancete Comparado.
 *
 * Timbre e estrutura vêm de `PrintHeaderMarch`. A particularidade daqui é o
 * enunciado: são TRÊS, um por escopo, e o CSS de `body.print-escopo-*` mostra
 * o correto conforme o botão clicado na toolbar — por isso este componente
 * passa `enunciado` em vez de `titulo`/`subtitulo`.
 */
export function PrintHeader({
  cliente,
  cnpj,
  regime,
  ano,
  escritorio,
}: {
  cliente: string;
  cnpj: string;
  regime: string;
  ano: number;
  escritorio: EscritorioTimbre | null;
}) {
  return (
    <PrintHeaderMarch
      escritorio={escritorio}
      cliente={cliente}
      cnpj={cnpj}
      meta={[
        { label: "Regime", valor: regime },
        { label: "Exercício", valor: ano },
      ]}
      enunciado={
        <>
          <div className="ph-titulo ph-escopo-sistema">
            <div className="ph-doc-nome">Balancete Analítico — SPED-ECD do Sistema</div>
            <div className="ph-doc-sub">
              Estado atual da contabilidade (SPED-ECD gerado agora no sistema
              contábil, antes de nova transmissão à Receita).
            </div>
          </div>
          <div className="ph-titulo ph-escopo-ecd">
            <div className="ph-doc-nome">Balancete Analítico — SPED-ECD Transmitido à Receita</div>
            <div className="ph-doc-sub">
              Cópia fiel do SPED-ECD entregue à Receita Federal (baixado do
              e-CAC ou ReceitanetBX).
            </div>
          </div>
          <div className="ph-titulo ph-escopo-ambos">
            <div className="ph-doc-nome">Balancete Comparado — Sistema × ECD Transmitida</div>
            <div className="ph-doc-sub">
              Confronto conta a conta entre o SPED-ECD gerado agora no sistema
              e o SPED-ECD transmitido à Receita. Divergências revelam ajustes
              feitos depois da transmissão, pendentes de retificação.
            </div>
          </div>
        </>
      }
    />
  );
}
