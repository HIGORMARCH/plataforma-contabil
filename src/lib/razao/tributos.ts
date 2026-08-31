/**
 * Tributos que têm razão contábil próprio, e como reconhecê-los pelo nome do
 * arquivo.
 *
 * Convenção definida pelo Higor em 29/08/2026 — dentro da pasta do cliente:
 *
 *   RAZAO\
 *     Razao simples nacional
 *     Razao INSS
 *     Razao FGTS
 *     Razao IRRF
 *     Razao Pis
 *     Razao Cofins
 *     Razao ICMS
 *     Razao Irpj
 *     Razao Csll
 *
 * O nome do arquivo É o de-para: não precisa mapear conta contábil a mão nem
 * adivinhar por semelhança de descrição. Cada empresa põe ali só os razões que
 * tem — a ausência de um arquivo significa "essa empresa não tem esse tributo",
 * não "faltou importar".
 *
 * Reconhecimento é por palavra inteira, sem acento e sem caixa. Nada de casar
 * por pedaço de palavra: "CSLL" não pode casar dentro de outra coisa, e o par
 * IRPJ/IRRF é próximo demais pra tolerar aproximação.
 */

export type TributoRazao =
  | "SIMPLES_NACIONAL"
  | "INSS"
  | "FGTS"
  | "IRRF"
  | "PIS"
  | "COFINS"
  | "ICMS"
  | "IRPJ"
  | "CSLL";

export const TRIBUTOS_RAZAO: TributoRazao[] = [
  "SIMPLES_NACIONAL",
  "INSS",
  "FGTS",
  "IRRF",
  "PIS",
  "COFINS",
  "ICMS",
  "IRPJ",
  "CSLL",
];

export const ROTULO_TRIBUTO_RAZAO: Record<TributoRazao, string> = {
  SIMPLES_NACIONAL: "Simples Nacional (DAS)",
  INSS: "INSS",
  FGTS: "FGTS",
  IRRF: "IRRF",
  PIS: "PIS",
  COFINS: "COFINS",
  ICMS: "ICMS",
  IRPJ: "IRPJ",
  CSLL: "CSLL",
};

/**
 * Onde está o pagamento de cada um — importa pra tela dizer com o que o razão
 * vai ser conciliado, e pra ser honesta quando não há com o que conciliar.
 */
export const FONTE_PAGAMENTO: Record<TributoRazao, string> = {
  SIMPLES_NACIONAL: "DAS — comprovante da Receita e e-CAC",
  INSS: "DARF/GPS — comprovante da Receita e e-CAC",
  IRRF: "DARF — comprovante da Receita e e-CAC",
  PIS: "DARF — comprovante da Receita e e-CAC",
  COFINS: "DARF — comprovante da Receita e e-CAC",
  IRPJ: "DARF — comprovante da Receita e e-CAC",
  CSLL: "DARF — comprovante da Receita e e-CAC",
  ICMS: "DARE estadual — SEFAZ-TO (não passa pelo e-CAC)",
  FGTS: "GRF / FGTS Digital — nenhuma fonte na plataforma ainda",
};

/** Nome da pasta, dentro da pasta do cliente, onde ficam os razões. */
export const PASTA_RAZAO = "RAZAO";

/**
 * Como o tributo entra no NOME DO ARQUIVO do razão.
 *
 * Separado de ROTULO_TRIBUTO_RAZAO de propósito: o rótulo é de tela e tem
 * parêntese ("Simples Nacional (DAS)"), que em nome de arquivo é feio e ainda
 * atrapalha a releitura.
 */
export const NOME_ARQUIVO_TRIBUTO: Record<TributoRazao, string> = {
  SIMPLES_NACIONAL: "SIMPLES NACIONAL",
  INSS: "INSS",
  FGTS: "FGTS",
  IRRF: "IRRF",
  PIS: "PIS",
  COFINS: "COFINS",
  ICMS: "ICMS",
  IRPJ: "IRPJ",
  CSLL: "CSLL",
};

/**
 * Tributos que a empresa do SIMPLES NACIONAL não recolhe à parte — estão
 * dentro do DAS (regra lembrada pelo Higor em 29/08/2026).
 *
 * Para essas empresas, "sem razão de IRPJ" não é lacuna: é o certo. Sem isto a
 * tela cobra pra sempre um arquivo que nunca vai existir.
 *
 * O que a empresa do Simples AINDA recolhe à parte, e por isso continua na
 * lista dela:
 *   - INSS retido dos segurados (o DAS traz a cota patronal, não a retenção);
 *   - IRRF da folha, também retenção;
 *   - FGTS, que não é tributo do DAS;
 *   - ICMS de complementação de alíquota / difal / ST, em guia estadual — o
 *     ICMS do DAS é outro, apurado sobre a receita.
 */
export const DENTRO_DO_DAS: TributoRazao[] = ["IRPJ", "CSLL", "PIS", "COFINS"];

/**
 * O tributo é recolhido à parte neste regime? `false` significa "não se aplica",
 * não "está faltando".
 */
export function recolheSeparadamente(tributo: TributoRazao, ehSimples: boolean): boolean {
  if (!ehSimples) return true;
  return !DENTRO_DO_DAS.includes(tributo);
}

/**
 * Os nomes de arquivo que o cadastro mostra como esperados. É a mesma lista que
 * o Higor definiu — serve de instrução na tela e de exemplo do de-para.
 */
export const NOMES_RAZAO_ESPERADOS = [
  "Razao simples nacional",
  "Razao INSS",
  "Razao FGTS",
  "Razao IRRF",
  "Razao Pis",
  "Razao Cofins",
  "Razao ICMS",
  "Razao Irpj",
  "Razao Csll",
];

/** Termos aceitos por tributo, sempre comparados como palavra inteira. */
const TERMOS: Record<TributoRazao, string[]> = {
  SIMPLES_NACIONAL: ["simples nacional", "simples", "das", "pgdas"],
  INSS: ["inss", "cpp", "previdencia", "previdenciaria"],
  FGTS: ["fgts"],
  IRRF: ["irrf", "ir retido", "irf"],
  PIS: ["pis", "pis pasep", "pasep"],
  COFINS: ["cofins"],
  ICMS: ["icms"],
  IRPJ: ["irpj"],
  CSLL: ["csll", "contribuicao social"],
};

function normalizar(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    // "RazaoINSS" → "Razao INSS": sem isso, arquivo sem separador vira uma
    // palavra só ("razaoinss") e nenhum termo casa.
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/**
 * Descobre o tributo pelo nome do arquivo (ou da pasta). Devolve `null` quando
 * não dá pra afirmar — inclusive quando o nome casa com mais de um tributo, que
 * é caso de ambiguidade, não de escolher o primeiro.
 */
export function detectarTributoPeloNome(nome: string): TributoRazao | null {
  const semExtensao = normalizar(nome.replace(/\.[a-z0-9]+$/i, ""));
  // "RAZAOICMS" (tudo maiúsculo, sem separador) não se quebra por caixa —
  // tirar o prefixo "razao" colado resolve o resto dos casos.
  const semPrefixo = semExtensao.replace(/^razao(?=[a-z])/, "razao ");
  const limpo = ` ${semPrefixo} `;
  const casados = TRIBUTOS_RAZAO.filter((t) =>
    TERMOS[t].some((termo) => limpo.includes(` ${normalizar(termo)} `)),
  );
  if (casados.length !== 1) {
    // "simples nacional" casa em SIMPLES_NACIONAL por dois termos diferentes;
    // isso não é ambiguidade. Ambiguidade é casar em tributos distintos.
    return casados.length > 1 ? null : null;
  }
  return casados[0];
}

/**
 * Códigos de receita federais (DARF/DAS) por tributo.
 *
 * Fica aqui, junto da definição dos tributos, e não na conciliação: é
 * conhecimento de domínio puro, sem banco, e assim dá pra testar sozinho.
 *
 * ICMS e FGTS não entram: DARE estadual e GRF não passam pelo e-CAC.
 */
export const CODIGOS_POR_TRIBUTO: Partial<Record<TributoRazao, string[]>> = {
  // 3333 é o código genérico com que o e-CAC identifica o DAS; 1001..1007 são
  // os tributos dentro dele, que aparecem no desmembramento do comprovante.
  SIMPLES_NACIONAL: ["3333", "1001", "1002", "1003", "1004", "1005", "1006", "1007"],
  INSS: ["1082", "1099", "1138", "1141", "2100", "2909"],
  IRRF: ["0561", "0588", "1708", "3208", "3223"],
  PIS: ["8109", "6912", "3703"],
  COFINS: ["2172", "5856", "3746"],
  IRPJ: ["2089", "2362", "2456", "6106", "0220"],
  CSLL: ["2372", "2484", "2469", "6773"],
};

/**
 * Código sem zeros à esquerda. O e-CAC devolve "561" e o comprovante imprime
 * "0561" — o mesmo IRRF. Sem normalizar, metade dos pagamentos fica órfã.
 */
function codigoNormalizado(codigo: string): string {
  return codigo.replace(/^0+/, "");
}

/** Tributo a que pertence um código de receita; null se não for um dos nove. */
export function tributoDoCodigoReceita(codigo: string): TributoRazao | null {
  const alvo = codigoNormalizado(codigo);
  for (const [t, codigos] of Object.entries(CODIGOS_POR_TRIBUTO) as Array<[TributoRazao, string[]]>) {
    if (codigos.some((c) => codigoNormalizado(c) === alvo)) return t;
  }
  return null;
}
