/**
 * Classificador de documentos — o que é este arquivo, de quem é e de quando.
 *
 * A decisão é sempre pelo CONTEÚDO, nunca pelo nome. Nome de arquivo do
 * escritório é criativo demais: `PGDASD-DAS-05.2025.pdf`,
 * `PGD-DAS-02.2026957F_TR.pdf` e `PAGAMENTO 2025.pdf` estão na mesma pasta e são
 * três documentos diferentes.
 *
 * A única exceção é o razão do Domínio: dois razões são idênticos em estrutura e
 * o que muda é a conta. Aí a ordem é: nome da CONTA no cabeçalho primeiro, nome
 * do arquivo depois.
 *
 * REGRA DE OURO: na dúvida, não classifica. Documento arquivado no lugar errado
 * entra em conciliação e vira número falso; documento em quarentena só espera.
 */

import { detectarTributoPeloNome, type TributoRazao } from "@/lib/razao/tributos";

export type TipoDocumento =
  | "SPED_ECD"
  | "SPED_ECF"
  | "SPED_FISCAL"
  | "SPED_CONTRIBUICOES"
  | "DCTF_ANTIGA"
  | "DCTFWEB"
  | "DAS_GUIA"
  | "PGDASD_DECLARACAO"
  | "COMPROVANTE_ARRECADACAO"
  | "RAZAO"
  | "BALANCO_DOMINIO"
  | "DRE_DOMINIO"
  | "GIAM_ARQUIVO"
  | "GIAM_ESPELHO";

export const ROTULO_TIPO: Record<TipoDocumento, string> = {
  SPED_ECD: "SPED-ECD",
  SPED_ECF: "SPED-ECF",
  SPED_FISCAL: "SPED-Fiscal",
  SPED_CONTRIBUICOES: "SPED-Contribuições",
  DCTF_ANTIGA: "DCTF antiga (.dec)",
  DCTFWEB: "DCTFWeb (XML)",
  DAS_GUIA: "Guia do DAS",
  PGDASD_DECLARACAO: "Declaração PGDAS-D",
  COMPROVANTE_ARRECADACAO: "Comprovante de Arrecadação",
  RAZAO: "Razão do Domínio",
  BALANCO_DOMINIO: "Balanço (Domínio)",
  DRE_DOMINIO: "DRE (Domínio)",
  GIAM_ARQUIVO: "GIAM (arquivo do Domínio)",
  GIAM_ESPELHO: "Espelho da GIAM",
};

export interface Classificacao {
  tipo: TipoDocumento;
  /** Ano de referência do documento. */
  ano: number | null;
  /** Mês, nos documentos mensais. */
  mes: number | null;
  /** CNPJ (14 dígitos) encontrado no conteúdo — é assim que se acha o cliente. */
  cnpj: string | null;
  /** Inscrição estadual, quando é o identificador (GIAM). */
  inscricaoEstadual: string | null;
  /** Tributo, só para o razão. */
  tributo: TributoRazao | null;
  /** Código da conta contábil (razão) — desempata dois razões do mesmo tributo. */
  contaCodigo: string | null;
  /** Quantos documentos o arquivo contém (o comprovante traz o ano inteiro). */
  documentos: number;
  /** O que sustentou a decisão — vai pro relatório. */
  evidencia: string;
}

export type ResultadoClassificacao =
  | { ok: true; classificacao: Classificacao }
  | { ok: false; motivo: string };

function semAcento(t: string): string {
  return t.normalize("NFD").replace(/[̀-ͯ]/g, "");
}

function soDigitos(s: string): string {
  return s.replace(/\D/g, "");
}

/** Primeiro CNPJ formatado ou de 14 dígitos que aparecer no texto. */
export function acharCnpj(texto: string): string | null {
  const formatado = /(\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2})/.exec(texto);
  if (formatado) return soDigitos(formatado[1]);
  const cru = /\b(\d{14})\b/.exec(texto);
  return cru ? cru[1] : null;
}

function dataSped(campo: string): { ano: number; mes: number } | null {
  // SPED escreve DDMMAAAA.
  if (!/^\d{8}$/.test(campo)) return null;
  const mes = Number(campo.slice(2, 4));
  const ano = Number(campo.slice(4, 8));
  if (!ano || mes < 1 || mes > 12) return null;
  return { ano, mes };
}

/**
 * Classifica um arquivo de TEXTO (SPED, DCTF, GIAM, XML).
 *
 * `amostra` é o começo do arquivo — SPED pode ter gigabytes, e o registro 0000
 * está sempre na primeira linha.
 */
export function classificarTexto(
  extensao: string,
  amostra: string,
  nomeArquivo: string,
): ResultadoClassificacao {
  const ext = extensao.toLowerCase();

  // --- DCTF antiga: .dec começando com DCTFM ---
  if (ext === ".dec" && amostra.startsWith("DCTFM")) {
    const m = amostra.match(/R10\d{14}(\d{6})/);
    if (!m) return { ok: false, motivo: "DCTF antiga sem o registro R10 com a competência" };
    const ano = Number(m[1].slice(0, 4));
    const mes = Number(m[1].slice(4, 6));
    return {
      ok: true,
      classificacao: {
        tipo: "DCTF_ANTIGA",
        ano,
        mes,
        cnpj: acharCnpj(amostra),
        inscricaoEstadual: null,
        tributo: null,
        contaCodigo: null,
        documentos: 1,
        evidencia: "cabeçalho DCTFM + registro R10",
      },
    };
  }

  // --- DCTFWeb: XML do SERPRO ---
  if (ext === ".xml" && /serpro\.gov\.br\/dctf|DctfXml|ProcDctf/i.test(amostra)) {
    const per = /perApuracao>(\d{2})(\d{4})</.exec(amostra);
    return {
      ok: true,
      classificacao: {
        tipo: "DCTFWEB",
        ano: per ? Number(per[2]) : null,
        mes: per ? Number(per[1]) : null,
        cnpj: acharCnpj(amostra),
        inscricaoEstadual: null,
        tributo: null,
        contaCodigo: null,
        documentos: 1,
        evidencia: "XML com namespace DCTFWeb",
      },
    };
  }

  if (ext !== ".txt") {
    return { ok: false, motivo: `extensão ${ext} não reconhecida` };
  }

  // --- SPEDs: começam com |0000| ---
  if (amostra.startsWith("|0000|")) {
    const primeiraLinha = amostra.split("\n", 1)[0] ?? "";
    const campos = primeiraLinha.split("|");
    const layout = campos[2] ?? "";
    const cnpj = acharCnpj(amostra);

    if (layout === "LECD") {
      const d = dataSped(campos[3] ?? "");
      return {
        ok: true,
        classificacao: {
          tipo: "SPED_ECD",
          ano: d?.ano ?? null,
          mes: null,
          cnpj,
          inscricaoEstadual: null,
          tributo: null,
          contaCodigo: null,
          documentos: 1,
          evidencia: "|0000|LECD|",
        },
      };
    }

    if (layout === "LECF") {
      const d = dataSped(campos[3] ?? "");
      return {
        ok: true,
        classificacao: {
          tipo: "SPED_ECF",
          ano: d?.ano ?? null,
          mes: null,
          cnpj,
          inscricaoEstadual: null,
          tributo: null,
          contaCodigo: null,
          documentos: 1,
          evidencia: "|0000|LECF|",
        },
      };
    }

    // EFD-Contribuições: os blocos M são o marcador definitivo.
    if (/\|M100\||\|M200\||\|M400\||\|M600\|/.test(amostra)) {
      const d = dataSped(campos[6] ?? "");
      return {
        ok: true,
        classificacao: {
          tipo: "SPED_CONTRIBUICOES",
          ano: d?.ano ?? null,
          mes: d?.mes ?? null,
          cnpj,
          inscricaoEstadual: null,
          tributo: null,
          contaCodigo: null,
          documentos: 1,
          evidencia: "|0000| com bloco M (PIS/COFINS)",
        },
      };
    }

    // EFD ICMS/IPI: |0000|<cod_ver>|<cod_fin>|DT_INI|DT_FIN|NOME|CNPJ|UF|IE|...
    // Não dá pra exigir |C100| na amostra: em arquivo grande o primeiro C100
    // está muito além dos primeiros 8 KB. O formato do próprio 0000 basta —
    // versão de 3 dígitos, finalidade 0/1 e duas datas.
    const pareceEfdIcms =
      /^\d{3}$/.test(layout) &&
      /^[01]$/.test(campos[3] ?? "") &&
      dataSped(campos[4] ?? "") !== null;
    if (/\|C100\||\|E110\||\|E100\|/.test(amostra) || pareceEfdIcms) {
      const d = dataSped(campos[4] ?? "") ?? dataSped(campos[3] ?? "");
      const ie = campos[9] ?? null;
      return {
        ok: true,
        classificacao: {
          tipo: "SPED_FISCAL",
          ano: d?.ano ?? null,
          mes: d?.mes ?? null,
          cnpj,
          inscricaoEstadual: ie && /^\d+$/.test(ie) ? ie : null,
          tributo: null,
          contaCodigo: null,
          documentos: 1,
          evidencia: "|0000| com bloco C100/E110 (ICMS)",
        },
      };
    }

    return { ok: false, motivo: "SPED de layout não reconhecido (nem ECD, ECF, Contribuições ou Fiscal)" };
  }

  // --- GIAM: TXT posicional do Domínio, layout 10.0 ---
  // Registro A começa com "A" e traz a IE nas primeiras posições. Não tem
  // separador, então a marca é o formato do começo da linha.
  if (/^A\d{9,}/.test(amostra) && /\n[BE]\d/.test(amostra)) {
    const ie = /^A\D*(\d{9,11})/.exec(amostra)?.[1] ?? null;
    const comp = /^A.{0,20}?(\d{2})(\d{4})/.exec(amostra);
    return {
      ok: true,
      classificacao: {
        tipo: "GIAM_ARQUIVO",
        ano: comp ? Number(comp[2]) : null,
        mes: comp ? Number(comp[1]) : null,
        cnpj: null,
        inscricaoEstadual: ie,
        tributo: null,
        contaCodigo: null,
        documentos: 1,
        evidencia: "arquivo posicional com segmentos A/B/E (GIAM 10.0)",
      },
    };
  }

  return { ok: false, motivo: "arquivo .txt sem assinatura conhecida" };
}

const MESES_EXTENSO: Record<string, number> = {
  janeiro: 1, fevereiro: 2, marco: 3, abril: 4, maio: 5, junho: 6,
  julho: 7, agosto: 8, setembro: 9, outubro: 10, novembro: 11, dezembro: 12,
};

/**
 * Classifica um PDF a partir do texto extraído.
 *
 * A ORDEM IMPORTA. Guia, declaração e comprovante do Simples compartilham
 * frases; testar do mais específico para o mais genérico é o que evita trocar
 * um pelo outro:
 *   comprovante → declaração → guia → razão → balanço/DRE → espelho da GIAM
 */
export function classificarPdf(texto: string, nomeArquivo: string): ResultadoClassificacao {
  const t = semAcento(texto);
  const cnpj = acharCnpj(texto);

  // --- Comprovante de Arrecadação (o ano inteiro num PDF, uma página por doc) ---
  if (/registro de arrecadacao de (DAS|DARF)/i.test(t) || /Comprovante de Arrecadacao/i.test(t)) {
    const paginas = (t.match(/registro de arrecadacao de/gi) ?? []).length || 1;
    const anos = [...t.matchAll(/\b\d{2}\/(\d{4})\b/g)].map((m) => Number(m[1]));
    return {
      ok: true,
      classificacao: {
        tipo: "COMPROVANTE_ARRECADACAO",
        ano: anos[0] ?? null,
        mes: null,
        cnpj,
        inscricaoEstadual: null,
        tributo: null,
        contaCodigo: null,
        documentos: paginas,
        evidencia: `"registro de arrecadação" em ${paginas} página(s)`,
      },
    };
  }

  // --- Declaração PGDAS-D (tem "Declaratório"; a guia não tem) ---
  if (/Declaratorio/i.test(t) || /Periodo de Apuracao:\s*\d{2}\/\d{2}\/\d{4}/i.test(t)) {
    const m = /Periodo de Apuracao:?\s*(\d{2})\/(\d{2})\/(\d{4})/i.exec(t);
    return {
      ok: true,
      classificacao: {
        tipo: "PGDASD_DECLARACAO",
        ano: m ? Number(m[3]) : null,
        mes: m ? Number(m[2]) : null,
        cnpj,
        inscricaoEstadual: null,
        tributo: null,
        contaCodigo: null,
        documentos: 1,
        evidencia: "PGDAS-D Declaratório",
      },
    };
  }

  // --- Guia do DAS ---
  if (/Documento de Arrecadacao\s*\n?\s*do Simples Nacional|Documento de Arrecadacao do Simples Nacional/i.test(t)) {
    let ano: number | null = null;
    let mes: number | null = null;
    const extenso = new RegExp(`(${Object.keys(MESES_EXTENSO).join("|")})\\/(\\d{4})`, "i").exec(t);
    if (extenso) {
      mes = MESES_EXTENSO[extenso[1].toLowerCase()];
      ano = Number(extenso[2]);
    } else {
      const curto = /\b(\d{2})\/(\d{4})\b/.exec(t);
      if (curto) {
        mes = Number(curto[1]);
        ano = Number(curto[2]);
      }
    }
    return {
      ok: true,
      classificacao: {
        tipo: "DAS_GUIA",
        ano,
        mes,
        cnpj,
        inscricaoEstadual: null,
        tributo: null,
        contaCodigo: null,
        documentos: 1,
        evidencia: "guia do DAS (sem 'Declaratório')",
      },
    };
  }

  // --- Razão do Domínio ---
  if (/\bRAZAO\b/i.test(t) && /Conta:/i.test(t) && /Saldo-?Exercicio/i.test(t)) {
    // Ordem: o nome da CONTA manda; o nome do arquivo é o segundo recurso.
    // O `pdf-parse` inverte a ordem desta linha: sai
    //   "INSS A RECOLHER  2.1.50.200.1  -  191  Conta:"
    // em vez de "Conta: 191 - 2.1.50.200.1 INSS A RECOLHER". Por isso não dá
    // pra ler "o que vem depois de Conta:" — o certo é olhar a VIZINHANÇA da
    // âncora, dos dois lados.
    const posConta = texto.search(/Conta:/i);
    const janela =
      posConta >= 0 ? texto.slice(Math.max(0, posConta - 250), posConta + 250) : texto.slice(0, 500);
    // Quatro segmentos ou mais: conta contábil é "2.1.40.102.5". Com menos, o
    // regex casaria antes no CNPJ ("34.351.482"), que está na mesma janela.
    const contaCodigo = /(\d+(?:\.\d+){3,})/.exec(janela)?.[1] ?? null;
    const conta = janela.replace(/\s+/g, " ").trim();
    const tributo = detectarTributoPeloNome(conta) ?? detectarTributoPeloNome(nomeArquivo);
    if (!tributo) {
      return {
        ok: false,
        motivo: `razão do Domínio, mas o tributo não foi identificado (conta ${contaCodigo ?? "?"}, arquivo "${nomeArquivo}")`,
      };
    }
    const periodo = /Periodo:\s*\d{2}\/\d{2}\/(\d{4})/i.exec(t);
    return {
      ok: true,
      classificacao: {
        tipo: "RAZAO",
        ano: periodo ? Number(periodo[1]) : null,
        mes: null,
        cnpj,
        inscricaoEstadual: null,
        tributo,
        contaCodigo,
        documentos: 1,
        evidencia: `razão da conta ${contaCodigo ?? "(sem código)"}`,
      },
    };
  }

  // --- Balanço e DRE do Domínio ---
  if (/BALANCO PATRIMONIAL/i.test(t)) {
    const ano = /\b(20\d{2})\b/.exec(t);
    return {
      ok: true,
      classificacao: {
        tipo: "BALANCO_DOMINIO",
        ano: ano ? Number(ano[1]) : null,
        mes: null,
        cnpj,
        inscricaoEstadual: null,
        tributo: null,
        contaCodigo: null,
        documentos: 1,
        evidencia: "título BALANÇO PATRIMONIAL",
      },
    };
  }
  if (/DEMONSTRACAO DO RESULTADO/i.test(t)) {
    const ano = /\b(20\d{2})\b/.exec(t);
    return {
      ok: true,
      classificacao: {
        tipo: "DRE_DOMINIO",
        ano: ano ? Number(ano[1]) : null,
        mes: null,
        cnpj,
        inscricaoEstadual: null,
        tributo: null,
        contaCodigo: null,
        documentos: 1,
        evidencia: "título DEMONSTRAÇÃO DO RESULTADO",
      },
    };
  }

  // --- Espelho da GIAM (SEFAZ-TO) ---
  if (/GIAM/i.test(t) && /SEFAZ|Secretaria da Fazenda/i.test(t)) {
    const comp = /\b(\d{2})\/(\d{4})\b/.exec(t);
    const ie = /Inscricao Estadual:?\s*([\d.-]{9,15})/i.exec(t)?.[1];
    return {
      ok: true,
      classificacao: {
        tipo: "GIAM_ESPELHO",
        ano: comp ? Number(comp[2]) : null,
        mes: comp ? Number(comp[1]) : null,
        cnpj,
        inscricaoEstadual: ie ? soDigitos(ie) : null,
        tributo: null,
        contaCodigo: null,
        documentos: 1,
        evidencia: "espelho da GIAM (SEFAZ)",
      },
    };
  }

  return { ok: false, motivo: "PDF sem assinatura conhecida" };
}
