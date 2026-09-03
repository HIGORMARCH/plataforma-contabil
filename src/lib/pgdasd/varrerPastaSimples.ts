/**
 * Varredura da pasta do cliente atrás de DAS e comprovantes de pagamento.
 *
 * Os dois documentos convivem na mesma pasta (`FISCAL\IMPOSTOS\SIMPLES NACIONAL`)
 * e o nome do arquivo não é confiável pra distinguir — na LUPO há
 * `PGDASD-DAS-12.2025.pdf`, `PGD-DAS-03.2026_TR.pdf` e `PAGAMENTO 2025.pdf`.
 * Por isso a decisão é pelo CONTEÚDO: cada PDF é lido e o texto diz o que ele é.
 *
 *   guia DAS   → "Documento de Arrecadação do Simples Nacional"  → DasSimplesGuia
 *   comprovante → "registro de arrecadação de DAS/DARF"          → EcacPagamento
 *
 * O comprovante entra na MESMA tabela dos pagamentos do e-CAC (origem
 * "COMPROVANTE_PDF"), com chave cliente + número do documento: se o mesmo
 * pagamento já veio pelo robô do e-CAC, ele é atualizado, não duplicado.
 *
 * Nada é copiado nem movido: os PDFs são lidos onde estão e descartados da
 * memória. Só os valores ficam.
 */

import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { prisma } from "@/lib/db";
import { Prisma } from "@prisma/client";
import { pastaCliente } from "@/lib/storage/filesystem";
import { parseDasSimples } from "./parseDasPdf";
import { parseComprovanteArrecadacao, type Arrecadacao } from "./parseComprovanteArrecadacao";

export interface ResultadoVarredura {
  pastaLida: string;
  pdfsEncontrados: number;
  guiasGravadas: number;
  pagamentosGravados: number;
  ignorados: Array<{ arquivo: string; motivo: string }>;
  alertas: string[];
}

/** Todos os PDFs abaixo de um diretório (recursivo, tolerante a erro). */
function listarPdfs(raiz: string, limite = 500): string[] {
  const achados: string[] = [];
  const pilha = [raiz];
  while (pilha.length > 0 && achados.length < limite) {
    const dir = pilha.pop()!;
    let entradas;
    try {
      entradas = readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const e of entradas) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) pilha.push(p);
      else if (e.name.toLowerCase().endsWith(".pdf")) achados.push(p);
    }
  }
  return achados;
}

function competenciaUtc(ano: number, mes: number): Date {
  return new Date(Date.UTC(ano, mes - 1, 1));
}

function dec(n: number): Prisma.Decimal {
  return new Prisma.Decimal(n.toFixed(2));
}

/**
 * Varre a pasta do cliente (ou uma subpasta dela) e grava o que encontrar.
 *
 * `subpasta` limita o alcance — o default é a pasta do Simples Nacional, que é
 * onde DAS e comprovantes ficam. Passar "" varre a pasta inteira do cliente.
 */
export async function varrerPastaSimples(params: {
  clienteId: string;
  subpasta?: string;
}): Promise<ResultadoVarredura> {
  const cliente = await prisma.cliente.findUnique({
    where: { id: params.clienteId },
    select: { razaoSocial: true, cnpj: true, pastaLocal: true },
  });
  if (!cliente) throw new Error("Cliente não encontrado.");

  const base = pastaCliente(cliente);
  const subpasta = params.subpasta ?? path.join("GUIAS", "SIMPLES NACIONAL");
  const pastaLida = subpasta ? path.join(base, subpasta) : base;

  const pdfs = listarPdfs(pastaLida);
  const resultado: ResultadoVarredura = {
    pastaLida,
    pdfsEncontrados: pdfs.length,
    guiasGravadas: 0,
    pagamentosGravados: 0,
    ignorados: [],
    alertas: [],
  };

  if (pdfs.length === 0) {
    resultado.alertas.push(
      `Nenhum PDF em ${pastaLida}. Confira a pasta do cliente no cadastro — ela precisa apontar pra pasta que existe em disco.`,
    );
    return resultado;
  }

  const { PDFParse } = await import("pdf-parse");

  for (const arquivo of pdfs) {
    const nome = path.basename(arquivo);
    let texto: string;
    let hash: string;
    try {
      const bytes = readFileSync(arquivo);
      hash = createHash("sha256").update(bytes).digest("hex");
      texto = (await new PDFParse({ data: bytes }).getText()).text;
    } catch (e) {
      resultado.ignorados.push({
        arquivo: nome,
        motivo: `não deu pra ler: ${e instanceof Error ? e.message : String(e)}`,
      });
      continue;
    }

    // 1) Comprovante de arrecadação — pode ter o ano inteiro em várias páginas.
    const comprovante = parseComprovanteArrecadacao(texto);
    if (comprovante.arrecadacoes.length > 0) {
      for (const a of comprovante.arrecadacoes) {
        await gravarPagamento(params.clienteId, a, nome);
        resultado.pagamentosGravados++;
      }
      for (const p of comprovante.paginasIgnoradas) {
        resultado.ignorados.push({ arquivo: `${nome} (pág. ${p.pagina})`, motivo: p.motivo });
      }
      continue;
    }

    // 2) Guia DAS.
    const guia = parseDasSimples(texto);
    if (guia.ok) {
      const d = guia.das;
      if (!d.numeroDocumento) {
        resultado.ignorados.push({ arquivo: nome, motivo: "guia sem número do documento" });
        continue;
      }
      const dados = {
        periodoApuracao: competenciaUtc(d.ano, d.mes),
        dataVencimento: d.dataVencimento,
        valorTotal: dec(d.valorTotal),
        principal: dec(d.principal),
        multa: dec(d.multa),
        juros: dec(d.juros),
        composicao: d.composicao as unknown as Prisma.InputJsonValue,
        arquivoNome: nome,
        arquivoHash: hash,
        alertas: d.alertas,
        lidoEm: new Date(),
      };
      await prisma.dasSimplesGuia.upsert({
        where: {
          clienteId_numeroDocumento: {
            clienteId: params.clienteId,
            numeroDocumento: d.numeroDocumento,
          },
        },
        create: { clienteId: params.clienteId, numeroDocumento: d.numeroDocumento, ...dados },
        update: dados,
      });
      resultado.guiasGravadas++;
      continue;
    }

    resultado.ignorados.push({ arquivo: nome, motivo: guia.motivo });
  }

  return resultado;
}

/**
 * Grava um documento pago na mesma tabela dos pagamentos do e-CAC.
 *
 * O desmembramento é reescrito a cada leitura (deleteMany + create): o
 * comprovante é imutável, então reprocessar o mesmo arquivo não pode multiplicar
 * linhas de composição.
 */
async function gravarPagamento(clienteId: string, a: Arrecadacao, arquivo: string) {
  const competencia = competenciaUtc(a.ano, a.mes);
  const principalDaLinha = a.composicao[0];

  // O MESMO pagamento chega pelas duas fontes com o número escrito diferente: o
  // e-CAC devolve "7202534312242658" e o comprovante imprime
  // "07202534312242658". Sem tirar o zero à esquerda, cada pagamento vira dois
  // registros e todo total dobra. A forma sem zeros é a canônica.
  const numeroDocumento = a.numeroDocumento.replace(/^0+/, "");

  const ehDas = a.tipo === "DAS";
  const existente = await prisma.ecacPagamento.findUnique({
    where: { clienteId_numeroDocumento: { clienteId, numeroDocumento } },
    select: { id: true, origem: true, tipoCodigo: true, tipoDescricao: true },
  });

  const dados = {
    // Quando o pagamento já veio do e-CAC, a origem passa a registrar as duas —
    // o comprovante não substitui o robô, ele acrescenta a composição.
    origem: existente && existente.origem === "ECAC" ? "ECAC+COMPROVANTE" : "COMPROVANTE_PDF",
    // Taxonomia do e-CAC (9 = DAS, 4 = DARF) para os dois lados falarem a mesma
    // língua. Registro que já existia mantém o tipo que o robô atribuiu.
    tipoCodigo: existente?.tipoCodigo ?? (ehDas ? "9" : "4"),
    tipoDescricao:
      existente?.tipoDescricao ??
      (ehDas ? "DOCUMENTO DE ARRECADAÇÃO DO SIMPLES NACIONAL" : "DARF"),
    referencia: a.banco ? `${a.banco}${a.agencia ? ` · ag. ${a.agencia}` : ""} · ${arquivo}` : arquivo,
    periodoApuracao: competencia,
    dataArrecadacao: a.dataArrecadacao ?? a.dataVencimento ?? competencia,
    dataVencimento: a.dataVencimento ?? competencia,
    codigoReceitaPrincipal: ehDas ? "3333" : (principalDaLinha?.codigo ?? "0000"),
    descricaoReceitaPrincipal: ehDas
      ? "Documento de Arrecadação do Simples Nacional"
      : (principalDaLinha?.denominacao ?? a.tipo),
    valorTotal: dec(a.valorTotal),
    valorPrincipal: dec(a.principal),
    valorMulta: dec(a.multa),
    valorJuros: dec(a.juros),
    sincronizadoEm: new Date(),
  };

  const pagamento = await prisma.ecacPagamento.upsert({
    where: { clienteId_numeroDocumento: { clienteId, numeroDocumento } },
    create: { clienteId, numeroDocumento, ...dados },
    update: dados,
  });

  await prisma.ecacDesmembramento.deleteMany({ where: { pagamentoId: pagamento.id } });
  if (a.composicao.length > 0) {
    await prisma.ecacDesmembramento.createMany({
      data: a.composicao.map((l, i) => ({
        pagamentoId: pagamento.id,
        sequencial: String(i + 1).padStart(2, "0"),
        codigoReceita: l.codigo,
        descricaoReceita: l.denominacao,
        periodoApuracao: competencia,
        dataVencimento: a.dataVencimento ?? competencia,
        valorTotal: dec(l.total),
        valorPrincipal: dec(l.principal),
        valorMulta: dec(l.multa),
        valorJuros: dec(l.juros),
      })),
    });
  }
}
