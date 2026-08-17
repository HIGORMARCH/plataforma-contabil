/**
 * Cabeçalho de impressão do relatório de Impostos a Pagar.
 *
 * Mesmo padrão aprovado no Balancete Comparado (commit 3d6cbd0): escondido na
 * tela, aparece só no @media print, e reaproveita as classes `.ph-*` do
 * globals.css — o timbre do escritório já vem do cadastro em Administração →
 * Papel timbrado.
 *
 * Diferença pro balancete: aqui não há escopo alternável, então o enunciado é
 * fixo e não passa pela máquina de `.ph-titulo` / `body.print-escopo-*`.
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
}

interface Props {
  cliente: string;
  cnpj: string;
  inscricaoEstadual?: string | null;
  regime?: string | null;
  anoInicial: number;
  anoFinal: number;
  escritorio: EscritorioTimbre | null;
}

function formatarCnpj(cnpj: string): string {
  const d = cnpj.replace(/\D/g, "");
  if (d.length !== 14) return cnpj;
  return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
}

export function PrintHeaderImpostos({
  cliente,
  cnpj,
  inscricaoEstadual,
  regime,
  anoInicial,
  anoFinal,
  escritorio,
}: Props) {
  const cnpjEsc = escritorio?.cnpj ? formatarCnpj(escritorio.cnpj) : null;
  const periodo = anoInicial === anoFinal ? `${anoInicial}` : `${anoInicial} a ${anoFinal}`;

  return (
    <div className="print-header">
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

      <div className="ph-doc-nome">Relação de Impostos a Pagar — Declarado</div>
      <div className="ph-doc-sub">
        Obrigações apuradas nas declarações entregues (GIAM, SPED-Fiscal, DCTFWeb e ECF).
        Documento de conferência: use a coluna à direita para marcar cada tributo localizado
        no extrato bancário.
      </div>

      <div className="ph-cliente">
        <div>
          <span className="ph-lbl">Cliente:</span> <b>{cliente}</b>
        </div>
        <div>
          <span className="ph-lbl">CNPJ:</span> {formatarCnpj(cnpj)}
          {inscricaoEstadual && (
            <>
              {" "}&nbsp;·&nbsp; <span className="ph-lbl">IE:</span> {inscricaoEstadual}
            </>
          )}
          {regime && (
            <>
              {" "}&nbsp;·&nbsp; <span className="ph-lbl">Regime:</span> {regime}
            </>
          )}
          {" "}&nbsp;·&nbsp; <span className="ph-lbl">Período:</span> {periodo}
        </div>
      </div>
    </div>
  );
}
