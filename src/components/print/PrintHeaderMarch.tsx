import type { ReactNode } from "react";

/**
 * Cabeçalho de impressão comum a todos os relatórios da plataforma.
 *
 * Fica escondido na tela e aparece só no @media print (classe `.print-header`
 * do globals.css). Estrutura por página impressa:
 *
 *   ┌───────────────────────────────────────────────────────────┐
 *   │  [LOGO]   Razão Social do Escritório                      │
 *   │           CRC · CNPJ · Endereço · Telefone · Email        │
 *   ├───────────────────────────────────────────────────────────┤
 *   │  NOME DO DOCUMENTO                                        │
 *   │  Subtítulo explicando o que o documento mostra            │
 *   │  Cliente: RAZÃO — CNPJ · (metadados do módulo)            │
 *   └───────────────────────────────────────────────────────────┘
 *
 * Antes de 19/08/2026 cada módulo tinha a sua cópia deste componente
 * (`PrintHeader`, `PrintHeaderImpostos`, `PrintHeaderNcm`) — três versões quase
 * idênticas do mesmo timbre. Com 15 módulos no menu, cada um com seu relatório,
 * isso viraria 15 lugares para manter o papel timbrado do escritório.
 *
 * O timbre é opcional: sem `logoDataUrl` sai só o texto, então funciona antes
 * de cadastrar o logo em Administração → Papel timbrado.
 */

export interface EscritorioTimbre {
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

/** Par rótulo/valor da linha de identificação (Regime, Exercício, Período…). */
export interface MetaCliente {
  label: string;
  valor: string | number;
}

export function formatarCnpj(cnpj: string): string {
  const d = cnpj.replace(/\D/g, "");
  if (d.length !== 14) return cnpj;
  return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
}

/** Só o bloco do escritório — reaproveitado pela capa do dossiê. */
export function TimbreEscritorio({ escritorio }: { escritorio: EscritorioTimbre | null }) {
  const cnpjEsc = escritorio?.cnpj ? formatarCnpj(escritorio.cnpj) : null;
  return (
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
  );
}

export function PrintHeaderMarch({
  escritorio,
  cliente,
  cnpj,
  titulo,
  subtitulo,
  meta = [],
  enunciado,
}: {
  escritorio: EscritorioTimbre | null;
  cliente: string;
  cnpj: string;
  /** Nome do documento. Ignorado quando `enunciado` é passado. */
  titulo?: string;
  subtitulo?: string;
  /** Campos extras na linha do cliente, depois do CNPJ. */
  meta?: MetaCliente[];
  /**
   * Enunciado customizado, para os casos em que o título muda conforme a
   * escolha do usuário (o Balancete Comparado alterna entre três, via
   * `body.print-escopo-*`).
   */
  enunciado?: ReactNode;
}) {
  return (
    <div className="print-header">
      <TimbreEscritorio escritorio={escritorio} />

      {enunciado ?? (
        <>
          <div className="ph-doc-nome">{titulo}</div>
          {subtitulo && <div className="ph-doc-sub">{subtitulo}</div>}
        </>
      )}

      <div className="ph-cliente">
        <div>
          <span className="ph-lbl">Cliente:</span> <b>{cliente}</b>
        </div>
        <div>
          <span className="ph-lbl">CNPJ:</span> {formatarCnpj(cnpj)}
          {meta.map((m) => (
            <span key={m.label}>
              {" "}&nbsp;·&nbsp; <span className="ph-lbl">{m.label}:</span> {m.valor}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
