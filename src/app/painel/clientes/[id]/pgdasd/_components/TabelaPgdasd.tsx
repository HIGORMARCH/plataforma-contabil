"use client";

import { Fragment, useState } from "react";

export interface LinhaPgdasd {
  id: string;
  competenciaLabel: string;
  situacao: string;
  numeroDeclaracao: string | null;
  numeroRecibo: string | null;
  dataTransmissao: string | null; // já formatada no servidor
  rpaTotal: number;
  /** Valor unificado do DAS — o número que importa. */
  totalDebito: number;
  /** Composição, só aparece ao abrir a linha. */
  tributos: Array<{ rotulo: string; valor: number }>;
  alertas: string[];
}

const fmtBrl = new Intl.NumberFormat("pt-BR", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/**
 * Uma linha por competência com o TOTAL DO DAS em destaque — é o número que o
 * contador precisa. A composição por tributo (IRPJ, CSLL, COFINS, PIS, INSS,
 * ICMS, IPI, ISS) fica atrás de um clique: existe pra conferência, não pra
 * disputar atenção com o total.
 */
export function TabelaPgdasd({ linhas }: { linhas: LinhaPgdasd[] }) {
  const [aberta, setAberta] = useState<string | null>(null);

  const totalRpa = linhas.reduce((s, l) => s + l.rpaTotal, 0);
  const totalDas = linhas.reduce((s, l) => s + l.totalDebito, 0);

  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
          <th className="py-2 text-left font-semibold">Competência</th>
          <th className="text-left font-semibold">Declaração</th>
          <th className="text-right font-semibold">Receita bruta do PA</th>
          <th className="text-right font-semibold">Total do DAS</th>
          <th className="w-24 text-right font-semibold">Composição</th>
        </tr>
      </thead>
      <tbody>
        {linhas.map((l) => {
          const aberto = aberta === l.id;
          return (
            <Fragment key={l.id}>
              <tr className="border-b border-slate-100">
                <td className="py-2 text-left font-mono">
                  {l.competenciaLabel}
                  {l.alertas.length > 0 && (
                    <span title={l.alertas.join(" · ")} className="ml-1 text-amber-600">
                      ⚠
                    </span>
                  )}
                </td>
                <td className="text-left text-xs text-slate-500">
                  <span
                    className={
                      l.situacao === "RETIFICADORA"
                        ? "font-semibold text-amber-700"
                        : "text-slate-600"
                    }
                  >
                    {l.situacao === "RETIFICADORA" ? "Retificadora" : "Original"}
                  </span>
                  {l.numeroRecibo && (
                    <span className="ml-2 font-mono text-[10px] text-slate-400">
                      recibo {l.numeroRecibo}
                    </span>
                  )}
                  {l.dataTransmissao && (
                    <span className="ml-2 text-[10px] text-slate-400">
                      transmitida {l.dataTransmissao}
                    </span>
                  )}
                </td>
                <td className="text-right font-mono text-slate-600">
                  {fmtBrl.format(l.rpaTotal)}
                </td>
                <td className="text-right font-mono text-base font-semibold text-slate-800">
                  {fmtBrl.format(l.totalDebito)}
                </td>
                <td className="text-right">
                  <button
                    type="button"
                    onClick={() => setAberta(aberto ? null : l.id)}
                    className="rounded border border-slate-300 px-2 py-0.5 text-xs text-slate-600 hover:bg-slate-50"
                  >
                    {aberto ? "fechar" : "ver"}
                  </button>
                </td>
              </tr>
              {aberto && (
                <tr className="border-b border-slate-100 bg-slate-50">
                  <td colSpan={5} className="px-4 py-3">
                    <p className="mb-2 text-xs text-slate-500">
                      Composição do DAS de {l.competenciaLabel}
                      {l.numeroDeclaracao && (
                        <> · declaração nº <span className="font-mono">{l.numeroDeclaracao}</span></>
                      )}
                    </p>
                    <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs">
                      {l.tributos
                        .filter((t) => t.valor !== 0)
                        .map((t) => (
                          <span key={t.rotulo} className="font-mono">
                            <span className="text-slate-500">{t.rotulo}</span>{" "}
                            {fmtBrl.format(t.valor)}
                          </span>
                        ))}
                      {l.tributos.every((t) => t.valor === 0) && (
                        <span className="text-slate-500">
                          Declaração sem débito por tributo.
                        </span>
                      )}
                    </div>
                    {l.alertas.length > 0 && (
                      <ul className="mt-2 list-disc pl-4 text-xs text-amber-800">
                        {l.alertas.map((a, i) => (
                          <li key={i}>{a}</li>
                        ))}
                      </ul>
                    )}
                  </td>
                </tr>
              )}
            </Fragment>
          );
        })}
        <tr className="border-t-2 border-slate-300 font-semibold">
          <td className="py-2 text-left" colSpan={2}>
            Total do período ({linhas.length} competência(s))
          </td>
          <td className="text-right font-mono">{fmtBrl.format(totalRpa)}</td>
          <td className="text-right font-mono text-base">{fmtBrl.format(totalDas)}</td>
          <td />
        </tr>
      </tbody>
    </table>
  );
}
