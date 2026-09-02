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
  | "GIAM_ESPELHO"
  | "RECIBO_SPED"
  | "GPS"
  | "GRF_FGTS"
  | "GFIP_SEFIP"
  | "COMPROVANTE_GFIP"
  | "NOTIFICACAO_MULTA"
  | "DARE_ICMS"
  | "DEFIS"
  | "LIVRO_FISCAL"
  | "TERMO_CREDENCIAMENTO"
  | "DEMONSTRATIVO_ICMS";

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
  RECIBO_SPED: "Recibo de entrega de SPED",
  GPS: "GPS — Guia da Previdência",
  GRF_FGTS: "GRF / analítico do FGTS",
  GFIP_SEFIP: "GFIP / SEFIP",
  COMPROVANTE_GFIP: "Comprovante de declaração à Previdência",
  NOTIFICACAO_MULTA: "Notificação de lançamento (multa)",
  DARE_ICMS: "DARE / guia estadual",
  DEFIS: "DEFIS (Simples)",
  LIVRO_FISCAL: "Livro fiscal",
  TERMO_CREDENCIAMENTO: "Termo de credenciamento",
  DEMONSTRATIVO_ICMS: "Demonstrativo do ICMS",
};

export interface Classificacao {
  tipo: TipoDocumento;
  /** Ano de referência do documento. */
  ano: number | null;
  /** Mês, nos documentos mensais. */
  mes: number | null;
  /** CNPJ (14 dígitos) encontrado no conteúdo — é assim que se acha o cliente. */
  cnpj: string | null;
  /**
   * Razão social escrita DENTRO do documento.
   *
   * É o que permite arquivar na empresa certa mesmo quando ela não é cliente
   * cadastrado: com nome + CNPJ dá pra compor a pasta dela. Sem isso, um SPED
   * da Ponto Forte guardado por engano na pasta da Construtora ficaria lá para
   * sempre, porque ninguém tem como saber de quem ele é sem abrir.
   */
  nomeEmpresa: string | null;
  /** Inscrição estadual, quando é o identificador (GIAM). */
  inscricaoEstadual: string | null;
  /** Tributo, só para o razão. */
  tributo: TributoRazao | null;
  /** Distingue documentos do mesmo tipo: "ANALITICO" vs a guia em si. */
  variante: string | null;
  /** Qual SPED o recibo comprova — só para RECIBO_SPED. */
  reciboDe: "CONTRIBUICOES" | "FISCAL" | "ECD" | "ECF" | null;
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

/**
 * CNPJ válido? Confere os dois dígitos verificadores.
 *
 * Não é preciosismo: sem isso, qualquer sequência de 14 dígitos de um
 * formulário vira "CNPJ". Um espelho da GIAM chegou a produzir
 * `54736810721319`, e o robô ia criar uma pasta para essa empresa inexistente.
 */
export function validarCnpj(cnpj: string): boolean {
  const d = cnpj.replace(/\D/g, "");
  if (d.length !== 14) return false;
  if (/^(\d)\1{13}$/.test(d)) return false; // 00000000000000 e afins
  const dv = (base: string, pesos: number[]) => {
    const soma = base.split("").reduce((s, n, i) => s + Number(n) * pesos[i], 0);
    const resto = soma % 11;
    return resto < 2 ? 0 : 11 - resto;
  };
  const p1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  const p2 = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  return dv(d.slice(0, 12), p1) === Number(d[12]) && dv(d.slice(0, 13), p2) === Number(d[13]);
}

/**
 * Primeiro CNPJ VÁLIDO que aparecer no texto — formatado ou cru.
 *
 * Testa todos os candidatos e devolve o primeiro que passa no dígito
 * verificador; número que só parece CNPJ é descartado em silêncio.
 */
export function acharCnpj(texto: string): string | null {
  for (const m of texto.matchAll(/(\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2})/g)) {
    const c = soDigitos(m[1]);
    if (validarCnpj(c)) return c;
  }
  for (const m of texto.matchAll(/\b(\d{14})\b/g)) {
    if (validarCnpj(m[1])) return m[1];
  }
  return null;
}

/**
 * CNPJ grudado no meio de uma sequência de dígitos.
 *
 * Arquivo posicional não separa campos: o cabeçalho da DCTF antiga traz
 * `...930044463938000113236...`, com o CNPJ colado entre outros números, e
 * nenhuma busca com fronteira de palavra o encontra. Aqui a varredura é
 * janela a janela, e o dígito verificador é o que separa CNPJ de coincidência.
 *
 * Usado só onde não há alternativa (formato posicional): num texto qualquer, a
 * chance de uma sequência aleatória passar no DV é pequena, mas não é zero.
 */
export function acharCnpjEmbutido(texto: string, nomeArquivo?: string): string | null {
  const candidatos: string[] = [];
  for (const corrida of texto.match(/\d{14,}/g) ?? []) {
    for (let i = 0; i + 14 <= corrida.length; i++) {
      const candidato = corrida.slice(i, i + 14);
      if (validarCnpj(candidato)) candidatos.push(candidato);
    }
  }
  if (candidatos.length === 0) return null;
  // Uma janela deslocada pode passar no DV por acaso: em
  // "...930044463938000113..." o trecho "93004446393800" é um CNPJ válido que
  // não existe, e vem ANTES do verdadeiro. Quando o nome do arquivo confirma um
  // dos candidatos, ele desempata — o nome não decide sozinho, só escolhe entre
  // números que o conteúdo já ofereceu.
  if (nomeArquivo) {
    const digitos = soDigitos(nomeArquivo);
    const confirmado = candidatos.find((c) => digitos.includes(c));
    if (confirmado) return confirmado;
  }
  // Com vários candidatos e nada que confirme, é chute. Um `.dec` da Palmas
  // Hall produz cinco CNPJ válidos — inclusive `01132022050000`, que é um
  // pedaço de data — e nenhum deles é o titular. Melhor não saber: quem não
  // sabe cai na regra da pasta, que ao menos é rastreável.
  return candidatos.length === 1 ? candidatos[0] : null;
}

/**
 * O CNPJ do titular do SPED — lido da POSIÇÃO dele no registro |0000|.
 *
 * Varrer o arquivo atrás de "um CNPJ" não serve: o corpo do SPED está cheio de
 * CNPJ de terceiro. Um EFD da BLC Center Modas trazia, num registro |0460| de
 * observação, o CNPJ da transportadora escrito com pontuação — e como a busca
 * genérica testa o formato pontuado primeiro, o arquivo foi parar numa pasta
 * com o CNPJ da transportadora.
 *
 * Quando a posição não entrega um CNPJ válido, a busca é limitada à PRIMEIRA
 * LINHA: ali só existe o titular. Fora dela, prefere-se não saber.
 */
export function cnpjNoSped(campos: string[], posicao: number, primeiraLinha: string): string | null {
  const naPosicao = soDigitos(campos[posicao] ?? "");
  if (validarCnpj(naPosicao)) return naPosicao;
  return acharCnpj(primeiraLinha);
}

/**
 * Competência escrita no NOME do arquivo — "012026", "01.2026", "01-2026".
 *
 * Último recurso, para documento cujo conteúdo realmente não traz o período.
 * Quem usa isto avisa na evidência: nome de arquivo é palpite de quem salvou.
 */
export function competenciaPeloNome(nome: string): { ano: number; mes: number } | null {
  const m = /(0[1-9]|1[0-2])[.\-_ ]?(20\d{2})/.exec(nome);
  if (!m) return null;
  return { ano: Number(m[2]), mes: Number(m[1]) };
}

/**
 * Competência a partir de um par de datas DDMMAAAA coladas — o jeito que os
 * arquivos posicionais escrevem o período de apuração ("0101202231012022").
 * Só aceita quando as duas datas são do MESMO mês, que é o que caracteriza o
 * período; assim um par qualquer de números não vira competência.
 */
export function competenciaPorParDeDatas(texto: string): { ano: number; mes: number } | null {
  for (const m of texto.matchAll(/(\d{8})(\d{8})/g)) {
    const ini = dataSped(m[1]);
    const fim = dataSped(m[2]);
    if (ini && fim && ini.ano === fim.ano && ini.mes === fim.mes) return ini;
  }
  return null;
}

/**
 * O texto parece uma razão social, ou é rótulo de formulário?
 *
 * O extrator de PDF devolve os rótulos do formulário junto com o conteúdo, e
 * sem esse filtro viram "empresa": um espelho da GIAM produziu
 * "16.3 NOTA FISCAL VALOR 16.4 MUNICIPIOS", e um recibo de ECD produziu "CNPJ".
 */
export function pareceRazaoSocial(nome: string | null): boolean {
  if (!nome) return false;
  const limpo = nome.trim();
  if (limpo.length < 5 || limpo.length > 70) return false;
  const letras = (limpo.match(/[A-Za-zÀ-Ú]/g) ?? []).length;
  const digitos = (limpo.match(/\d/g) ?? []).length;
  if (letras < 5 || digitos > letras) return false;
  const t = semAcento(limpo).toUpperCase();
  const rotulos = [
    "NOTA FISCAL",
    "RAZAO SOCIAL",
    "INSCRICAO",
    "IDENTIFICACAO",
    "PERIODO",
    "MUNICIPIO",
    "VENCIMENTO",
    "ESTABELECIMENTO",
    "MINISTERIO",
    "SECRETARIA",
    "RECIBO",
    "DECLARACAO",
  ];
  if (rotulos.some((r) => t.includes(r))) return false;
  if (/^CNPJ\b/.test(t) || t === "CNPJ") return false;
  return true;
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
 * Razão social no registro |0000|, que muda de posição conforme o layout:
 *   EFD ICMS/IPI  |0000|COD_VER|COD_FIN|DT_INI|DT_FIN|NOME|CNPJ|
 *   ECD / ECF     |0000|LECD|DT_INI|DT_FIN|NOME|CNPJ|
 *   Contribuições |0000|VER|TIPO|||DT_INI|DT_FIN|NOME|CNPJ|
 */
function nomeNoSped(campos: string[], posicao: number): string | null {
  const temLetras = (s: string) => (s.match(/[A-Za-zÀ-Ú]/g) ?? []).length >= 3;
  const candidato = (campos[posicao] ?? "").trim();
  if (candidato.length >= 3 && temLetras(candidato)) return candidato;
  // Último recurso: o primeiro campo que pareça nome de empresa. Exigir LETRAS
  // aqui não é detalhe: sem isso "01102025" (a data inicial do EFD) virava razão
  // social, e o robô criaria uma pasta chamada `01102025_<CNPJ>`.
  const outro = campos.find(
    (c) => c.trim().length >= 5 && temLetras(c) && /^[A-Za-zÀ-Ú0-9 .,&'/-]+$/.test(c.trim()),
  );
  return outro?.trim() ?? null;
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
  //
  // Arquivo posicional, sem separador: o CNPJ vem colado entre outros números e
  // a competência aparece como duas datas grudadas ("0101202231012022"). Antes
  // eu exigia um registro R10 que nem todo arquivo tem, e 9 DCTF da Palmas Hall
  // ficaram paradas por isso.
  if (ext === ".dec" && amostra.startsWith("DCTFM")) {
    const pelaR10 = amostra.match(/R10\d{14}(\d{6})/);
    const competencia = pelaR10
      ? { ano: Number(pelaR10[1].slice(0, 4)), mes: Number(pelaR10[1].slice(4, 6)) }
      : competenciaPorParDeDatas(amostra);
    if (!competencia) {
      return { ok: false, motivo: "DCTF antiga sem competência legível no cabeçalho" };
    }
    const { ano, mes } = competencia;
    return {
      ok: true,
      classificacao: {
        tipo: "DCTF_ANTIGA",
        ano,
        mes,
        cnpj: acharCnpj(amostra) ?? acharCnpjEmbutido(amostra, nomeArquivo),
        nomeEmpresa: null,
        inscricaoEstadual: null,
        tributo: null,
        variante: null,
        reciboDe: null,
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
        nomeEmpresa: null,
        inscricaoEstadual: null,
        tributo: null,
        variante: null,
        reciboDe: null,
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
    // O CNPJ do titular sai da posição no |0000|, nunca de varredura: o
    // corpo do SPED cita CNPJ de terceiro (transportadora, fornecedor).
    const cnpjEm = (pos: number) => cnpjNoSped(campos, pos, primeiraLinha);

    if (layout === "LECD") {
      const d = dataSped(campos[3] ?? "");
      return {
        ok: true,
        classificacao: {
          tipo: "SPED_ECD",
          ano: d?.ano ?? null,
          mes: null,
          cnpj: cnpjEm(6),
          nomeEmpresa: nomeNoSped(campos, 5),
          inscricaoEstadual: null,
          tributo: null,
          variante: null,
          reciboDe: null,
          contaCodigo: null,
          documentos: 1,
          evidencia: "|0000|LECD|",
        },
      };
    }

    if (layout === "LECF") {
      // O ECF NÃO segue o layout do ECD:
      //   ECD  |0000|LECD|DT_INI|DT_FIN|NOME|CNPJ|
      //   ECF  |0000|LECF|VERSAO|CNPJ|NOME|...|DT_INI|DT_FIN|
      // Tratar os dois igual deixava o ECF sem ano ("SPED-ECF sem ano
      // identificado") e ele parava na quarentena.
      const d =
        dataSped(campos[3] ?? "") ??
        campos.map((c) => dataSped(c)).find((x) => x !== null) ??
        null;
      return {
        ok: true,
        classificacao: {
          tipo: "SPED_ECF",
          ano: d?.ano ?? null,
          mes: null,
          cnpj: cnpjEm(4),
          nomeEmpresa: nomeNoSped(campos, 5),
          inscricaoEstadual: null,
          tributo: null,
          variante: null,
          reciboDe: null,
          contaCodigo: null,
          documentos: 1,
          evidencia: "|0000|LECF|",
        },
      };
    }

    // EFD-Contribuições.
    //
    // Os blocos M seriam o marcador ideal, mas em arquivo grande o primeiro
    // |M200| está muito além dos 8 KB que lemos — e aí 100+ PISCOFINS caíam
    // como "layout não reconhecido". O formato do próprio 0000 resolve:
    //   |0000|VERSAO|TIPO|||DT_INI|DT_FIN|NOME|CNPJ|
    // as datas nos campos 6 e 7 são o que distingue do EFD ICMS, onde elas
    // estão nos campos 4 e 5.
    const pareceContribuicoes =
      dataSped(campos[6] ?? "") !== null && dataSped(campos[7] ?? "") !== null;
    if (/\|M100\||\|M200\||\|M400\||\|M600\|/.test(amostra) || pareceContribuicoes) {
      const d = dataSped(campos[6] ?? "");
      return {
        ok: true,
        classificacao: {
          tipo: "SPED_CONTRIBUICOES",
          ano: d?.ano ?? null,
          mes: d?.mes ?? null,
          cnpj: cnpjEm(9),
          nomeEmpresa: nomeNoSped(campos, 8),
          inscricaoEstadual: null,
          tributo: null,
          variante: campos[3] === "1" ? "RETIFICADORA" : null,
          reciboDe: null,
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
      const ie = campos[10] ?? null; // campos[9] e a UF, nao a inscricao
      return {
        ok: true,
        classificacao: {
          tipo: "SPED_FISCAL",
          ano: d?.ano ?? null,
          mes: d?.mes ?? null,
          cnpj: cnpjEm(7),
          nomeEmpresa: nomeNoSped(campos, 6),
          inscricaoEstadual: ie && /^\d+$/.test(ie) ? ie : null,
          tributo: null,
          variante: campos[3] === "1" ? "SUBSTITUTO" : null,
          reciboDe: null,
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
        nomeEmpresa: null,
        inscricaoEstadual: ie,
        tributo: null,
        variante: null,
        reciboDe: null,
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
/**
 * Razão social num PDF. Cada documento a escreve de um jeito:
 *   PGDAS-D     "Nome empresarial: X"
 *   razão       "Empresa: X"
 *   DAS/comprov. o nome vem logo depois do CNPJ, na mesma linha
 */
function nomeNoPdf(texto: string): string | null {
  const rotulado =
    /Nome empresarial:?\s*([^\n]{3,80})/i.exec(texto)?.[1] ??
    /Empresa:?\s*([^\n]{3,80})/i.exec(texto)?.[1] ??
    /Raz[ãa]o Social:?\s*([^\n]{3,80})/i.exec(texto)?.[1];
  if (rotulado) return rotulado.trim();
  const depoisDoCnpj = /\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}\s+([A-ZÀ-Ú][A-ZÀ-Ú0-9 .,&'-]{4,70})/.exec(texto);
  return depoisDoCnpj?.[1]?.trim() ?? null;
}

export function classificarPdf(texto: string, nomeArquivo: string): ResultadoClassificacao {
  const t = semAcento(texto);
  const cnpj = acharCnpj(texto);
  const nomeEmpresa = nomeNoPdf(texto);

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
        nomeEmpresa,
        inscricaoEstadual: null,
        tributo: null,
        variante: null,
        reciboDe: null,
        contaCodigo: null,
        documentos: paginas,
        evidencia: `"registro de arrecadação" em ${paginas} página(s)`,
      },
    };
  }

  // --- Documentos de folha, guias e livros ---
  //
  // Reconhecidos pelo título, que nesses formulários é estável. A competência
  // sai de "MM/AAAA" no corpo; sem ela o documento fica em quarentena, porque
  // mês chutado põe a guia no ano errado.
  const competenciaCurta = (): { ano: number; mes: number } | null => {
    const m = /\b(0[1-9]|1[0-2])\/(20\d{2})\b/.exec(t);
    return m ? { ano: Number(m[2]), mes: Number(m[1]) } : null;
  };
  const soAno = (): number | null => {
    const m = /\b(20\d{2})\b/.exec(t);
    return m ? Number(m[1]) : null;
  };

  const analitico = /RELATORIO ANALITICO|ANALITICO DA/i.test(t) ? "ANALITICO" : null;
  const simples = (
    tipo: TipoDocumento,
    competencia: { ano: number | null; mes: number | null },
    evidencia: string,
    variante: string | null = null,
  ): ResultadoClassificacao => ({
    ok: true,
    classificacao: {
      tipo,
      ano: competencia.ano,
      mes: competencia.mes,
      cnpj,
      nomeEmpresa,
      inscricaoEstadual: null,
      tributo: null,
      variante,
      reciboDe: null,
      contaCodigo: null,
      documentos: 1,
      evidencia,
    },
  });

  // A ordem vai do específico ao genérico: "GPS" aparece dentro de vários
  // formulários de folha, então a guia da GPS é testada por último — senão o
  // comprovante da GFIP e o analítico viriam como guia e brigariam pelo mesmo
  // nome de arquivo.
  if (/COMPROVANTE DE DECLARACAO DAS CONTRIBUICOES A RECOLHER/i.test(t)) {
    const c = competenciaCurta();
    return simples(
      "COMPROVANTE_GFIP",
      { ano: c?.ano ?? null, mes: c?.mes ?? null },
      "comprovante de declaração à Previdência",
    );
  }
  if (/RELAT[OÓ]RIO ANAL[IÍ]TICO DE GPS/i.test(t)) return simples("GPS", { ano: competenciaCurta()?.ano ?? null, mes: competenciaCurta()?.mes ?? null }, "relatório analítico de GPS", "ANALITICO");
  if (/RELAT[OÓ]RIO ANAL[IÍ]TICO DA GRF/i.test(t)) return simples("GRF_FGTS", { ano: competenciaCurta()?.ano ?? null, mes: competenciaCurta()?.mes ?? null }, "relatório analítico da GRF", "ANALITICO");
  if (/GFIP\s*-\s*SEFIP|SEFIP \d/i.test(t)) {
    const c = competenciaCurta();
    return simples("GFIP_SEFIP", { ano: c?.ano ?? null, mes: c?.mes ?? null }, "GFIP/SEFIP", analitico);
  }
  if (/FUNDO DE GARANTIA DO TEMPO DE SERVICO|\bGRF\b/i.test(t)) {
    const c = competenciaCurta();
    return simples("GRF_FGTS", { ano: c?.ano ?? null, mes: c?.mes ?? null }, "GRF / FGTS", analitico);
  }
  if (/NOTIFICACAO DE LANCAMENTO|MULTA POR ATRASO NA ENTREGA/i.test(t)) {
    const c = competenciaCurta();
    return simples(
      "NOTIFICACAO_MULTA",
      { ano: c?.ano ?? soAno(), mes: c?.mes ?? null },
      "notificação de lançamento / multa",
    );
  }
  // Demonstrativo do ICMS do Domínio — é o cálculo que ORIGINA a DARE, não a
  // guia. Precisa vir antes da regra do DARE porque o corpo do demonstrativo
  // cita a guia que ele gera.
  if (/DEMONSTRATIVO DO ICMS/i.test(t)) {
    const c = competenciaCurta();
    return simples(
      "DEMONSTRATIVO_ICMS",
      { ano: c?.ano ?? null, mes: c?.mes ?? null },
      /ANTECIPADO/i.test(t) ? "demonstrativo do ICMS antecipado" : "demonstrativo do ICMS",
    );
  }
  if (/Documento de Arrecadacao de Receitas Estaduais|\bDARE\b/i.test(t)) {
    const c = competenciaCurta();
    return simples("DARE_ICMS", { ano: c?.ano ?? null, mes: c?.mes ?? null }, "DARE estadual");
  }
  if (/Informacoes Socioeconomicas e Fiscais|\(DEFIS\)/i.test(t)) {
    const ano = /Ano Calend[aá]rio:?\s*(20\d{2})/i.exec(t)?.[1];
    return simples("DEFIS", { ano: ano ? Number(ano) : soAno(), mes: null }, "DEFIS");
  }
  // Livros fiscais e o resumo por CFOP: o cliente que não escritura no Domínio
  // imprime esse conjunto todo mês, e ele é a apuração do ICMS dele.
  //
  // Qual livro é tem que sair do TÍTULO, não do texto: o livro de apuração traz
  // "ENTRADAS" e "SAÍDAS" como cabeçalho de coluna, e uma busca solta fazia a
  // apuração ser arquivada como livro de entradas.
  const tituloLivro = /LIVRO REGISTRO DE (ENTRADAS|SAIDAS|INVENTARIO)|REGISTRO DE APURACAO DO ICMS|Resumo da apuracao do ICMS por CFOP/i.exec(t);
  if (tituloLivro) {
    const titulo = tituloLivro[0].toUpperCase();
    const qual = titulo.includes("CFOP")
      ? "RESUMO POR CFOP"
      : titulo.includes("APURACAO")
        ? "APURACAO"
        : titulo.includes("ENTRADAS")
          ? "ENTRADAS"
          : titulo.includes("SAIDAS")
            ? "SAIDAS"
            : "INVENTARIO";
    // A competência tem que sair do PERÍODO impresso ("01/01/2026 a
    // 31/01/2026"). Estes documentos também carimbam a data de emissão, e o
    // resumo por CFOP só tem ela: sem essa ordem, o resumo de janeiro impresso
    // em março era arquivado como março.
    const impresso = /(\d{2})\/(\d{2})\/(\d{4})\s*a\s*\d{2}\/(\d{2})\/(\d{4})/.exec(t);
    const periodo =
      impresso && impresso[2] === impresso[4] && impresso[3] === impresso[5]
        ? { ano: Number(impresso[3]), mes: Number(impresso[2]) }
        : null;
    const peloNome = periodo ? null : competenciaPeloNome(nomeArquivo);
    const c = periodo ?? peloNome;
    const porNome = peloNome !== null;
    return simples(
      "LIVRO_FISCAL",
      { ano: c?.ano ?? null, mes: c?.mes ?? null },
      porNome ? "livro fiscal (competência pelo nome do arquivo)" : "livro fiscal",
      qual,
    );
  }
  if (/TERMO DE CREDENCIAMENTO|CREDENCIAMENTO DE USO DA ESCRITURACAO/i.test(t)) {
    return simples("TERMO_CREDENCIAMENTO", { ano: soAno(), mes: null }, "termo de credenciamento");
  }
  if (/GUIA DA PREVIDENCIA SOCIAL|\bGPS\b/i.test(t)) {
    const c = competenciaCurta();
    return simples("GPS", { ano: c?.ano ?? null, mes: c?.mes ?? null }, "guia da previdência (GPS)", analitico);
  }

  // --- Recibo de entrega de SPED ---
  //
  // Vem ANTES das demais regras de propósito: o recibo transcreve o conteúdo da
  // escrituração, então fala em "balanço", "contribuições", "apuração". Testado
  // depois, um recibo de ECD viraria "Balanço do Domínio" — foi o que aconteceu
  // com o "RECIBO BALANÇO E DRE SPED 2025.pdf" da Rovani.
  if (/RECIBO DE ENTREGA DE ESCRITURACAO|recibo de entrega contem a transcricao/i.test(t)) {
    // "CONTRIBUI" casaria com "Contribuinte", palavra que está em TODO recibo —
    // e por isso o recibo do SPED-ICMS virava "SPED CONTRIBUIÇÃO". O que
    // distingue é o título da escrituração, não uma palavra solta.
    const reciboDe: Classificacao["reciboDe"] = /DIGITAL\s*-?\s*CONTRIBUICOES|EFD-?\s*CONTRIBUICOES/i.test(t)
      ? "CONTRIBUICOES"
      : /CONTABIL FISCAL|\bECF\b/i.test(t)
        ? "ECF"
        : /CONTABIL DIGITAL|\bECD\b/i.test(t)
          ? "ECD"
          : /ICMS|IPI|ESCRITURACAO FISCAL DIGITAL/i.test(t)
            ? "FISCAL"
            : null;

    if (!reciboDe) {
      return { ok: false, motivo: "recibo de entrega, mas não deu pra saber de qual SPED" };
    }

    // "Período de apuração: 01/03/2026 a 31/03/2026" — a data INICIAL é a
    // competência. O rótulo sai depois do valor no texto extraído, então a
    // âncora é o próprio intervalo.
    // Retificadora não substitui o original: são dois documentos da mesma
    // competência, e sem marcar no nome eles brigam pelo mesmo arquivo.
    const retificadora = /RETIFICADORA|Tipo:?\s*Retific/i.test(t) ? "RETIFICADORA" : null;
    const periodo = /(\d{2})\/(\d{2})\/(\d{4})\s*a\s*(\d{2})\/(\d{2})\/(\d{4})/.exec(t);
    const anual = reciboDe === "ECD" || reciboDe === "ECF";
    return {
      ok: true,
      classificacao: {
        tipo: "RECIBO_SPED",
        ano: periodo ? Number(periodo[3]) : null,
        mes: anual ? null : periodo ? Number(periodo[2]) : null,
        cnpj,
        nomeEmpresa,
        inscricaoEstadual: null,
        tributo: null,
        variante: retificadora,
        reciboDe,
        contaCodigo: null,
        documentos: 1,
        evidencia: `recibo de entrega (${reciboDe})`,
      },
    };
  }

  // --- Declaração PGDAS-D ---
  //
  // A marca é "Declaratório" no título do PGDAS-D, e SÓ ela. A condição antiga
  // aceitava qualquer PDF com "Período de Apuração", e isso arquivou uma
  // NOTIFICAÇÃO DE MULTA da EFD-Contribuições da Casa São Paulo como se fosse
  // declaração do Simples — de uma empresa do Lucro Real, que nem PGDAS tem.
  // Frase genérica não identifica documento.
  if (/Declaratorio/i.test(t)) {
    // A competência é a data INICIAL do período; "15/05/2024" naquele PDF era
    // prazo de entrega, não competência.
    const m = /Periodo de Apuracao:?\s*(\d{2})\/(\d{2})\/(\d{4})/i.exec(t);
    return {
      ok: true,
      classificacao: {
        tipo: "PGDASD_DECLARACAO",
        ano: m ? Number(m[3]) : null,
        mes: m ? Number(m[2]) : null,
        cnpj,
        nomeEmpresa,
        inscricaoEstadual: null,
        tributo: null,
        variante: null,
        reciboDe: null,
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
        nomeEmpresa,
        inscricaoEstadual: null,
        tributo: null,
        variante: null,
        reciboDe: null,
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
        nomeEmpresa,
        inscricaoEstadual: null,
        tributo,
        variante: null,
        reciboDe: null,
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
        nomeEmpresa,
        inscricaoEstadual: null,
        tributo: null,
        variante: null,
        reciboDe: null,
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
        nomeEmpresa,
        inscricaoEstadual: null,
        tributo: null,
        variante: null,
        reciboDe: null,
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
        nomeEmpresa,
        inscricaoEstadual: ie ? soDigitos(ie) : null,
        tributo: null,
        variante: null,
        reciboDe: null,
        contaCodigo: null,
        documentos: 1,
        evidencia: "espelho da GIAM (SEFAZ)",
      },
    };
  }

  return { ok: false, motivo: "PDF sem assinatura conhecida" };
}
