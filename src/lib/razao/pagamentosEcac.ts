/**
 * Todos os pagamentos que a plataforma tem do e-CAC / comprovantes, por código
 * de receita — inclusive os que não pertencem a nenhum dos nove tributos.
 *
 * POR QUE ISTO EXISTE: a conciliação classifica pagamento por código, e o que
 * não casava com nenhum tributo sumia da tela sem aviso. Sumiram, na LUPO,
 * R$ 1.600,18 de dívida ativa do Simples e R$ 221,24 de multa da DCTFWeb.
 * Dinheiro pago que não aparece é pior que dinheiro divergente: ninguém procura
 * o que não sabe que existe.
 *
 * Regra de contagem (a mesma da conciliação, pra os totais fecharem):
 * documento COM desmembramento é contado pelas linhas do desmembramento;
 * documento sem desmembramento é contado pelo código principal. Assim o DARF
 * numerado da DCTFWeb (1410), que carrega INSS e IRRF dentro, não conta duas
 * vezes.
 */

import { prisma } from "@/lib/db";
import { tributoDoCodigoReceita } from "./conciliar";
import { ROTULO_TRIBUTO_RAZAO, type TributoRazao } from "./tributos";

export interface PagamentoPorCodigo {
  codigo: string;
  descricao: string | null;
  documentos: number;
  total: number;
  /** Tributo dos nove, quando o código pertence a um. */
  tributo: TributoRazao | null;
  /** Rótulo do destino: o tributo, ou o que é quando não é um dos nove. */
  destino: string;
  primeiraCompetencia: Date | null;
  ultimaCompetencia: Date | null;
}

/**
 * Códigos que aparecem no e-CAC mas NÃO são tributo corrente de nenhum dos
 * nove razões. Ficam visíveis com o nome do que são — nada de "não classificado"
 * quando a Receita já diz o que é.
 */
const FORA_DOS_NOVE: Record<string, string> = {
  // DAS de dívida ativa, desmembrado por tributo original.
  "1469": "Dívida ativa do Simples — IRPJ",
  "1470": "Dívida ativa do Simples — CSLL",
  "1471": "Dívida ativa do Simples — COFINS",
  "1472": "Dívida ativa do Simples — PIS",
  "1473": "Dívida ativa do Simples — INSS/CPP",
  "1474": "Dívida ativa do Simples — ISS",
  "1475": "Dívida ativa do Simples — Contribuição Previdenciária Patronal",
  "1476": "Dívida ativa do Simples — IPI",
  "1477": "Dívida ativa do Simples — ICMS",
  "1734": "DAS de dívida ativa (documento)",
  // Multas por atraso de declaração.
  "5440": "MAED — multa por atraso da DCTFWeb",
  "4444": "Multa / acréscimo",
  "6621": "Multa / acréscimo",
};

export async function resumirPagamentosPorCodigo(params: {
  clienteId: string;
  de: Date;
  ate: Date;
}): Promise<PagamentoPorCodigo[]> {
  const { clienteId, de, ate } = params;

  const [pagamentos, desmembramentos] = await Promise.all([
    prisma.ecacPagamento.findMany({
      where: { clienteId, periodoApuracao: { gte: de, lte: ate } },
      select: {
        id: true,
        codigoReceitaPrincipal: true,
        descricaoReceitaPrincipal: true,
        tipoDescricao: true,
        periodoApuracao: true,
        valorTotal: true,
      },
    }),
    prisma.ecacDesmembramento.findMany({
      where: { pagamento: { clienteId }, periodoApuracao: { gte: de, lte: ate } },
      select: {
        pagamentoId: true,
        codigoReceita: true,
        descricaoReceita: true,
        periodoApuracao: true,
        valorTotal: true,
      },
    }),
  ]);

  const comDesmembramento = new Set(desmembramentos.map((d) => d.pagamentoId));
  const mapa = new Map<string, PagamentoPorCodigo>();

  const somar = (
    codigo: string,
    descricao: string | null,
    valor: number,
    competencia: Date,
  ) => {
    const chave = codigo.replace(/^0+/, "") || codigo;
    const tributo = tributoDoCodigoReceita(codigo);
    const atual =
      mapa.get(chave) ??
      ({
        codigo,
        descricao,
        documentos: 0,
        total: 0,
        tributo,
        destino: tributo
          ? ROTULO_TRIBUTO_RAZAO[tributo]
          : (FORA_DOS_NOVE[chave] ?? "Fora dos nove tributos"),
        primeiraCompetencia: null,
        ultimaCompetencia: null,
      } satisfies PagamentoPorCodigo);
    atual.documentos++;
    atual.total += valor;
    if (!atual.descricao && descricao) atual.descricao = descricao;
    if (!atual.primeiraCompetencia || competencia < atual.primeiraCompetencia) {
      atual.primeiraCompetencia = competencia;
    }
    if (!atual.ultimaCompetencia || competencia > atual.ultimaCompetencia) {
      atual.ultimaCompetencia = competencia;
    }
    mapa.set(chave, atual);
  };

  for (const d of desmembramentos) {
    somar(d.codigoReceita, d.descricaoReceita, Number(d.valorTotal), d.periodoApuracao);
  }
  for (const p of pagamentos) {
    if (comDesmembramento.has(p.id)) continue;
    somar(
      p.codigoReceitaPrincipal,
      p.descricaoReceitaPrincipal ?? p.tipoDescricao,
      Number(p.valorTotal),
      p.periodoApuracao,
    );
  }

  return [...mapa.values()].sort((a, b) => b.total - a.total);
}
