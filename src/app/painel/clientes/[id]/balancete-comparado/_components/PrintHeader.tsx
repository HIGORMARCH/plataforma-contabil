/**
 * Cabeçalho de impressão do Balancete Comparado.
 * Fica escondido na tela (display: none via .print-only) e aparece só no
 * @media print. Renderiza 3 blocos, um pra cada escopo — o CSS de
 * .print-escopo-* mostra o correto conforme o botão clicado.
 *
 * Estrutura por página impressa:
 *   ┌───────────────────────────────────────────────────────────┐
 *   │  [LOGO]   Razão Social do Escritório                      │
 *   │           CRC · CNPJ · Endereço · Telefone · Email        │
 *   ├───────────────────────────────────────────────────────────┤
 *   │  BALANCETE — {escopo}                                     │
 *   │  Cliente: RAZÃO — CNPJ · Regime · Exercício {ano}         │
 *   └───────────────────────────────────────────────────────────┘
 *
 * O timbre é opcional: se o escritório não tem logoDataUrl ainda, sai só
 * texto (razão social do escritório). Assim já funciona antes de cadastrar
 * o logo em Administração → Papel timbrado.
 */
interface EscritorioTimbre {
  razaoSocial: string;
  nomeFantasia?: string | null;
  cnpj?: string | null;
  crc?: string | null;
  endereco?: string | null;
  telefone?: string | null;
  email?: string | null;
  site?: string | null;
  logoDataUrl?: string | null;
  rodapePadrao?: string | null;
}

interface Props {
  cliente: string;
  cnpj: string;
  regime: string;
  ano: number;
  escritorio: EscritorioTimbre | null;
}

function formatarCnpj(cnpj: string): string {
  const d = cnpj.replace(/\D/g, "");
  if (d.length !== 14) return cnpj;
  return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
}

export function PrintHeader({ cliente, cnpj, regime, ano, escritorio }: Props) {
  const cnpjFmt = formatarCnpj(cnpj);
  const cnpjEsc = escritorio?.cnpj ? formatarCnpj(escritorio.cnpj) : null;

  return (
    <div className="print-header">
      {/* TIMBRE — igual em todos os escopos */}
      <div className="ph-timbre">
        {escritorio?.logoDataUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={escritorio.logoDataUrl} alt="Logo" className="ph-logo" />
        )}
        <div className="ph-timbre-txt">
          <div className="ph-esc-nome">
            {escritorio?.nomeFantasia || escritorio?.razaoSocial || "Escritório"}
          </div>
          <div className="ph-esc-meta">
            {[
              escritorio?.crc && `CRC ${escritorio.crc}`,
              cnpjEsc && `CNPJ ${cnpjEsc}`,
              escritorio?.endereco,
              escritorio?.telefone,
              escritorio?.email,
              escritorio?.site,
            ]
              .filter(Boolean)
              .join(" · ")}
          </div>
        </div>
      </div>

      {/* ENUNCIADO — muda conforme o escopo escolhido no botão */}
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

      {/* DADOS DO CLIENTE — comum a todos */}
      <div className="ph-cliente">
        <div>
          <span className="ph-lbl">Cliente:</span> <b>{cliente}</b>
        </div>
        <div>
          <span className="ph-lbl">CNPJ:</span> {cnpjFmt} &nbsp;·&nbsp;{" "}
          <span className="ph-lbl">Regime:</span> {regime} &nbsp;·&nbsp;{" "}
          <span className="ph-lbl">Exercício:</span> {ano}
        </div>
      </div>
    </div>
  );
}
