import { prisma } from "@/lib/db";
import {
  prazoDctfAntiga,
  prazoDctfWeb,
  prazoDefis,
  prazoEcd,
  prazoEcf,
  prazoEfdContribuicoes,
  prazoMit,
  prazoPgdasd,
} from "./prazos";
import {
  ehExclusivaDoSimples,
  foraDaVigencia,
  frequencia,
  TIPOS_OBRIGACAO,
  type TipoObrigacao,
} from "./tipos";

export type StatusEntrega = "NO_PRAZO" | "EM_ATRASO" | "NAO_LOCALIZADA";

export type FonteRegistrada =
  | "ARQUIVO_DISCO" // varredura da pasta (mtime)
  | "DCTFWEB_SERPRO" // consulta SERPRO (dataRecepcao)
  | "PORTAL_SIMPLES" // robô Playwright no Portal Simples Nacional (PGDAS/DEFIS)
  | "MANUAL"; // contador registrou à mão

export type CelulaObrigacao = {
  tipo: TipoObrigacao;
  ano: number;
  mes: number | null;
  prazoLegal: Date;
  dataEntrega: Date | null;
  fonte: FonteRegistrada | null;
  status: StatusEntrega;
  diasAtraso: number; // 0 se no prazo, positivo se em atraso, 0 se não localizada
  referenciaExterna?: string | null; // ex: nº recibo, caminho do arquivo
};

export type GradeObrigacoes = {
  cliente: {
    id: string;
    razaoSocial: string;
    nomeFantasia: string | null;
    cnpj: string | null;
    regimeTributario: string | null;
    incluirNoRelatorio: boolean;
  };
  anoInicial: number;
  anoFinal: number;
  celulas: CelulaObrigacao[];
  resumoPorTipo: Array<{
    tipo: TipoObrigacao;
    esperadas: number;
    noPrazo: number;
    emAtraso: number;
    naoLocalizadas: number;
  }>;
  totais: {
    esperadas: number;
    noPrazo: number;
    emAtraso: number;
    naoLocalizadas: number;
  };
};

const SIMPLES_LABELS = ["Simples Nacional", "SIMPLES", "Simples", "MEI"];

function ehSimples(regime: string | null | undefined): boolean {
  if (!regime) return false;
  const r = regime.trim();
  return SIMPLES_LABELS.some((l) => r.toLowerCase().includes(l.toLowerCase()));
}

function calcularPrazo(tipo: TipoObrigacao, ano: number, mes: number | null): Date {
  switch (tipo) {
    case "ECD":
      return prazoEcd(ano);
    case "ECF":
      return prazoEcf(ano);
    case "DEFIS":
      return prazoDefis(ano);
    case "EFD_CONTRIBUICOES":
      return prazoEfdContribuicoes(ano, mes!);
    case "DCTF_ANTIGA":
      return prazoDctfAntiga(ano, mes!);
    case "DCTFWEB":
      return prazoDctfWeb(ano, mes!);
    case "MIT":
      return prazoMit(ano, mes!);
    case "PGDAS_D":
      return prazoPgdasd(ano, mes!);
  }
}

function diffDiasCorridos(a: Date, b: Date): number {
  const MS = 24 * 60 * 60 * 1000;
  return Math.round((a.getTime() - b.getTime()) / MS);
}

function chaveCompetencia(ano: number, mes: number | null): string {
  return `${ano}-${mes ?? 0}`;
}

/**
 * Monta a grade completa de obrigações esperadas × entregas registradas pra um
 * cliente e um range de anos. Todo o trabalho é feito aqui — a página consome
 * o retorno e só se preocupa com o layout.
 */
export async function consolidarObrigacoes(params: {
  clienteId: string;
  anoInicial: number;
  anoFinal: number;
}): Promise<GradeObrigacoes> {
  const { clienteId, anoInicial, anoFinal } = params;

  const cliente = await prisma.cliente.findUniqueOrThrow({
    where: { id: clienteId },
    select: {
      id: true,
      razaoSocial: true,
      nomeFantasia: true,
      cnpj: true,
      regimeTributario: true,
      incluirObrigacoesNoRelatorio: true,
    },
  });

  const inicioRange = new Date(Date.UTC(anoInicial, 0, 1));
  const fimRange = new Date(Date.UTC(anoFinal, 11, 31));

  // Busca paralelizada — cada fonte é independente.
  const [arquivos, entregas, dctfWebs] = await Promise.all([
    prisma.arquivoObrigacaoDetectado.findMany({
      where: {
        clienteId,
        ano: { gte: anoInicial, lte: anoFinal },
      },
      select: {
        tipoObrigacao: true,
        ano: true,
        mes: true,
        mtime: true,
        caminho: true,
        nomeArquivo: true,
      },
    }),
    prisma.entregaObrigacaoManual.findMany({
      where: {
        clienteId,
        ano: { gte: anoInicial, lte: anoFinal },
      },
      select: {
        tipoObrigacao: true,
        ano: true,
        mes: true,
        dataEntrega: true,
        numeroRecibo: true,
        origem: true,
      },
    }),
    prisma.dctfWebDeclaracao.findMany({
      where: {
        clienteId,
        periodoApuracao: { gte: inicioRange, lte: fimRange },
        origem: "DCTFWEB", // ignora DCTF antiga aqui — vem por outra fonte
      },
      select: {
        periodoApuracao: true,
        dataRecepcao: true,
        numeroRecibo: true,
        transmitida: true,
      },
    }),
  ]);

  // Indexa fontes por (tipo, ano, mes) pra lookup O(1).
  const idxArquivos = new Map<string, (typeof arquivos)[number]>();
  for (const a of arquivos) {
    idxArquivos.set(`${a.tipoObrigacao}|${a.ano}|${a.mes ?? 0}`, a);
  }
  const idxEntregas = new Map<string, (typeof entregas)[number]>();
  for (const e of entregas) {
    idxEntregas.set(`${e.tipoObrigacao}|${e.ano}|${e.mes ?? 0}`, e);
  }
  const idxDctfWeb = new Map<string, (typeof dctfWebs)[number]>();
  for (const d of dctfWebs) {
    if (!d.transmitida) continue;
    const ano = d.periodoApuracao.getUTCFullYear();
    const mes = d.periodoApuracao.getUTCMonth() + 1;
    // Pode ter várias categorias por competência (Geral, 13Salario...) — mantém
    // a com dataRecepcao mais antiga (primeira transmissão).
    const k = `DCTFWEB|${ano}|${mes}`;
    const existente = idxDctfWeb.get(k);
    if (
      !existente ||
      (d.dataRecepcao && existente.dataRecepcao && d.dataRecepcao < existente.dataRecepcao)
    ) {
      idxDctfWeb.set(k, d);
    }
  }

  const clienteEhSimples = ehSimples(cliente.regimeTributario);

  const celulas: CelulaObrigacao[] = [];
  for (const tipo of TIPOS_OBRIGACAO) {
    if (ehExclusivaDoSimples(tipo) && !clienteEhSimples) continue;
    const mensal = frequencia(tipo) === "MENSAL";

    for (let ano = anoInicial; ano <= anoFinal; ano++) {
      const meses: (number | null)[] = mensal
        ? [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]
        : [null];

      for (const mes of meses) {
        if (foraDaVigencia(tipo, ano, mes)) continue;

        const prazoLegal = calcularPrazo(tipo, ano, mes);
        const chave = `${tipo}|${ano}|${mes ?? 0}`;

        let dataEntrega: Date | null = null;
        let fonte: FonteRegistrada | null = null;
        let referenciaExterna: string | null = null;

        if (tipo === "DCTFWEB") {
          const d = idxDctfWeb.get(chave);
          if (d?.dataRecepcao) {
            dataEntrega = d.dataRecepcao;
            fonte = "DCTFWEB_SERPRO";
            referenciaExterna = d.numeroRecibo ?? null;
          }
        } else if (tipo === "MIT" || tipo === "PGDAS_D" || tipo === "DEFIS") {
          const e = idxEntregas.get(chave);
          if (e) {
            dataEntrega = e.dataEntrega;
            fonte = e.origem === "PORTAL_SIMPLES" ? "PORTAL_SIMPLES" : "MANUAL";
            referenciaExterna = e.numeroRecibo ?? null;
          }
        } else {
          const a = idxArquivos.get(chave);
          if (a) {
            dataEntrega = a.mtime;
            fonte = "ARQUIVO_DISCO";
            referenciaExterna = a.nomeArquivo;
          }
        }

        let status: StatusEntrega;
        let diasAtraso = 0;
        if (!dataEntrega) {
          status = "NAO_LOCALIZADA";
        } else if (dataEntrega <= prazoLegal) {
          status = "NO_PRAZO";
        } else {
          status = "EM_ATRASO";
          diasAtraso = diffDiasCorridos(dataEntrega, prazoLegal);
        }

        celulas.push({
          tipo,
          ano,
          mes,
          prazoLegal,
          dataEntrega,
          fonte,
          status,
          diasAtraso,
          referenciaExterna,
        });
      }
    }
  }

  // Resumo por tipo — pra os cards do topo.
  const resumoPorTipo = TIPOS_OBRIGACAO.filter((tipo) => {
    return !(ehExclusivaDoSimples(tipo) && !clienteEhSimples);
  }).map((tipo) => {
    const doTipo = celulas.filter((c) => c.tipo === tipo);
    return {
      tipo,
      esperadas: doTipo.length,
      noPrazo: doTipo.filter((c) => c.status === "NO_PRAZO").length,
      emAtraso: doTipo.filter((c) => c.status === "EM_ATRASO").length,
      naoLocalizadas: doTipo.filter((c) => c.status === "NAO_LOCALIZADA").length,
    };
  });

  const totais = {
    esperadas: celulas.length,
    noPrazo: celulas.filter((c) => c.status === "NO_PRAZO").length,
    emAtraso: celulas.filter((c) => c.status === "EM_ATRASO").length,
    naoLocalizadas: celulas.filter((c) => c.status === "NAO_LOCALIZADA").length,
  };

  void chaveCompetencia; // silencia lint — mantido no arquivo pra debug futuro

  return {
    cliente: {
      id: cliente.id,
      razaoSocial: cliente.razaoSocial,
      nomeFantasia: cliente.nomeFantasia,
      cnpj: cliente.cnpj,
      regimeTributario: cliente.regimeTributario,
      incluirNoRelatorio: cliente.incluirObrigacoesNoRelatorio,
    },
    anoInicial,
    anoFinal,
    celulas,
    resumoPorTipo,
    totais,
  };
}
