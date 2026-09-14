/**
 * Leitor do PDF "Recibo de Entrega da DCTFWeb" (e-CAC → DCTFWeb → Visualizar
 * Recibo). O recibo transcreve a Ficha Resumo: débito apurado e saldo a pagar
 * por tributo — é o que foi confessado.
 *
 * Recebe as linhas de texto do PDF e devolve o que o recibo diz, sem ajustar.
 * Soma dos tributos que não bate com o TOTAL impresso vira alerta.
 *
 * Layout conferido com o recibo de 12/2024 da Casa São Paulo.
 */

export interface TributoReciboDctfWeb {
  /** Como impresso: "Contribuição Previdenciária Patronal", "IRPJ", "CSLL"… */
  tributo: string;
  debitoApurado: number;
  saldoAPagar: number;
}

export interface ReciboDctfWebPdf {
  cnpj: string | null;
  nome: string | null;
  /** Primeiro dia do mês do período (UTC). Categoria anual (13º) usa janeiro do ano. */
  periodoApuracao: Date | null;
  /** "12/2024" ou só "2024" quando a declaração é anual (13º salário). */
  periodoTexto: string | null;
  anual: boolean;
  retificadora: boolean | null;
  /** Ex.: "29788160412 / eSocial" */
  identificacaoApuracao: string | null;
  tributos: TributoReciboDctfWeb[];
  totalDebitoApurado: number | null;
  totalSaldoAPagar: number | null;
  recebidaEm: Date | null;
  numeroRecibo: string | null;
  alertas: string[];
}

function valor(s: string): number {
  const n = Number(s.replace(/\./g, "").replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}

const NUM = "(-?[\\d.]+,\\d{2})";

export function parseReciboDctfWebPdf(linhas: string[]): ReciboDctfWebPdf {
  const res: ReciboDctfWebPdf = {
    cnpj: null,
    nome: null,
    periodoApuracao: null,
    periodoTexto: null,
    anual: false,
    retificadora: null,
    identificacaoApuracao: null,
    tributos: [],
    totalDebitoApurado: null,
    totalSaldoAPagar: null,
    recebidaEm: null,
    numeroRecibo: null,
    alertas: [],
  };

  let naTabela = false;
  for (const bruta of linhas) {
    const l = bruta.trim();
    let m: RegExpExecArray | null;

    if (!res.cnpj && (m = /^CNPJ\/CPF\s+([\d./-]+)/.exec(l))) { res.cnpj = m[1].replace(/\D/g, ""); continue; }
    if (!res.nome && (m = /^Nome\s+(\S.*)$/.exec(l))) { res.nome = m[1].trim(); continue; }
    if (!res.periodoTexto && (m = /^Período de apuração\s+(?:(\d{2})\/)?(\d{4})\b/.exec(l))) {
      res.anual = !m[1];
      res.periodoTexto = m[1] ? `${m[1]}/${m[2]}` : m[2];
      res.periodoApuracao = new Date(Date.UTC(Number(m[2]), m[1] ? Number(m[1]) - 1 : 0, 1));
      continue;
    }
    if ((m = /^Declaração Retificadora\s+(Sim|Não)/i.exec(l))) { res.retificadora = /sim/i.test(m[1]); continue; }
    if ((m = /^Identificação da apuração de débitos\s+(\S.*)$/.exec(l))) { res.identificacaoApuracao = m[1].trim(); continue; }

    if (/^Tributos\s+Débitos Apurados\s+Saldo a Pagar/.test(l)) { naTabela = true; continue; }
    if (naTabela) {
      if ((m = new RegExp(`^TOTAL\\s+R\\$\\s*${NUM}\\s+R\\$\\s*${NUM}`).exec(l))) {
        res.totalDebitoApurado = valor(m[1]);
        res.totalSaldoAPagar = valor(m[2]);
        naTabela = false;
        continue;
      }
      if ((m = new RegExp(`^(\\S.*?)\\s+R\\$\\s*${NUM}\\s+R\\$\\s*${NUM}$`).exec(l))) {
        res.tributos.push({ tributo: m[1].trim(), debitoApurado: valor(m[2]), saldoAPagar: valor(m[3]) });
        continue;
      }
    }

    if ((m = /Agente Receptor SERPRO em\s+(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2}):(\d{2})/.exec(l))) {
      // Horário de Brasília (UTC-3), guardado em UTC.
      res.recebidaEm = new Date(
        Date.UTC(Number(m[3]), Number(m[2]) - 1, Number(m[1]), Number(m[4]) + 3, Number(m[5]), Number(m[6])),
      );
      continue;
    }
    if ((m = /^Nº do recibo de entrega\s+(\d+)/.exec(l))) { res.numeroRecibo = m[1]; continue; }
  }

  if (!res.cnpj) res.alertas.push("CNPJ não encontrado no recibo.");
  if (!res.periodoApuracao) res.alertas.push("Período de apuração não encontrado no recibo.");
  if (res.totalDebitoApurado === null) {
    res.alertas.push("Linha TOTAL não encontrada na totalização dos tributos.");
  } else {
    const somaDeb = res.tributos.reduce((s, t) => s + t.debitoApurado, 0);
    const somaSaldo = res.tributos.reduce((s, t) => s + t.saldoAPagar, 0);
    if (Math.abs(somaDeb - res.totalDebitoApurado) > 0.01) {
      res.alertas.push(`Tributos somam ${somaDeb.toFixed(2)} de débito, mas o TOTAL impresso é ${res.totalDebitoApurado.toFixed(2)}.`);
    }
    if (res.totalSaldoAPagar !== null && Math.abs(somaSaldo - res.totalSaldoAPagar) > 0.01) {
      res.alertas.push(`Tributos somam ${somaSaldo.toFixed(2)} de saldo a pagar, mas o TOTAL impresso é ${res.totalSaldoAPagar.toFixed(2)}.`);
    }
  }
  return res;
}
