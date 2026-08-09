/**
 * Contas analíticas do balanço — extrai as linhas de detalhe dos dois lados
 * (Domínio e ECD) e as normaliza numa estrutura comum, pra comparação
 * conta-a-conta na conciliação.
 *
 * Motivação: a conciliação por totais/subgrupos ("Total do Ativo Circulante",
 * "Contas a Receber") é útil pra achar em QUE região está o erro, mas o
 * contador precisa saber QUAL conta analítica ajustar no Domínio. Este módulo
 * responde essa pergunta.
 *
 * Fonte no lado Domínio: o balanço PDF salvo pela plataforma em
 * C:\PlataformaContabil\<cliente>\BALANCOS-DOMINIO\<ano>\balanco.pdf,
 * relido pelo parser de plano-de-contas (extract/classificacao.ts).
 *
 * Fonte no lado ECD: o bloco J100 do SPED-ECD já parseado por
 * lib/ecd/parseSpedEcd.ts — usamos APENAS as contas analíticas (indCod = "D").
 * As contas totalizadoras (indCod = "T") não entram na comparação por conta;
 * elas já são cobertas pela conciliação de totais existente.
 */

import { existsSync } from "node:fs";
import path from "node:path";
import { extrairLinhasPdf } from "../extract/pdfText";
import { parseContas, type Conta } from "../extract/classificacao";
import {
  extrairDemonstracoes,
  extrairPlanoDominioDaEcd,
  lerArquivoEcd,
  caminhoEcdDoAno,
  type ContaEcd,
  type ContaPlanoI050,
} from "../ecd/parseSpedEcd";
import { descricaoReferencial } from "./planoReferencialRfb";
import { pastaCliente, ler, type ClienteRef } from "../storage/filesystem";

/**
 * Conta analítica normalizada — mesma forma pros dois lados. Preserva CÓDIGO
 * (pra o contador achar no plano de contas dele) e DESCRIÇÃO (pra fazer o
 * match entre Domínio e ECD, que têm códigos diferentes).
 */
export interface ContaAnalitica {
  /**
   * CHAVE de matching entre Domínio e ECD. No Domínio, é o código sequencial
   * (COD_CTA que o Domínio exporta pra o SPED-ECD — ex.: "128", "5660"). Na
   * ECD, é o COD_CTA do I050 (mesmo valor). Quando os dois lados usam o mesmo
   * COD_CTA, matching é determinístico.
   */
  codigo: string;
  /**
   * Código HIERÁRQUICO pra exibição (ex.: "1.1.50.100.1"). Só existe no lado
   * Domínio (SPED-ECD só tem o sequencial). Ausente no lado ECD.
   */
  codigoExibicao?: string;
  /** Descrição original preservada pra exibição. */
  descricao: string;
  /**
   * Descrição normalizada e AGRESSIVA (lowercase, sem acento, sem plural
   * final, sem pontuação, sem prefixos comuns como "(-)"). Serve como chave
   * de matching entre Domínio e ECD — os dois lados costumam variar em
   * plural/singular, espaços, hífens, ordem de palavras. Ver descNormAgressiva.
   */
  descNorm: string;
  /**
   * Valor com sinal contábil: ativo devedor = +, credor = −;
   * passivo/PL credor = +, devedor = −. Assim os dois lados são comparáveis
   * diretamente (mesma semântica).
   */
  valor: number;
  /** Grupo do balanço a que pertence (para agrupamento visual). */
  grupo: GrupoBalanco;
  /**
   * Sintética imediata acima desta analítica (só preenchida no lado ECD, onde
   * o bloco J100 traz a árvore hierárquica via `codigoSuperior`). Usamos pra
   * agrupar analíticas por sintética referencial no relatório de divergências.
   */
  codigoSintetica?: string;
  descricaoSintetica?: string;
}

export type GrupoBalanco =
  | "ativo-circulante"
  | "ativo-nao-circulante"
  | "passivo-circulante"
  | "passivo-nao-circulante"
  | "patrimonio-liquido"
  | "nao-classificada";

export const ROTULO_GRUPO: Record<GrupoBalanco, string> = {
  "ativo-circulante": "Ativo Circulante",
  "ativo-nao-circulante": "Ativo Não Circulante",
  "passivo-circulante": "Passivo Circulante",
  "passivo-nao-circulante": "Passivo Não Circulante",
  "patrimonio-liquido": "Patrimônio Líquido",
  "nao-classificada": "Não classificada",
};

/** Ordem canônica pra exibição. */
export const ORDEM_GRUPOS: GrupoBalanco[] = [
  "ativo-circulante",
  "ativo-nao-circulante",
  "passivo-circulante",
  "passivo-nao-circulante",
  "patrimonio-liquido",
  "nao-classificada",
];

// ---------------------------------------------------------------------------
// Domínio — plano de contas brasileiro (código raiz: 1=ativo, 2=passivo/PL)
// ---------------------------------------------------------------------------

/**
 * Classifica pelo PREFIXO do código de conta. Convenção padrão dos sistemas
 * contábeis brasileiros (Domínio, Sage, Alterdata, Contmatic):
 *   1.1 → AC       2.1 → PC
 *   1.2 → ANC      2.2 → PNC
 *                  2.3 → PL
 * Alguns escritórios usam 2.4 pro PL em vez de 2.3 — tratamos ambos.
 */
/**
 * Normalização agressiva pra matching entre lados (Domínio × ECD).
 *
 * Os dois sistemas costumam divergir em coisas cosméticas — plural/singular
 * ("CLIENTE" × "CLIENTES"), acento ("APLICACAO" × "APLICAÇÃO"), pontuação
 * ("VULCABRAS S/A" × "VULCABRAS S.A."), prefixos ("(-) DEPRECIAÇÕES" ×
 * "DEPRECIAÇÕES"), abreviações ("COM." × "COMERCIO"), espaços extras. Este
 * normalizador tenta neutralizar tudo isso e produzir uma chave estável.
 *
 * Regras aplicadas em ordem:
 *   1. lowercase + strip acento
 *   2. remove tudo que não é [a-z0-9 ]
 *   3. remove sufixo "s" das palavras >= 4 chars (plural simples)
 *   4. mantém só as palavras únicas ordenadas alfabeticamente (tolera ordem)
 *   5. join por espaço
 */
export function descNormAgressiva(s: string): string {
  const base = s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!base) return "";
  // Remove sufixo "s" quando a palavra tem 4+ letras (evita quebrar "os", "as").
  const palavras = base.split(" ").map((p) => (p.length >= 4 && p.endsWith("s") ? p.slice(0, -1) : p));
  // Set ordena — tolera "MACOPAN CONSTRUCAO" × "CONSTRUCAO MACOPAN".
  return Array.from(new Set(palavras)).sort().join(" ");
}

export function grupoPorCodigoDominio(codigo: string): GrupoBalanco {
  if (codigo.startsWith("1.1")) return "ativo-circulante";
  if (codigo.startsWith("1.2") || codigo.startsWith("1.3")) return "ativo-nao-circulante";
  if (codigo.startsWith("2.1")) return "passivo-circulante";
  if (codigo.startsWith("2.2")) return "passivo-nao-circulante";
  if (codigo.startsWith("2.3") || codigo.startsWith("2.4")) return "patrimonio-liquido";
  return "nao-classificada";
}

/**
 * Extrai contas ANALÍTICAS do balanço Domínio. Analítica aqui = folha
 * (nenhuma outra conta tem o código dessa como prefixo), evitando duplicar
 * valor com os subtotais sintéticos.
 *
 * Atenção: o Domínio numera assim: 1.1.5 (grupo), 1.1.50.1 (subgrupo),
 * 1.1.50.100.1 (analítica). NÃO usa "." como separador de nível — o "50"
 * do subgrupo emenda direto no "5" do grupo. Por isso o check é prefixo
 * de string cru, sem exigir "." — "1.1.5" é prefixo de "1.1.50.1" e por
 * isso conta como sintética.
 */
export function contasAnaliticasDominio(linhas: string[]): ContaAnalitica[] {
  const todas = parseContas(linhas);
  const ehFolha = (c: Conta) =>
    !todas.some((o) => o.codigo !== c.codigo && o.codigo.startsWith(c.codigo));
  return todas.filter(ehFolha).map((c) => {
    const descricao =
      c.bruta.replace(/^\s*\d+\s+\d[\d.]*\d?\s+/, "").replace(/\s+[\d.]+,\d{2}\s*[DC]?\s*$/, "").trim() || c.descNorm;
    // CHAVE de matching = código sequencial (mesmo que o SPED usa). Cai no
    // hierárquico quando o PDF não trouxer a coluna Código.
    const chave = c.codigoSequencial ?? c.codigo;
    return {
      codigo: chave,
      codigoExibicao: c.codigo, // classificação hierárquica pra exibição
      descricao,
      descNorm: descNormAgressiva(descricao),
      valor: c.valor,
      // Grupo do BP vem da HIERÁRQUICA (prefixo 1.1, 2.1, etc), não do sequencial.
      grupo: grupoPorCodigoDominio(c.codigo),
    };
  });
}

/**
 * Lê o balanço Domínio PDF da pasta única (BALANCOS-DOMINIO/<ano>/balanco.pdf)
 * e devolve as contas analíticas. Retorna [] se o arquivo não estiver lá.
 */
export async function contasAnaliticasDominioDoAno(
  cliente: ClienteRef,
  ano: number,
): Promise<ContaAnalitica[]> {
  const pdf = path.join(pastaCliente(cliente), "BALANCOS-DOMINIO", String(ano), "balanco.pdf");
  if (!existsSync(pdf)) return [];
  const bytes = await ler(pdf);
  const ab = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  const linhas = await extrairLinhasPdf(ab);
  return contasAnaliticasDominio(linhas);
}

// ---------------------------------------------------------------------------
// ECD — usa o mapa de códigos superiores (J100) pra achar o grupo raiz.
// ---------------------------------------------------------------------------

/**
 * Sobe a árvore de codigoSuperior até achar uma conta de nível 2 (grupo raiz
 * do BP) e classifica pelo texto da descrição dela. Se não achar, retorna
 * "nao-classificada".
 */
function grupoRaizEcd(conta: ContaEcd, indice: Map<string, ContaEcd>): GrupoBalanco {
  let atual: ContaEcd | undefined = conta;
  const visitados = new Set<string>();
  while (atual && !visitados.has(atual.codigo)) {
    visitados.add(atual.codigo);
    if (atual.nivel <= 2 && atual.indCod === "T") {
      const d = atual.descNorm;
      if (d.includes("ativo circulante")) return "ativo-circulante";
      if (d.includes("ativo n.o") || d.includes("ativo nao") || d.includes("realiz.vel a longo") || d.includes("realizavel a longo"))
        return "ativo-nao-circulante";
      if (d.includes("passivo circulante")) return "passivo-circulante";
      if (d.includes("passivo n.o") || d.includes("passivo nao") || d.includes("exig.vel a longo") || d.includes("exigivel a longo") || d.includes("passivo exig"))
        return "passivo-nao-circulante";
      if (d.includes("patrim.nio") || d.includes("patrimonio l")) return "patrimonio-liquido";
    }
    atual = atual.codigoSuperior ? indice.get(atual.codigoSuperior) : undefined;
  }
  // Fallback pelo campo grupo (A/P) — pelo menos separa ativo de passivo/PL.
  if (conta.grupo === "A") return "ativo-circulante";
  if (conta.grupo === "P") return "passivo-circulante";
  return "nao-classificada";
}

/**
 * Sintética imediata acima de uma analítica: sobe pela cadeia de
 * codigoSuperior até achar a primeira conta com indCod=T que NÃO é
 * um grupo raiz (nível > 2). É a "aglutinação" mais próxima que reúne
 * várias analíticas relacionadas — típico plano referencial da ECF.
 */
function sinteticaImediataEcd(
  conta: ContaEcd,
  indice: Map<string, ContaEcd>,
): ContaEcd | null {
  let atual: ContaEcd | undefined = conta.codigoSuperior ? indice.get(conta.codigoSuperior) : undefined;
  const visitados = new Set<string>();
  while (atual && !visitados.has(atual.codigo)) {
    visitados.add(atual.codigo);
    if (atual.indCod === "T" && atual.nivel > 2) return atual;
    atual = atual.codigoSuperior ? indice.get(atual.codigoSuperior) : undefined;
  }
  return null;
}

/**
 * Extrai contas analíticas do bloco J100 (só `indCod === "D"`). Descarta
 * totalizadoras — quem quiser total usa a conciliação por grupo existente.
 * Cada analítica traz também sua sintética imediata (código + descrição)
 * pra permitir agrupamento hierárquico no relatório de divergências.
 */
export function contasAnaliticasEcd(contasBP: ContaEcd[]): ContaAnalitica[] {
  const indice = new Map(contasBP.map((c) => [c.codigo, c]));
  return contasBP
    .filter((c) => c.indCod === "D")
    .map((c) => {
      const sintetica = sinteticaImediataEcd(c, indice);
      const descricao = c.descricao.trim() || c.descNorm;
      return {
        codigo: c.codigo,
        descricao,
        descNorm: descNormAgressiva(descricao),
        valor: c.valorFinalSinal,
        grupo: grupoRaizEcd(c, indice),
        codigoSintetica: sintetica?.codigo,
        descricaoSintetica: sintetica?.descricao.trim() || sintetica?.descNorm,
      };
    });
}

/**
 * Sobe a árvore do plano Domínio (I050) até achar a sintética imediata acima
 * de uma analítica. Retorna null se não achar.
 */
function sinteticaImediataI050(
  analitica: ContaPlanoI050,
  contas: Map<string, ContaPlanoI050>,
): ContaPlanoI050 | null {
  let atual: ContaPlanoI050 | undefined = analitica.codigoSuperior
    ? contas.get(analitica.codigoSuperior)
    : undefined;
  const visitados = new Set<string>();
  while (atual && !visitados.has(atual.codigo)) {
    visitados.add(atual.codigo);
    if (atual.indCta === "S" && atual.nivel > 2) return atual;
    atual = atual.codigoSuperior ? contas.get(atual.codigoSuperior) : undefined;
  }
  return null;
}

/**
 * Determina o grupo do BP de uma conta do I050 subindo a árvore até um
 * ancestral com descrição reconhecível (Ativo/Passivo Circulante etc).
 * Necessário porque o COD_CTA do SPED é sequencial (128, 5660), não
 * hierárquico — a heurística de prefixo (grupoPorCodigoDominio) não funciona.
 */
function grupoBpDoI050(
  conta: ContaPlanoI050,
  contas: Map<string, ContaPlanoI050>,
): GrupoBalanco {
  let atual: ContaPlanoI050 | undefined = conta;
  const visitados = new Set<string>();
  while (atual && !visitados.has(atual.codigo)) {
    visitados.add(atual.codigo);
    const d = atual.descNorm;
    if (d.includes("ativo circulante")) return "ativo-circulante";
    if (
      d.includes("ativo nao circulante") ||
      d.includes("ativo n.o circulante") ||
      d.includes("realizavel a longo") ||
      d.includes("realiz.vel a longo")
    )
      return "ativo-nao-circulante";
    if (d.includes("passivo circulante")) return "passivo-circulante";
    if (
      d.includes("passivo nao circulante") ||
      d.includes("passivo n.o circulante") ||
      d.includes("exigivel a longo") ||
      d.includes("exig.vel a longo") ||
      d.includes("passivo exig")
    )
      return "passivo-nao-circulante";
    if (d.includes("patrimonio liquido") || d.includes("patrim.nio l.quido")) return "patrimonio-liquido";
    atual = atual.codigoSuperior ? contas.get(atual.codigoSuperior) : undefined;
  }
  return "nao-classificada";
}

/**
 * Fonte de verdade do lado ECD: lê o bloco I050 + I155 do próprio TXT
 * SPED-ECD. Cada analítica vem com seu CÓDIGO DOMÍNIO (COD_CTA) — a chave
 * canônica pra matching determinístico com o balanço do Domínio, sem depender
 * de descrição bater.
 *
 * A sintética imediata (pai no plano Dom) também vem preenchida — é o que
 * agrupa as analíticas no relatório.
 */
export async function contasAnaliticasEcdViaI155DoAno(
  cliente: ClienteRef,
  ano: number,
): Promise<ContaAnalitica[]> {
  const arq = await caminhoEcdDoAno(cliente, ano);
  if (!arq) return [];
  const linhas = lerArquivoEcd(arq);
  const { contas, saldosPorConta } = extrairPlanoDominioDaEcd(linhas);
  if (contas.size === 0) return [];

  const dataFimAlvo = `3112${ano}`; // preferência: saldo em 31/12/AAAA
  const out: ContaAnalitica[] = [];

  for (const [codigo, plano] of contas) {
    if (plano.indCta !== "A") continue; // só analíticas
    const saldos = saldosPorConta.get(codigo);
    if (!saldos || saldos.length === 0) continue;

    // 1ª preferência: saldo em 31/12/AAAA. 2ª: último saldo do ano-base.
    // 3ª: último saldo disponível (assume que é o do fim do exercício).
    const saldo =
      saldos.find((s) => s.dataFim === dataFimAlvo) ||
      [...saldos].reverse().find((s) => s.dataFim.slice(4, 8) === String(ano)) ||
      saldos[saldos.length - 1];
    if (!saldo) continue;

    // Sintética preferencial: conta REFERENCIAL da RFB (I051). É o que a
    // Receita agrupa oficialmente — várias contas Dom (N) apontam pra 1
    // referencial (ex.: BB, Bradesco, Sicredi, Santander → "Bancos Conta
    // Movimento - No País"). Se não houver I051 (raro), cai na sintética
    // imediata do plano Dom.
    const rfb = plano.referenciais.find((r) => r.codEntRef === "1" || r.codEntRef === "");
    let codigoSintetica: string | undefined;
    let descricaoSintetica: string | undefined;
    if (rfb) {
      codigoSintetica = rfb.codCtaRef;
      // Descrição vem da tabela oficial da RFB embutida no repo — o I051 do
      // SPED só tem o código. Se o código não estiver na tabela (raro), cai
      // no próprio código pra mostrar algo.
      descricaoSintetica = descricaoReferencial(rfb.codCtaRef);
    } else {
      const s = sinteticaImediataI050(plano, contas);
      codigoSintetica = s?.codigo;
      descricaoSintetica = s?.descricao.trim() || s?.descNorm;
    }
    out.push({
      codigo, // COD_CTA sequencial — MESMO código que aparece na coluna "Código" do PDF Domínio
      descricao: plano.descricao.trim() || plano.descNorm,
      descNorm: descNormAgressiva(plano.descricao),
      valor: saldo.valorFinalSinal,
      // Grupo do BP: sobe a árvore I050 (COD_CTA_SUP) até achar Ativo/Passivo Circulante etc.
      grupo: grupoBpDoI050(plano, contas),
      codigoSintetica,
      descricaoSintetica,
    });
  }

  return out;
}

/**
 * Lê o SPED-ECD do ano na pasta única e devolve as contas analíticas do BP
 * (bloco J100 do J005 anual, ou do último trimestre se não houver anual).
 *
 * Aceita duas formas de nomenclatura na pasta do ano:
 *   - `<ano>.txt` (padronizado pela plataforma)
 *   - qualquer .txt cujo nome contém `<ano>0101-<ano>1231` (nome longo original
 *     do SPED, colocado pelo usuário sem renomear).
 */
export async function contasAnaliticasEcdDoAno(
  cliente: ClienteRef,
  ano: number,
): Promise<ContaAnalitica[]> {
  const arq = await caminhoEcdDoAno(cliente, ano);
  if (!arq) return [];
  const linhas = lerArquivoEcd(arq);
  const demonstracoes = extrairDemonstracoes(linhas).filter((d) => d.anoFim === ano);
  if (demonstracoes.length === 0) return [];
  const anual = demonstracoes.find((d) => d.anual);
  const dezembro = demonstracoes.find((d) => d.mesFim === 12 && d.diaFim === 31);
  const escolhida = anual ?? dezembro ?? demonstracoes[demonstracoes.length - 1];
  return contasAnaliticasEcd(escolhida.contasBP);
}
