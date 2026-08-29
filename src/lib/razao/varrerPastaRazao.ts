/**
 * Inventário da pasta RAZAO do cliente.
 *
 * Convenção (Higor, 29/08/2026): dentro da pasta do cliente existe uma pasta
 * `RAZAO` com um arquivo por tributo — "Razao ICMS", "Razao INSS", "Razao Pis"…
 * O nome do arquivo diz o tributo, então não há de-para a preencher.
 *
 * Cada empresa põe ali só os razões que tem. Por isso a ausência de um arquivo
 * é INFORMAÇÃO ("essa empresa não tem esse tributo"), não erro — a tela mostra
 * os nove tributos e marca quais existem.
 *
 * Este módulo NÃO extrai lançamentos ainda: ele localiza e identifica. A leitura
 * dos valores entra quando houver um razão real pra validar o layout — foi
 * justamente chutar layout que fez o parser do PGDAS confundir receita bruta
 * com imposto.
 */

import { readdirSync, statSync } from "node:fs";
import path from "node:path";
import { prisma } from "@/lib/db";
import { pastaCliente } from "@/lib/storage/filesystem";
import {
  detectarTributoPeloNome,
  TRIBUTOS_RAZAO,
  type TributoRazao,
} from "./tributos";

export interface ArquivoRazao {
  tributo: TributoRazao;
  arquivo: string; // caminho completo
  nome: string;
  tamanhoBytes: number;
  modificadoEm: Date;
}

export interface InventarioRazao {
  pastaRazao: string;
  existe: boolean;
  encontrados: ArquivoRazao[];
  /** Tributos da lista que não têm arquivo — a empresa pode simplesmente não ter. */
  ausentes: TributoRazao[];
  /** Arquivos na pasta cujo nome não identifica tributo (ou identifica dois). */
  naoIdentificados: Array<{ nome: string; motivo: string }>;
}

const NOME_PASTA = "RAZAO";

export async function inventariarRazao(clienteId: string): Promise<InventarioRazao> {
  const cliente = await prisma.cliente.findUnique({
    where: { id: clienteId },
    select: { razaoSocial: true, cnpj: true, pastaLocal: true },
  });
  if (!cliente) throw new Error("Cliente não encontrado.");

  const pastaRazao = path.join(pastaCliente(cliente), NOME_PASTA);
  const inventario: InventarioRazao = {
    pastaRazao,
    existe: false,
    encontrados: [],
    ausentes: [...TRIBUTOS_RAZAO],
    naoIdentificados: [],
  };

  let entradas;
  try {
    entradas = readdirSync(pastaRazao, { withFileTypes: true });
    inventario.existe = true;
  } catch {
    return inventario;
  }

  for (const e of entradas) {
    const completo = path.join(pastaRazao, e.name);
    // Aceita arquivo solto ou uma subpasta por tributo (o nome é que manda).
    if (e.isDirectory()) {
      const tributoPasta = detectarTributoPeloNome(e.name);
      if (!tributoPasta) {
        inventario.naoIdentificados.push({
          nome: e.name,
          motivo: "nome da subpasta não diz o tributo",
        });
        continue;
      }
      let internos;
      try {
        internos = readdirSync(completo, { withFileTypes: true });
      } catch {
        continue;
      }
      for (const i of internos) {
        if (!i.isFile()) continue;
        registrar(inventario, path.join(completo, i.name), i.name, tributoPasta);
      }
      continue;
    }
    if (!e.isFile()) continue;

    const tributo = detectarTributoPeloNome(e.name);
    if (!tributo) {
      inventario.naoIdentificados.push({
        nome: e.name,
        motivo: "nome não identifica um único tributo",
      });
      continue;
    }
    registrar(inventario, completo, e.name, tributo);
  }

  inventario.ausentes = TRIBUTOS_RAZAO.filter(
    (t) => !inventario.encontrados.some((a) => a.tributo === t),
  );
  return inventario;
}

function registrar(
  inventario: InventarioRazao,
  caminho: string,
  nome: string,
  tributo: TributoRazao,
) {
  try {
    const st = statSync(caminho);
    inventario.encontrados.push({
      tributo,
      arquivo: caminho,
      nome,
      tamanhoBytes: st.size,
      modificadoEm: st.mtime,
    });
  } catch {
    /* arquivo sumiu no meio da varredura — ignora */
  }
}
