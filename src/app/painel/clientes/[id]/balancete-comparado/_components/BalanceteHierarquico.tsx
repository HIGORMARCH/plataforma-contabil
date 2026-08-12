"use client";

import { Fragment, useState } from "react";
import Link from "next/link";
import { moeda } from "@/lib/accounting/format";
import type {
  LinhaHierarquica,
  StatusConta,
} from "@/lib/accounting/balanceteComparado";

const TOL = 0.02;

/**
 * Modo de exibição:
 *  - "balanco": só coluna SF Sistema / SF ECD / Δ (uso pra tela Balanço)
 *  - "balancete": mostra as 4 dimensões (SI/Deb/Cred/SF) × 2 lados +
 *                 Δ SF (uso pra tela Balancete de Verificação)
 */
export type ModoTabela = "balanco" | "balancete";

interface Props {
  linhas: LinhaHierarquica[];
  /** Se true, esconde sub-árvores sem nenhum descendente divergente. */
  soDivergentes: boolean;
  /** Cliente e ano — pra montar links pra tela de razão. */
  clienteId: string;
  ano: number;
  /** Modo de exibição (default: "balancete"). */
  modo?: ModoTabela;
}

export function BalanceteHierarquico({
  linhas,
  soDivergentes,
  clienteId,
  ano,
  modo = "balancete",
}: Props) {
  const [expandidas, setExpandidas] = useState<Set<string>>(new Set());

  // Filtra sub-árvores sem divergência quando soDivergentes=true.
  // Níveis 0 e 1 (raízes Ativo/Passivo/PL + subgrupos Circulante/Não
  // Circulante/Capital/Reservas/Lucros) SEMPRE aparecem — dão o esqueleto
  // do balanço. Do nível 2 pra baixo, só aparece o que diverge ou tem
  // descendente divergente.
  const linhasVisiveis = soDivergentes
    ? linhas.filter(
        (l) => l.nivel <= 1 || l.divergente || l.temDescendenteDivergente,
      )
    : linhas;

  function toggleExpansao(cod: string) {
    setExpandidas((prev) => {
      const novo = new Set(prev);
      if (novo.has(cod)) novo.delete(cod);
      else novo.add(cod);
      return novo;
    });
  }

  const modoBalancete = modo === "balancete";
  const colspan = modoBalancete ? 12 : 6;

  return (
    <div className="balancete-hier overflow-x-auto">
      <table>
        <thead>
          {modoBalancete ? (
            <>
              <tr>
                <th rowSpan={2} className="left" style={{ width: 65 }}>
                  Cód.
                </th>
                <th rowSpan={2} className="left" style={{ minWidth: 260 }}>
                  Conta
                </th>
                <th colSpan={2}>Saldo Anterior</th>
                <th colSpan={2}>Débito</th>
                <th colSpan={2}>Crédito</th>
                <th colSpan={2}>Saldo Atual</th>
                <th rowSpan={2} style={{ width: 120 }}>
                  Δ SF
                </th>
                <th rowSpan={2} className="status-col">
                  Status
                </th>
              </tr>
              <tr className="sub">
                <th className="sublabel">Sist.</th>
                <th className="sublabel">ECD</th>
                <th className="sublabel">Sist.</th>
                <th className="sublabel">ECD</th>
                <th className="sublabel">Sist.</th>
                <th className="sublabel">ECD</th>
                <th className="sublabel">Sist.</th>
                <th className="sublabel">ECD</th>
              </tr>
            </>
          ) : (
            <tr>
              <th className="left" style={{ width: 75 }}>
                Cód.
              </th>
              <th className="left">Conta</th>
              <th style={{ width: 150 }}>SF Sistema</th>
              <th style={{ width: 150 }}>SF ECD</th>
              <th style={{ width: 140 }}>Δ Saldo Final</th>
              <th className="status-col">Status</th>
            </tr>
          )}
        </thead>
        <tbody>
          {linhasVisiveis.map((l) => {
            const isSint = l.indicador === "S";
            const isAnal = l.indicador === "A";
            const isDiverge = l.divergente;
            const isExpandida = expandidas.has(l.codigo);
            const lvl = Math.min(l.nivel, 6);
            const rowCls = [
              `lvl-${lvl}`,
              isSint ? "sint" : "anal",
              isDiverge ? "diverge" : "",
              isExpandida ? "expandida" : "",
            ]
              .filter(Boolean)
              .join(" ");

            return (
              <Fragment key={l.codigo}>
                <tr
                  className={rowCls}
                  onClick={isAnal ? () => toggleExpansao(l.codigo) : undefined}
                  title={isAnal ? "Clique pra ver detalhamento e razão comparado" : undefined}
                >
                  <td className="cod">{l.codigo}</td>
                  <td className="conta" data-nivel={String(lvl)}>
                    {l.descricao}
                  </td>
                  {modoBalancete ? (
                    <>
                      <td className="val dom">{formatarSaldo(l.dominio.saldoInicial)}</td>
                      <td className="val ecd">{formatarSaldo(l.ecd.saldoInicial)}</td>
                      <td className="val dom">{formatarSaldo(l.dominio.debito)}</td>
                      <td className="val ecd">{formatarSaldo(l.ecd.debito)}</td>
                      <td className="val dom">{formatarSaldo(l.dominio.credito)}</td>
                      <td className="val ecd">{formatarSaldo(l.ecd.credito)}</td>
                      <td className="val dom">{formatarSaldo(l.dominio.saldoFinal)}</td>
                      <td className="val ecd">{formatarSaldo(l.ecd.saldoFinal)}</td>
                    </>
                  ) : (
                    <>
                      <td className="val dom">{formatarSaldo(l.dominio.saldoFinal)}</td>
                      <td className="val ecd">{formatarSaldo(l.ecd.saldoFinal)}</td>
                    </>
                  )}
                  <td
                    className={`val ${
                      Math.abs(l.diferencas.saldoFinal) > TOL ? "dif" : "num-null"
                    }`}
                  >
                    {formatarDelta(l.diferencas.saldoFinal)}
                  </td>
                  <td className="status-col">
                    <StatusBadge
                      status={l.status}
                      isSint={isSint}
                      temDescDivergente={l.temDescendenteDivergente}
                    />
                  </td>
                </tr>

                {isExpandida && isAnal && (
                  <tr className="drilldown">
                    <td colSpan={colspan}>
                      <DetalhamentoConta
                        linha={l}
                        clienteId={clienteId}
                        ano={ano}
                      />
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/**
 * Só 2 estados no visual: OK (azul) e Divergente (vermelho suave).
 * Os subtipos Só Domínio / Só ECD / Sinal Invertido continuam classificados
 * internamente (útil pra exportação/análise) mas aqui mostramos como
 * "Divergente" — o contador se preocupa em identificar o problema, não em
 * classificar sua categoria.
 */
function StatusBadge({
  status,
  isSint,
  temDescDivergente,
}: {
  status: StatusConta;
  isSint: boolean;
  temDescDivergente: boolean;
}) {
  // Vazio = nada a mostrar
  if (status === "VAZIO" && !temDescDivergente) {
    return <span className="st-vazio">—</span>;
  }
  const divergeVisual = isSint
    ? temDescDivergente
    : status !== "OK" && status !== "VAZIO";
  return divergeVisual ? (
    <span className="st-badge st-diverge">Divergente</span>
  ) : (
    <span className="st-badge st-ok">OK</span>
  );
}

function formatarSaldo(v: number): React.ReactNode {
  if (Math.abs(v) < 0.005) return <span className="num-null">—</span>;
  return moeda(v);
}

function formatarDelta(v: number): React.ReactNode {
  if (Math.abs(v) <= TOL) return <span className="num-null">—</span>;
  return moeda(v);
}

// ---------------------------------------------------------------------------
// DetalhamentoConta — bloco expandido embaixo de uma analítica divergente
// mostrando SI/Deb/Cred/SF Domínio × Transmitida × Δ.
// ---------------------------------------------------------------------------
function DetalhamentoConta({
  linha,
  clienteId,
  ano,
}: {
  linha: LinhaHierarquica;
  clienteId: string;
  ano: number;
}) {
  const { dominio: d, ecd: e, diferencas: df } = linha;
  const dif = (v: number) => Math.abs(v) > TOL;
  const cell = (v: number, isDiff: boolean) => {
    const cls = ["val"];
    if (isDiff) cls.push("diff");
    if (Math.abs(v) < 0.005) cls.push("null");
    return <div className={cls.join(" ")}>{Math.abs(v) < 0.005 ? "—" : moeda(v)}</div>;
  };
  const delta = (v: number) => {
    const isZero = Math.abs(v) <= TOL;
    return (
      <div className={`val delta ${isZero ? "zero" : ""}`}>
        {isZero ? "—" : moeda(v)}
      </div>
    );
  };

  return (
    <div style={{ maxWidth: 900 }}>
      <div className="mb-3 flex justify-end">
        <Link
          href={`/painel/clientes/${clienteId}/balancete-comparado/razao/${linha.codigo}?ano=${ano}`}
          className="btn btn-accent text-xs"
        >
          Ver razão comparado desta conta
        </Link>
      </div>
      <div className="acct-grid">
      <div className="col-hdr">&nbsp;</div>
      <div className="col-hdr">Saldo Inicial</div>
      <div className="col-hdr">Débito</div>
      <div className="col-hdr">Crédito</div>
      <div className="col-hdr">Saldo Final</div>

      <div className="row-label">Sistema</div>
      {cell(d.saldoInicial, dif(df.saldoInicial))}
      {cell(d.debito, dif(df.debito))}
      {cell(d.credito, dif(df.credito))}
      {cell(d.saldoFinal, dif(df.saldoFinal))}

      <div className="row-label">ECD</div>
      {cell(e.saldoInicial, dif(df.saldoInicial))}
      {cell(e.debito, dif(df.debito))}
      {cell(e.credito, dif(df.credito))}
      {cell(e.saldoFinal, dif(df.saldoFinal))}

      <div className="row-label delta">Δ</div>
      {delta(df.saldoInicial)}
      {delta(df.debito)}
      {delta(df.credito)}
      {delta(df.saldoFinal)}
      </div>
    </div>
  );
}
