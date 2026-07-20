import { requireSessao, PAPEIS_INTERNOS } from "@/lib/auth";
import { redirect } from "next/navigation";

/**
 * Conciliação — Pagamentos de Impostos Estaduais (ICMS).
 *
 * Irmã estadual da conciliação federal (/painel/auditoria-tributaria).
 *
 * Diferença de natureza, definida pelo Higor em 20/07/2026:
 *   - Federal  : APURADO × PAGO       (Domínio × e-CAC/SERPRO)
 *   - Estadual : GIAM × RAZÃO         (declarado à SEFAZ × contabilizado)
 *
 * Fontes (SEFAZ-TO, acesso por Inscrição Estadual + senha — NÃO é certificado):
 *   - GIAM  https://giam.sefaz.to.gov.br/        apuração mensal do ICMS (layout 10.0)
 *   - DIF   via https://contribuinte.sefaz.to.gov.br/   declaração anual
 *
 * ⚠️ O ICMS NÃO vem pelo e-CAC — aquilo é só federal.
 */
export default async function ConciliacaoEstadualPage() {
  const sessao = await requireSessao();
  if (!PAPEIS_INTERNOS.includes(sessao.papel)) redirect("/painel");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-800">
          Conciliação — Pagamentos de Impostos Estaduais
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          ICMS · confronto entre o que foi declarado à SEFAZ e o que está registrado na
          contabilidade
        </p>
      </div>

      <div className="rounded-xl border border-amber-200 bg-amber-50 px-5 py-4">
        <p className="text-sm font-semibold text-amber-900">Em construção</p>
        <p className="mt-1 text-sm text-amber-800">
          A tela está sendo montada. Abaixo, o que ela vai fazer.
        </p>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white px-5 py-4">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
          O confronto
        </h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <div className="rounded-lg border border-slate-200 px-4 py-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Coluna A</p>
            <p className="mt-1 font-semibold text-slate-800">GIAM</p>
            <p className="mt-1 text-sm text-slate-600">
              O ICMS <strong>declarado à SEFAZ</strong> — apuração mensal, entrega até o dia 9 do
              mês seguinte.
            </p>
          </div>
          <div className="rounded-lg border border-slate-200 px-4 py-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Coluna B</p>
            <p className="mt-1 font-semibold text-slate-800">Razão</p>
            <p className="mt-1 text-sm text-slate-600">
              O ICMS <strong>registrado na contabilidade</strong> — razão da conta de ICMS, vindo do
              Domínio.
            </p>
          </div>
        </div>
        <p className="mt-3 text-sm text-slate-600">
          Divergência entre os dois significa que <strong>ou a GIAM foi entregue errada</strong>,{" "}
          <strong>ou a contabilidade não reflete a apuração</strong> — nos dois casos, cabe
          providência.
        </p>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white px-5 py-4">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
          Diferença para a conciliação federal
        </h2>
        <p className="mt-2 text-sm text-slate-600">
          Na federal o confronto é <strong>apurado × pago</strong> (Domínio × e-CAC). Aqui é{" "}
          <strong>declarado × contabilizado</strong> (GIAM × Razão). São naturezas diferentes — o
          ICMS <strong>não</strong> passa pelo e-CAC, que só enxerga tributo federal.
        </p>
      </div>
    </div>
  );
}
