/**
 * Parser da tabela de tributação NCM que o cliente JÁ TEM no Domínio.
 *
 * Origem (16/08/2026): a Casa São Paulo já operava com uma tabela própria de 70
 * códigos e 98 NCMs. A premissa anterior do módulo — montar a vigência do zero
 * e só incluir os novos — não servia: a classificação dela é distinta da nossa
 * e é ela que vale, porque é a que está no Domínio do cliente.
 *
 * FORMATO (validado com arquivo real da Casa São Paulo):
 *
 *   codigo|descricao|ncm
 *   6|DE MATÉRIAS TÊXTEIS|61034900
 *
 * - Separador PIPE. É o mesmo leiaute do TXT que a plataforma exporta
 *   (`gerar-txt-dominio`), porém sem os campos fiscais: o arquivo do cliente
 *   traz só o agrupamento código→NCM, sem CST nem natureza.
 * - Encoding WINDOWS-1252. Ler como UTF-8 transforma "CALÇADOS" em lixo.
 * - Um código agrupa VÁRIOS NCMs (código 6 tem 6 NCMs).
 * - O arquivo costuma vir sem extensão (visto como `ncm`).
 *
 * ⚠️ Os códigos são do ESPAÇO DO CLIENTE e não têm relação com
 * `ConfiguracaoNcm.codigo`, que é global e compartilhado entre escritórios.
 * Na Casa São Paulo o código 32 é "ARTIGOS PARA TÊNIS DE MESA"; no nosso
 * catálogo o 32 é "MONOFASICO - 202". Nunca traduzir um pelo outro.
 *
 * Fiel ao arquivo: não corrige, não adivinha, não descarta silenciosamente.
 * Linha inválida vira `aviso` pro contador decidir.
 */

export interface LinhaTabelaLegada {
  codigo: number;
  descricao: string;
  ncm: string; // 8 dígitos
}

export interface GrupoLegado {
  codigo: number;
  descricao: string;
  ncms: string[];
}

export interface ResultadoTabelaLegada {
  linhas: LinhaTabelaLegada[];
  grupos: GrupoLegado[];
  /** NCMs únicos, deduplicados. */
  ncmsUnicos: string[];
  /** Maior código encontrado — a numeração dos novos continua daqui. */
  maiorCodigo: number;
  /** Problemas encontrados, com o número da linha. Nunca silenciados. */
  avisos: string[];
}

/** Decodifica bytes Windows-1252 preservando acentuação. */
export function decodificarLatin1(bytes: Uint8Array): string {
  return new TextDecoder("windows-1252").decode(bytes);
}

export function parseTabelaLegada(conteudo: string | Uint8Array): ResultadoTabelaLegada {
  const texto = typeof conteudo === "string" ? conteudo : decodificarLatin1(conteudo);
  const avisos: string[] = [];
  const linhas: LinhaTabelaLegada[] = [];
  const vistos = new Map<string, number>(); // ncm -> código onde apareceu primeiro

  const brutas = texto.split(/\r?\n/);
  for (let i = 0; i < brutas.length; i++) {
    const bruta = brutas[i];
    if (!bruta.trim()) continue;

    const partes = bruta.split("|");
    if (partes.length < 3) {
      avisos.push(`Linha ${i + 1}: esperava 3 campos separados por "|", veio ${partes.length}.`);
      continue;
    }

    const codigoTxt = partes[0].trim();
    const codigo = Number(codigoTxt);
    if (!Number.isInteger(codigo) || codigo <= 0) {
      avisos.push(`Linha ${i + 1}: código inválido ("${codigoTxt}").`);
      continue;
    }

    const descricao = partes[1].trim();
    if (!descricao) avisos.push(`Linha ${i + 1}: descrição vazia no código ${codigo}.`);

    const ncmBruto = partes[2].trim();
    const ncm = ncmBruto.replace(/\D/g, "");
    if (ncm.length !== 8) {
      avisos.push(`Linha ${i + 1}: NCM "${ncmBruto}" não tem 8 dígitos.`);
      continue;
    }

    const anterior = vistos.get(ncm);
    if (anterior !== undefined && anterior !== codigo) {
      // O mesmo NCM em dois códigos é incoerência DA TABELA DO CLIENTE.
      // Importa assim mesmo (fiel) e avisa — quem decide é o contador.
      avisos.push(
        `Linha ${i + 1}: NCM ${ncm} aparece no código ${codigo} e também no ${anterior}.`,
      );
    }
    vistos.set(ncm, codigo);

    linhas.push({ codigo, descricao, ncm });
  }

  // Agrupa mantendo a primeira descrição vista para cada código.
  const porCodigo = new Map<number, GrupoLegado>();
  for (const l of linhas) {
    const atual = porCodigo.get(l.codigo);
    if (atual) {
      if (!atual.ncms.includes(l.ncm)) atual.ncms.push(l.ncm);
      if (atual.descricao !== l.descricao) {
        avisos.push(
          `Código ${l.codigo} aparece com descrições diferentes ("${atual.descricao}" e "${l.descricao}"). Mantida a primeira.`,
        );
      }
    } else {
      porCodigo.set(l.codigo, { codigo: l.codigo, descricao: l.descricao, ncms: [l.ncm] });
    }
  }

  const grupos = [...porCodigo.values()].sort((a, b) => a.codigo - b.codigo);
  const ncmsUnicos = [...new Set(linhas.map((l) => l.ncm))];
  const maiorCodigo = grupos.length ? grupos[grupos.length - 1].codigo : 0;

  return { linhas, grupos, ncmsUnicos, maiorCodigo, avisos };
}
