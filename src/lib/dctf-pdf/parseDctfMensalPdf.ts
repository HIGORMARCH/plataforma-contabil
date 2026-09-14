/**
 * Leitor do PDF da DCTF Mensal (antiga) — "Impressão da Declaração" do e-CAC
 * (Declarações e Demonstrativos → Extrato do Processamento – DCTF → imprimir).
 *
 * Recebe as linhas de texto do PDF (src/lib/extract/pdfText) e devolve o que a
 * declaração diz, sem ajustar nada: cada débito com o grupo do tributo, o
 * código de receita, o débito apurado, os créditos vinculados e o saldo a pagar.
 * Incoerência (soma que não fecha) vira alerta — o contador decide.
 *
 * Layout conferido com a DCTF de 12/2018 da Casa São Paulo (DCTF MENSAL 3.50).
 */

export interface DebitoDctfMensal {
  /** Ex.: "IRRF - IMPOSTO SOBRE A RENDA RETIDO NA FONTE" */
  grupoTributo: string;
  /** Código com variação, como impresso: "0561-07" */
  codigoReceitaCompleto: string;
  /** Só o código de receita: "0561" */
  codigoReceita: string;
  periodicidade: string | null;
  /** Como impresso: "Dezembro/2018", "1º Trimestre/2018"… */
  periodoApuracaoTexto: string | null;
  debitoApurado: number;
  pagamento: number;
  compensacoes: number;
  parcelamento: number;
  suspensao: number;
  somaCreditos: number | null;
  saldoAPagar: number;
}

export interface DctfMensalPdf {
  cnpj: string | null;
  /** Primeiro dia do mês do período (UTC). */
  periodoApuracao: Date | null;
  periodoTexto: string | null;
  numeroDeclaracao: string | null;
  numeroRecibo: string | null;
  dataRecepcao: Date | null;
  retificadora: boolean | null;
  situacao: string | null;
  formaTributacaoLucro: string | null;
  debitos: DebitoDctfMensal[];
  alertas: string[];
}

function valor(s: string | undefined): number {
  if (!s) return 0;
  const n = Number(s.replace(/\./g, "").replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}

function data(s: string | undefined): Date | null {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(s ?? "");
  return m ? new Date(Date.UTC(Number(m[3]), Number(m[2]) - 1, Number(m[1]))) : null;
}

const NUM = "(-?[\\d.]+,\\d{2})";

export function parseDctfMensalPdf(linhas: string[]): DctfMensalPdf {
  const res: DctfMensalPdf = {
    cnpj: null,
    periodoApuracao: null,
    periodoTexto: null,
    numeroDeclaracao: null,
    numeroRecibo: null,
    dataRecepcao: null,
    retificadora: null,
    situacao: null,
    formaTributacaoLucro: null,
    debitos: [],
    alertas: [],
  };

  let atual: DebitoDctfMensal | null = null;
  const fechar = () => {
    if (atual) res.debitos.push(atual);
    atual = null;
  };

  for (const bruta of linhas) {
    const l = bruta.trim();
    let m: RegExpExecArray | null;

    if (!res.cnpj && (m = /^CNPJ:\s*([\d./-]{18})\s+(\S.*)$/.exec(l))) {
      res.cnpj = m[1].replace(/\D/g, "");
      res.periodoTexto = m[2].trim();
      continue;
    }
    if ((m = /^Número da Declaração:\s*(\S+)/.exec(l))) { res.numeroDeclaracao = m[1]; continue; }
    if ((m = /^Número do Recibo:\s*(\S+)/.exec(l))) { res.numeroRecibo = m[1]; continue; }
    if ((m = /^Data de Recepção:\s*(\d{2}\/\d{2}\/\d{4})/.exec(l))) { res.dataRecepcao = data(m[1]); continue; }
    if (!res.periodoApuracao && (m = /^Período:\s*\d{2}\/(\d{2})\/(\d{4})\s+a\s+/.exec(l))) {
      res.periodoApuracao = new Date(Date.UTC(Number(m[2]), Number(m[1]) - 1, 1));
      continue;
    }
    if ((m = /^Declaração Retificadora:\s*(Sim|Não)/i.exec(l))) { res.retificadora = /sim/i.test(m[1]); continue; }
    if (!res.situacao && (m = /^Situação:\s*(\S.*)$/.exec(l))) { res.situacao = m[1].trim(); continue; }
    if ((m = /^Forma de Tributação do Lucro:\s*(\S.*)$/.exec(l))) { res.formaTributacaoLucro = m[1].trim(); continue; }

    // --- Débitos: um bloco por "GRUPO DO TRIBUTO" ---
    if ((m = /^GRUPO DO TRIBUTO\s*:\s*(\S.*)$/.exec(l))) {
      fechar();
      atual = {
        grupoTributo: m[1].trim(),
        codigoReceitaCompleto: "",
        codigoReceita: "",
        periodicidade: null,
        periodoApuracaoTexto: null,
        debitoApurado: 0,
        pagamento: 0,
        compensacoes: 0,
        parcelamento: 0,
        suspensao: 0,
        somaCreditos: null,
        saldoAPagar: 0,
      };
      continue;
    }
    if (!atual) continue;
    const d: DebitoDctfMensal = atual;
    if ((m = /^CÓDIGO RECEITA\s*:\s*(\d{4})(?:-(\d{2}))?/.exec(l))) {
      d.codigoReceita = m[1];
      d.codigoReceitaCompleto = m[2] ? `${m[1]}-${m[2]}` : m[1];
    } else if ((m = /^PERIODICIDADE:\s*(\S+)\s+PERÍODO DE APURAÇÃO:\s*(\S.*)$/.exec(l))) {
      d.periodicidade = m[1];
      d.periodoApuracaoTexto = m[2].trim();
    } else if ((m = new RegExp(`^DÉBITO APURADO\\s+${NUM}`).exec(l))) {
      d.debitoApurado = valor(m[1]);
    } else if ((m = new RegExp(`^-\\s*PAGAMENTO\\s+${NUM}`).exec(l))) {
      d.pagamento = valor(m[1]);
    } else if ((m = new RegExp(`^-\\s*COMPENSAÇÕES\\s+${NUM}`).exec(l))) {
      d.compensacoes = valor(m[1]);
    } else if ((m = new RegExp(`^-\\s*PARCELAMENTO\\s+${NUM}`).exec(l))) {
      d.parcelamento = valor(m[1]);
    } else if ((m = new RegExp(`^-\\s*SUSPENSÃO\\s+${NUM}`).exec(l))) {
      d.suspensao = valor(m[1]);
    } else if ((m = new RegExp(`^SOMA DOS CRÉDITOS VINCULADOS:\\s*${NUM}`).exec(l))) {
      d.somaCreditos = valor(m[1]);
    } else if ((m = new RegExp(`^SALDO A PAGAR DO DÉBITO:\\s*${NUM}`).exec(l))) {
      d.saldoAPagar = valor(m[1]);
      fechar();
    }
  }
  fechar();

  // --- Incoerências: apontadas, nunca corrigidas ---
  if (!res.cnpj) res.alertas.push("CNPJ não encontrado no cabeçalho da declaração.");
  if (!res.periodoApuracao) res.alertas.push("Período da declaração não encontrado.");
  for (const d of res.debitos) {
    const creditos = d.pagamento + d.compensacoes + d.parcelamento + d.suspensao;
    const rotulo = `${d.codigoReceitaCompleto || d.grupoTributo}`;
    if (d.somaCreditos !== null && Math.abs(creditos - d.somaCreditos) > 0.01) {
      res.alertas.push(`${rotulo}: créditos somam ${creditos.toFixed(2)} mas a declaração imprime ${d.somaCreditos.toFixed(2)}.`);
    }
    if (Math.abs(d.debitoApurado - creditos - d.saldoAPagar) > 0.01) {
      res.alertas.push(
        `${rotulo}: débito ${d.debitoApurado.toFixed(2)} − créditos ${creditos.toFixed(2)} ≠ saldo a pagar ${d.saldoAPagar.toFixed(2)}.`,
      );
    }
  }
  return res;
}
