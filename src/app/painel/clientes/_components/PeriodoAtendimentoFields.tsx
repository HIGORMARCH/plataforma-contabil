/**
 * Período de atendimento pelo escritório + vigência da inscrição estadual.
 *
 * Decidido com o Higor em 16/08/2026 a partir do caso LUPO QUIOSQUE: a
 * auditoria acusava 07/2019 e 07/2026 como declaração faltando quando eram, na
 * verdade, meses fora da relação com o escritório e anteriores à obtenção da IE.
 *
 * Preenchido aqui, isso serve pra duas coisas:
 *   - os robôs (SEFAZ, Portal Simples e SERPRO, que é pago) param de consultar
 *     competência que ninguém atendeu;
 *   - as telas marcam essas competências como "fora do período" em vez de lacuna.
 *
 * Campos vazios significam "sem restrição" — cadastro antigo não preenchido não
 * deve esconder competência nenhuma.
 */

interface Props {
  valores?: {
    atendimentoInicio?: Date | null;
    atendimentoFim?: Date | null;
    ieInicio?: Date | null;
    ieFim?: Date | null;
  };
}

/** Date → "AAAA-MM" pro `<input type="month">`. */
function paraMes(d?: Date | null): string | undefined {
  if (!d) return undefined;
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function PeriodoAtendimentoFields({ valores }: Props) {
  return (
    <section className="card p-5">
      <h2 className="mb-1 text-sm font-bold uppercase tracking-wide text-slate-500">
        Período de atendimento
      </h2>
      <p className="mb-4 max-w-[70ch] text-xs text-slate-500">
        Delimita o que a plataforma cobra e o que os robôs consultam. Competência fora deste
        intervalo aparece como <strong>fora do período</strong>, não como declaração faltando — e
        nenhum portal é consultado à toa. Deixe em branco se não houver restrição.
      </p>
      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <label className="label" htmlFor="atendimentoInicio">
            Início do atendimento
          </label>
          <input
            type="month"
            id="atendimentoInicio"
            name="atendimentoInicio"
            defaultValue={paraMes(valores?.atendimentoInicio)}
            className="input"
          />
          <p className="mt-1 text-xs text-slate-400">
            Primeira competência que o escritório atendeu.
          </p>
        </div>
        <div>
          <label className="label" htmlFor="atendimentoFim">
            Fim do atendimento
          </label>
          <input
            type="month"
            id="atendimentoFim"
            name="atendimentoFim"
            defaultValue={paraMes(valores?.atendimentoFim)}
            className="input"
          />
          <p className="mt-1 text-xs text-slate-400">
            Última competência atendida. <strong>Em branco = cliente ativo.</strong>
          </p>
        </div>
        <div>
          <label className="label" htmlFor="ieInicio">
            Inscrição estadual — início da vigência
          </label>
          <input
            type="month"
            id="ieInicio"
            name="ieInicio"
            defaultValue={paraMes(valores?.ieInicio)}
            className="input"
          />
          <p className="mt-1 text-xs text-slate-400">
            Antes disso não existe GIAM a exigir, mesmo com movimento no Domínio.
          </p>
        </div>
        <div>
          <label className="label" htmlFor="ieFim">
            Inscrição estadual — fim da vigência
          </label>
          <input
            type="month"
            id="ieFim"
            name="ieFim"
            defaultValue={paraMes(valores?.ieFim)}
            className="input"
          />
          <p className="mt-1 text-xs text-slate-400">
            Preencher só se a inscrição foi baixada.
          </p>
        </div>
      </div>
    </section>
  );
}
