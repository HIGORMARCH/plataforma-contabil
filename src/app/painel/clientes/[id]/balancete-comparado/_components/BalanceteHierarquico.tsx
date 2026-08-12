"use client";

import { Fragment, useState } from "react";
import Link from "next/link";
import { moeda } from "@/lib/accounting/format";
import type { LinhaHierarquica } from "@/lib/accounting/balanceteComparado";

const TOL = 0.02;

/**
 * Modo de exibição:
 *  - "balanco": SF Sistema × SF ECD + Δ (uso pra tela Balanço)
 *  - "balancete": DOIS balancetes completos lado a lado (formato Domínio) —
 *                 esquerda BALANCETE SISTEMA, direita BALANCETE ECD.
 *                 Cada lado tem: Cód | Descrição | SI | Deb | Cred | SF.
 *                 Divergentes: linha inteira em vermelho suave.
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

  if (modo === "balanco") {
    return (
      <BalancoSimples
        linhas={linhasVisiveis}
        expandidas={expandidas}
        toggleExpansao={toggleExpansao}
        clienteId={clienteId}
        ano={ano}
      />
    );
  }

  // MODO BALANCETE — dois balancetes lado a lado (formato Domínio)
  return (
    <div className="balancete-hier bal-lado overflow-x-auto">
      <table>
        <colgroup>
          <col style={{ width: "3%" }} className="lado-sistema" />
          <col style={{ width: "18.5%" }} className="lado-sistema" />
          <col style={{ width: "7%" }} className="lado-sistema" />
          <col style={{ width: "7%" }} className="lado-sistema" />
          <col style={{ width: "7%" }} className="lado-sistema" />
          <col style={{ width: "7%" }} className="lado-sistema" />
          <col style={{ width: "1%" }} className="sep" />
          <col style={{ width: "3%" }} className="lado-ecd" />
          <col style={{ width: "18.5%" }} className="lado-ecd" />
          <col style={{ width: "7%" }} className="lado-ecd" />
          <col style={{ width: "7%" }} className="lado-ecd" />
          <col style={{ width: "7%" }} className="lado-ecd" />
          <col style={{ width: "7%" }} className="lado-ecd" />
        </colgroup>
        <thead>
          <tr className="bal-title">
            <th colSpan={6} className="lado-title lado-sistema">Balancete Sistema</th>
            <th className="sep-col" />
            <th colSpan={6} className="lado-title lado-ecd">Balancete ECD (Transmitida)</th>
          </tr>
          <tr>
            <th className="left lado-sistema">Cód.</th>
            <th className="left lado-sistema">Descrição da conta</th>
            <th className="lado-sistema">Anterior</th>
            <th className="lado-sistema">Débito</th>
            <th className="lado-sistema">Crédito</th>
            <th className="lado-sistema">Atual</th>
            <th className="sep-col" />
            <th className="left lado-ecd">Cód.</th>
            <th className="left lado-ecd">Descrição da conta</th>
            <th className="lado-ecd">Anterior</th>
            <th className="lado-ecd">Débito</th>
            <th className="lado-ecd">Crédito</th>
            <th className="lado-ecd">Atual</th>
          </tr>
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
                  <td className="cod lado-sistema">{l.codigo}</td>
                  <td className="conta lado-sistema" data-nivel={String(lvl)} title={l.descricao}>
                    {l.descricao}
                  </td>
                  <td className="val lado-sistema">{formatarSaldo(l.dominio.saldoInicial)}</td>
                  <td className="val lado-sistema">{formatarSaldo(l.dominio.debito)}</td>
                  <td className="val lado-sistema">{formatarSaldo(l.dominio.credito)}</td>
                  <td className="val lado-sistema">{formatarSaldo(l.dominio.saldoFinal)}</td>
                  <td className="sep-col" />
                  <td className="cod lado-ecd">{l.codigo}</td>
                  <td className="conta lado-ecd" data-nivel={String(lvl)} title={l.descricao}>
                    {l.descricao}
                  </td>
                  <td className="val lado-ecd">{formatarSaldo(l.ecd.saldoInicial)}</td>
                  <td className="val lado-ecd">{formatarSaldo(l.ecd.debito)}</td>
                  <td className="val lado-ecd">{formatarSaldo(l.ecd.credito)}</td>
                  <td className="val lado-ecd">{formatarSaldo(l.ecd.saldoFinal)}</td>
                </tr>

                {isExpandida && isAnal && (
                  <tr className="drilldown">
                    <td colSpan={13}>
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

// ---------------------------------------------------------------------------
// Modo "balanco" — layout simples (SF Sistema × SF ECD × Δ)
// ---------------------------------------------------------------------------
function BalancoSimples({
  linhas,
  expandidas,
  toggleExpansao,
  clienteId,
  ano,
}: {
  linhas: LinhaHierarquica[];
  expandidas: Set<string>;
  toggleExpansao: (cod: string) => void;
  clienteId: string;
  ano: number;
}) {
  return (
    <div className="balancete-hier overflow-x-auto">
      <table>
        <colgroup>
          <col style={{ width: 65 }} />
          <col />
          <col style={{ width: 150 }} />
          <col style={{ width: 150 }} />
          <col style={{ width: 130 }} />
        </colgroup>
        <thead>
          <tr>
            <th className="left">Cód.</th>
            <th className="left">Conta</th>
            <th>SF Sistema</th>
            <th>SF ECD</th>
            <th>Δ Saldo Final</th>
          </tr>
        </thead>
        <tbody>
          {linhas.map((l) => {
            const isAnal = l.indicador === "A";
            const isSint = l.indicador === "S";
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
                >
                  <td className="cod">{l.codigo}</td>
                  <td className="conta" data-nivel={String(lvl)} title={l.descricao}>
                    {l.descricao}
                  </td>
                  <td className="val">{formatarSaldo(l.dominio.saldoFinal)}</td>
                  <td className="val">{formatarSaldo(l.ecd.saldoFinal)}</td>
                  <td
                    className={`val ${
                      Math.abs(l.diferencas.saldoFinal) > TOL ? "dif" : "num-null"
                    }`}
                  >
                    {formatarDelta(l.diferencas.saldoFinal)}
                  </td>
                </tr>
                {isExpandida && isAnal && (
                  <tr className="drilldown">
                    <td colSpan={5}>
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

/** Formato pt-BR sem prefixo R$ (economiza largura de coluna). */
function numeroSemMoeda(v: number): string {
  return v.toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formatarSaldo(v: number): React.ReactNode {
  if (Math.abs(v) < 0.005) return <span className="num-null">—</span>;
  return numeroSemMoeda(v);
}

function formatarDelta(v: number): React.ReactNode {
  if (Math.abs(v) <= TOL) return <span className="num-null">—</span>;
  return numeroSemMoeda(v);
}

// ---------------------------------------------------------------------------
// DetalhamentoConta — bloco expandido embaixo de uma analítica divergente
// mostrando SI/Deb/Cred/SF Sistema × ECD × Δ.
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
