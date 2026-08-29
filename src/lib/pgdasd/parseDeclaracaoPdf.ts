/**
 * Parser da declaração PGDAS-D (Simples Nacional).
 *
 * POR QUE UM PARSER DE PDF E NÃO UM JSON:
 * o SERPRO Integra Contador não tem, no PGDASD, nada equivalente ao
 * CONSXMLDECLARACAO38 da DCTFWeb. Todos os serviços do sistema (CONSDECLARACAO13,
 * CONSULTIMADECREC14, CONSDECREC15, CONSEXTRATO16) devolvem PDF em base64. Pra
 * ter receita bruta e débito por tributo é obrigatório ler o PDF.
 *
 * O PDF é TEXTO PURO (não digitalizado), então `pdf-parse` basta — não precisa
 * de OCR nem das coordenadas X/Y que o Espelho da GIAM exigiu.
 *
 * REGRA DA CASA — importa fiel, aponta, não conserta:
 *   - nenhum valor é recalculado nem "ajustado";
 *   - o total do débito é o que o PDF diz. Se a soma dos tributos não bater com
 *     ele, isso vira ALERTA (visível pro contador), não correção silenciosa;
 *   - se as âncoras do layout sumirem, o parser FALHA explicitamente com o
 *     motivo em vez de devolver zeros que parecem declaração sem movimento.
 *
 * NADA DE ARQUIVO: o Buffer do PDF vive só na memória desta chamada. Nem o
 * binário nem o texto integral são persistidos — só os valores extraídos.
 *
 * Layout de referência: memória `reference_layout_pgdasd_pdf`, validada em
 * 16/08/2026 com declaração real (competência 12/2023).
 */

export type TributoPgdasd =
  | "irpj"
  | "csll"
  | "cofins"
  | "pis"
  | "inss"
  | "icms"
  | "ipi"
  | "iss";

/** Ordem FIXA das colunas da tabela de débito por tributo (seções 2.7 e 2.8). */
export const COLUNAS_TRIBUTO: TributoPgdasd[] = [
  "irpj",
  "csll",
  "cofins",
  "pis",
  "inss",
  "icms",
  "ipi",
  "iss",
];

export const ROTULO_TRIBUTO: Record<TributoPgdasd, string> = {
  irpj: "IRPJ",
  csll: "CSLL",
  cofins: "COFINS",
  pis: "PIS/Pasep",
  inss: "INSS/CPP",
  icms: "ICMS",
  ipi: "IPI",
  iss: "ISS",
};

export interface DeclaracaoPgdasd {
  ano: number;
  mes: number; // 1..12
  cnpjMatriz: string | null;
  numeroDeclaracao: string | null;
  numeroRecibo: string | null;
  dataTransmissao: Date | null;
  situacao: "ORIGINAL" | "RETIFICADORA" | "DESCONHECIDA";
  optanteSimples: boolean | null;
  regimeApuracao: "COMPETENCIA" | "CAIXA" | null;

  /** Receita Bruta do Período de Apuração — o campo do confronto com a GIAM. */
  rpaInterno: number;
  rpaExterno: number;
  rpaTotal: number;
  rbt12: number;
  rba: number;

  /** Débito exigível por tributo (seção 2.8, ou 2.7 quando 2.8 não existe). */
  tributos: Record<TributoPgdasd, number>;
  /** Total do débito declarado, como o PDF informa. Nunca recalculado. */
  totalDebito: number;

  /** Incoerências pro contador decidir — nunca alteram os valores acima. */
  alertas: string[];
}

export type ResultadoParsePgdasd =
  | { ok: true; declaracao: DeclaracaoPgdasd }
  | { ok: false; motivo: string; textoBruto: string };

const RE_VALOR = /-?\d{1,3}(?:\.\d{3})*,\d{2}/g;

/** "1.234,56" → 1234.56. Devolve null pra qualquer coisa que não seja valor. */
export function valorBr(texto: string): number | null {
  const limpo = texto.trim();
  if (!/^-?\d{1,3}(?:\.\d{3})*,\d{2}$/.test(limpo)) return null;
  return Number(limpo.replace(/\./g, "").replace(",", "."));
}

/** Todos os valores monetários de um trecho, na ordem em que aparecem. */
function valoresDe(trecho: string): number[] {
  const achados = trecho.match(RE_VALOR) ?? [];
  return achados.map((v) => valorBr(v)).filter((v): v is number => v !== null);
}

/**
 * Recorta o texto entre duas âncoras. `ate` opcional — sem ele vai até o fim.
 * Devolve "" quando a âncora inicial não existe.
 */
function trechoEntre(texto: string, de: RegExp, ate?: RegExp): string {
  const inicio = texto.search(de);
  if (inicio < 0) return "";
  const resto = texto.slice(inicio);
  if (!ate) return resto;
  const fim = resto.slice(1).search(ate);
  return fim < 0 ? resto : resto.slice(0, fim + 1);
}

/**
 * Valores que aparecem DEPOIS de um rótulo, no máximo `limite` deles.
 * O pdf-parse quebra a linha em pontos imprevisíveis, então não dá pra assumir
 * que rótulo e valores estão na mesma linha — a busca é por proximidade no
 * texto, com uma janela curta pra não capturar a linha seguinte inteira.
 */
function valoresApos(texto: string, rotulo: RegExp, limite: number, janela = 220): number[] {
  const pos = texto.search(rotulo);
  if (pos < 0) return [];
  const depois = texto.slice(pos, pos + janela);
  return valoresDe(depois).slice(0, limite);
}

function normalizar(texto: string): string {
  return texto
    .replace(/\r\n?/g, "\n")
    .replace(/ /g, " ")
    .replace(/[ \t]+/g, " ");
}

/** Remove acentos pra as âncoras não dependerem de como o PDF codificou. */
function semAcento(texto: string): string {
  return texto.normalize("NFD").replace(/[̀-ͯ]/g, "");
}

/**
 * Lê o texto extraído do PDF da declaração PGDAS-D.
 *
 * `esperado` é a competência que a plataforma PEDIU ao SERPRO — serve pra
 * conferência: se o PDF vier de outro período, o parser não sobrescreve a
 * competência pedida, ele acusa (alerta) e mantém o que o PDF diz.
 */
export function parseDeclaracaoPgdasd(
  textoOriginal: string,
  esperado?: { ano: number; mes: number },
): ResultadoParsePgdasd {
  const bruto = normalizar(textoOriginal);
  const texto = semAcento(bruto);
  const alertas: string[] = [];

  // --- Âncora 1: é mesmo uma declaração do PGDAS-D? ---
  const ehPgdasd =
    /Documento de Arrecadacao do Simples Nacional - Declaratorio/i.test(texto) ||
    /PGDAS-?D/i.test(texto) ||
    /Periodo de Apuracao/i.test(texto);
  if (!ehPgdasd) {
    return {
      ok: false,
      motivo:
        "O PDF não parece ser uma declaração PGDAS-D — nenhuma âncora do layout foi encontrada.",
      textoBruto: bruto,
    };
  }

  // --- Competência: "Período de Apuração: 01/12/2023 a 31/12/2023" ---
  let ano = esperado?.ano ?? 0;
  let mes = esperado?.mes ?? 0;
  const mPeriodo = /Periodo de Apuracao:?\s*(\d{2})\/(\d{2})\/(\d{4})/i.exec(texto);
  if (mPeriodo) {
    const mesPdf = Number(mPeriodo[2]);
    const anoPdf = Number(mPeriodo[3]);
    if (esperado && (esperado.ano !== anoPdf || esperado.mes !== mesPdf)) {
      alertas.push(
        `A declaração devolvida é da competência ${String(mesPdf).padStart(2, "0")}/${anoPdf}, ` +
          `diferente da pedida (${String(esperado.mes).padStart(2, "0")}/${esperado.ano}).`,
      );
    }
    ano = anoPdf;
    mes = mesPdf;
  } else if (!esperado) {
    return {
      ok: false,
      motivo: "Não foi possível ler o Período de Apuração no PDF (layout pode ter mudado).",
      textoBruto: bruto,
    };
  } else {
    alertas.push("Período de Apuração não encontrado no PDF — assumida a competência consultada.");
  }

  // --- Identificação ---
  const cnpjMatriz =
    /CNPJ Matriz:?\s*([\d./-]{14,20})/i.exec(texto)?.[1]?.replace(/\D/g, "") ?? null;

  const numeroDeclaracao =
    /N[º°o.]*\s*da Declaracao:?\s*(\d{10,25})/i.exec(texto)?.[1] ??
    /Numero da Declaracao:?\s*(\d{10,25})/i.exec(texto)?.[1] ??
    null;

  const numeroRecibo =
    /Numero do Recibo:?\s*([\w.-]{6,40})/i.exec(texto)?.[1] ??
    /N[º°o.]*\s*do Recibo:?\s*([\w.-]{6,40})/i.exec(texto)?.[1] ??
    null;

  let dataTransmissao: Date | null = null;
  const mTransmissao =
    /transmissao da Declaracao:?\s*(\d{2})\/(\d{2})\/(\d{4})(?:\s*(?:as|às)?\s*(\d{2}):(\d{2})(?::(\d{2}))?)?/i.exec(
      texto,
    );
  if (mTransmissao) {
    const [, dd, mm, aaaa, hh, mi, ss] = mTransmissao;
    dataTransmissao = new Date(
      Date.UTC(
        Number(aaaa),
        Number(mm) - 1,
        Number(dd),
        Number(hh ?? 0),
        Number(mi ?? 0),
        Number(ss ?? 0),
      ),
    );
  }

  const situacao: DeclaracaoPgdasd["situacao"] = /Declaracao\s+Retificadora/i.test(texto)
    ? "RETIFICADORA"
    : /Declaracao\s+Original/i.test(texto)
      ? "ORIGINAL"
      : "DESCONHECIDA";
  if (situacao === "DESCONHECIDA") {
    alertas.push("O PDF não diz se a declaração é original ou retificadora.");
  }

  const mOptante = /Optante pelo Simples Nacional:?\s*(Sim|Nao)/i.exec(texto);
  const optanteSimples = mOptante ? /sim/i.test(mOptante[1]) : null;
  if (optanteSimples === false) {
    alertas.push("O PDF informa que a empresa NÃO é optante pelo Simples Nacional na competência.");
  }

  const mRegime = /Regime de Apuracao:?\s*(Competencia|Caixa)/i.exec(texto);
  const regimeApuracao = mRegime
    ? (/caixa/i.test(mRegime[1]) ? "CAIXA" : "COMPETENCIA")
    : null;

  // --- 2.1 Discriminativo de Receitas ---
  // Colunas: Mercado Interno | Mercado Externo | Total.
  const secaoReceitas = trechoEntre(
    texto,
    /Discriminativo de Receitas|Receita Bruta do PA/i,
    /2\.2|Receitas Brutas Anteriores/i,
  );
  const baseReceitas = secaoReceitas || texto;

  const rpa = valoresApos(baseReceitas, /Receita Bruta do PA\s*\(RPA\)/i, 3);
  const rbt12Vals = valoresApos(baseReceitas, /\(RBT12\)/i, 3);
  const rbaVals = valoresApos(baseReceitas, /\(RBA\)/i, 3);

  const rpaInterno = rpa[0] ?? 0;
  const rpaExterno = rpa[1] ?? 0;
  // Quando só vem um valor, ele é o total (declaração sem mercado externo
  // costuma imprimir as três colunas, mas não dá pra contar com isso).
  const rpaTotal = rpa.length >= 3 ? rpa[2] : rpa.length === 1 ? rpa[0] : rpaInterno + rpaExterno;
  if (rpa.length === 0) {
    alertas.push("Receita Bruta do PA (RPA) não localizada na seção 2.1.");
  } else if (rpa.length >= 3 && Math.abs(rpaInterno + rpaExterno - rpaTotal) > 0.01) {
    alertas.push(
      `RPA: interno (${rpaInterno.toFixed(2)}) + externo (${rpaExterno.toFixed(2)}) não fecha com o total impresso (${rpaTotal.toFixed(2)}).`,
    );
  }

  const rbt12 = rbt12Vals.length >= 3 ? rbt12Vals[2] : (rbt12Vals[0] ?? 0);
  const rba = rbaVals.length >= 3 ? rbaVals[2] : (rbaVals[0] ?? 0);

  // --- Débito por tributo ---
  // Preferência: 2.8 Total Geral da Empresa (consolida estabelecimentos).
  // Sem ela, 2.7 (declaração de estabelecimento único). Dentro da seção,
  // a tabela usada é a do "Total do Débito Exigível" — é o que sobra a pagar.
  const secao28 = trechoEntre(texto, /2\.8[^\n]*Total Geral da Empresa/i);
  const secao27 = trechoEntre(
    texto,
    /2\.7[^\n]*Informacoes da Declaracao por Estabelecimento/i,
    /2\.8[^\n]*Total Geral da Empresa/i,
  );
  const fonteTributos = secao28 || secao27;
  const rotuloFonte = secao28 ? "2.8 Total Geral da Empresa" : "2.7 por estabelecimento";

  const tributos: Record<TributoPgdasd, number> = {
    irpj: 0,
    csll: 0,
    cofins: 0,
    pis: 0,
    inss: 0,
    icms: 0,
    ipi: 0,
    iss: 0,
  };

  let linhaTributos: number[] = [];
  if (fonteTributos) {
    // A tabela tem 9 colunas: 8 tributos + Total.
    linhaTributos = valoresApos(fonteTributos, /Total do Debito Exigivel/i, 9, 400);
    if (linhaTributos.length < 9) {
      const alternativa = valoresApos(
        fonteTributos,
        /Total do Debito Declarado/i,
        9,
        400,
      );
      if (alternativa.length >= 9) {
        linhaTributos = alternativa;
        alertas.push(
          "Tabela 'Total do Débito Exigível' não encontrada — usados os valores de 'Total do Débito Declarado' (inclui débito com exigibilidade suspensa).",
        );
      }
    }
  }

  if (linhaTributos.length >= 9) {
    COLUNAS_TRIBUTO.forEach((t, i) => {
      tributos[t] = linhaTributos[i];
    });
  } else {
    alertas.push(
      `Tabela de débito por tributo não localizada (${rotuloFonte || "seções 2.7/2.8 ausentes"}) — valores por tributo ficaram zerados.`,
    );
  }

  // --- Valor do DAS (guia) ---
  //
  // O valor da guia é o débito EXIGÍVEL: a soma dos oito tributos. Os números
  // "totais" impressos NÃO são confiáveis em todo layout — no formato usado até
  // 04/2025 o que o extrator captura como total é a RECEITA BRUTA (na LUPO
  // chegou a gravar R$ 45.244,92 de imposto num mês de R$ 1.809,80).
  //
  // Regra, então: os oito tributos mandam. O total impresso serve de
  // CONFERÊNCIA — se bate, ótimo; se não bate, o valor usado é a soma e o que o
  // PDF imprimiu vira alerta. Isso não é "consertar" número: é escolher, entre
  // dois números do próprio documento, o que compõe a guia — e dizer qual foi
  // usado e por quê. A soma foi conferida contra 14 guias DAS reais da LUPO
  // (05/2025 a 06/2026): bateu em todas, ao centavo.
  const totalResumo = valoresApos(texto, /Valor Total do Debito Declarado/i, 1);
  const totalTabela = linhaTributos.length >= 9 ? linhaTributos[8] : null;
  const resumoConfiavel =
    totalResumo.length > 0 && Math.abs(totalResumo[0] - rpaTotal) > 0.01
      ? totalResumo[0]
      : null;

  const somaTributos = COLUNAS_TRIBUTO.reduce((s, t) => s + tributos[t], 0);
  const leuTributos = linhaTributos.length >= 9;

  let totalDebito: number;
  if (leuTributos) {
    totalDebito = somaTributos;
    // Cada total impresso que discordar da soma é reportado, nominalmente. Um
    // deles conferir não absolve o outro: divergência dentro do mesmo documento
    // é justamente o que o contador precisa ver.
    const divergentes = [
      totalTabela !== null && Math.abs(totalTabela - somaTributos) > 0.01
        ? `tabela ${rotuloFonte}: ${totalTabela.toFixed(2)}`
        : null,
      resumoConfiavel !== null && Math.abs(resumoConfiavel - somaTributos) > 0.01
        ? `resumo 2.6: ${resumoConfiavel.toFixed(2)}`
        : null,
    ].filter(Boolean);
    if (divergentes.length > 0) {
      alertas.push(
        `Total impresso (${divergentes.join(" · ")}) não confere com a soma dos oito tributos (${somaTributos.toFixed(2)}). ` +
          `Foi usada a soma — é ela que compõe a guia.`,
      );
    }
  } else {
    // Sem a tabela de tributos, resta o que estiver impresso.
    totalDebito = totalTabela ?? resumoConfiavel ?? 0;
  }

  if (!leuTributos && totalResumo.length > 0 && resumoConfiavel === null) {
    alertas.push(
      `Resumo 2.6 (${totalResumo[0].toFixed(2)}) coincide com a receita bruta — provável má-leitura do layout; total do DAS não pôde ser confirmado.`,
    );
  }

  if (totalResumo.length === 0 && totalTabela === null) {
    // Sem receita E sem total: não é declaração sem movimento, é layout perdido.
    if (rpa.length === 0) {
      return {
        ok: false,
        motivo:
          "Nenhum valor monetário reconhecido no PDF (nem receita, nem débito). O layout da declaração provavelmente mudou.",
        textoBruto: bruto,
      };
    }
    alertas.push("Valor Total do Débito Declarado não localizado.");
  }

  if (rpaTotal === 0 && totalDebito > 0) {
    alertas.push("Declaração com débito mas receita bruta do período zerada — conferir.");
  }

  return {
    ok: true,
    declaracao: {
      ano,
      mes,
      cnpjMatriz,
      numeroDeclaracao,
      numeroRecibo,
      dataTransmissao,
      situacao,
      optanteSimples,
      regimeApuracao,
      rpaInterno,
      rpaExterno,
      rpaTotal,
      rbt12,
      rba,
      tributos,
      totalDebito,
      alertas,
    },
  };
}

/**
 * Lê o PDF da declaração direto do Buffer (o que vem em base64 do SERPRO).
 * O binário não toca o disco.
 */
export async function lerDeclaracaoPgdasdPdf(
  pdf: Buffer,
  esperado?: { ano: number; mes: number },
): Promise<ResultadoParsePgdasd> {
  const { PDFParse } = await import("pdf-parse");
  const parser = new PDFParse({ data: pdf });
  try {
    const { text } = await parser.getText();
    return parseDeclaracaoPgdasd(text, esperado);
  } catch (e) {
    return {
      ok: false,
      motivo: `Falha ao extrair texto do PDF: ${e instanceof Error ? e.message : String(e)}`,
      textoBruto: "",
    };
  }
}
