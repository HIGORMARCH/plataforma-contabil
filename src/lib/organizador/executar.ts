/**
 * O robô organizador: varre os endereços cadastrados, identifica cada arquivo
 * pelo conteúdo e o arquiva na pasta da empresa, com nome padronizado.
 *
 * DUAS FASES, e a ordem importa:
 *
 *   1. IDENTIFICA tudo — lê e classifica cada arquivo, sem mexer em nada.
 *   2. DECIDE e age — só depois de conhecer o conjunto inteiro.
 *
 * A separação existe por um motivo concreto: empresa muda de nome. O CNPJ
 * 43.211.383/0001-50 assina "PONTO FORTE DISTRIBUIDORA" em 2022 e "CRS
 * ATACADISTA DE MATERIAL DE CONSTRUÇÃO" em 2023 — mesma inscrição estadual,
 * mesma empresa. Decidindo arquivo a arquivo, o robô criaria duas pastas para
 * ela. Vendo o conjunto, ele escolhe UM nome por CNPJ: o mais recente.
 *
 * DUAS AÇÕES, CONFORME A ORIGEM:
 *
 *   origem DENTRO de C:\PlataformaContabil  → MOVE (organiza no lugar)
 *   origem FORA (Z:, Downloads, pen drive)  → COPIA (nunca toca no original)
 *
 * MODO SIMULAÇÃO É O PADRÃO. `simular: true` percorre tudo, decide tudo, e não
 * escreve um byte.
 *
 * IDEMPOTENTE POR CONTEÚDO: a chave é o SHA-256. O mesmo documento chegando por
 * dois endereços, com dois nomes, é arquivado uma vez só.
 */

import { createHash } from "node:crypto";
import { existsSync, readdirSync } from "node:fs";
import { copyFile, mkdir, readdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { prisma } from "@/lib/db";
import { pastaCliente, pastaRaiz } from "@/lib/storage/filesystem";
import {
  classificarPdf,
  classificarTexto,
  pareceRazaoSocial,
  validarCnpj,
  type Classificacao,
} from "./classificar";
import { destinoDoDocumento } from "./destino";

/** Quanto do arquivo basta ler pra identificar (o registro 0000 está no topo). */
const AMOSTRA_BYTES = 8 * 1024;
/** Teto de arquivos por execução — evita varredura infinita em pasta gigante. */
const LIMITE_ARQUIVOS = 5000;

// O ".rec" entra aqui porque é o recibo de transmissão em formato de máquina:
// 357 deles estavam parados em DECLARACOES, invisíveis para o robô.
const EXTENSOES = new Set([".pdf", ".txt", ".dec", ".xml", ".rec"]);

/**
 * Pastas que o robô não varre.
 *
 * `DOCUMENTOS FISCAIS` fica de fora de propósito: são centenas de XML e zip de
 * nota por cliente, já organizados por competência pelo escritório, e que o
 * organizador não teria o que melhorar — entrariam no relatório só como ruído.
 */
const PASTAS_IGNORADAS = new Set([
  "_A CLASSIFICAR",
  // `_QUARENTENA` NÃO entra aqui de propósito: o robô precisa reexaminá-la a
  // cada passagem. Quando o classificador aprende um formato novo, o que estava
  // parado sai sozinho — foi o que aconteceu com 100+ PISCOFINS. Ignorar a
  // quarentena a transformaria em cemitério.
  "DOCUMENTOS FISCAIS",
  "node_modules",
  ".git",
  "$RECYCLE.BIN",
  "System Volume Information",
]);

/** Onde fica o que o robô não soube arquivar. */
const PASTA_QUARENTENA = "_QUARENTENA";
/** Subpasta de quem o robô não conseguiu identificar. */
const SEM_IDENTIFICACAO = "_SEM IDENTIFICACAO";

export type StatusItem =
  | "ARQUIVADO"
  | "JA_NO_LUGAR"
  | "JA_EXISTIA"
  | "CONFLITO"
  | "QUARENTENA"
  | "ERRO";

export interface ItemOrganizado {
  origem: string;
  nomeArquivo: string;
  status: StatusItem;
  tipo: string | null;
  cliente: string | null;
  destino: string | null;
  acao: "mover" | "copiar" | null;
  detalhe: string;
}

export interface RelatorioOrganizacao {
  simulado: boolean;
  origens: string[];
  arquivosVistos: number;
  arquivados: number;
  jaNoLugar: number;
  jaExistia: number;
  conflitos: number;
  quarentena: number;
  erros: number;
  itens: ItemOrganizado[];
}

async function listarArquivos(raiz: string, recursivo: boolean): Promise<string[]> {
  const achados: string[] = [];
  const pilha = [raiz];
  while (pilha.length > 0 && achados.length < LIMITE_ARQUIVOS) {
    const dir = pilha.pop()!;
    let entradas;
    try {
      entradas = await readdir(dir, { withFileTypes: true });
    } catch {
      continue; // pasta sem permissão ou sumiu no meio da varredura
    }
    for (const e of entradas) {
      const completo = path.join(dir, e.name);
      if (e.isDirectory()) {
        if (recursivo && !PASTAS_IGNORADAS.has(e.name)) pilha.push(completo);
        continue;
      }
      if (!e.isFile()) continue;
      if (EXTENSOES.has(path.extname(e.name).toLowerCase())) achados.push(completo);
    }
  }
  return achados;
}

async function hashDoArquivo(caminho: string): Promise<string> {
  const bytes = await readFile(caminho);
  return createHash("sha256").update(bytes).digest("hex");
}

/** Lê o começo do arquivo como texto (identificação de SPED/DCTF/GIAM). */
async function amostraTexto(caminho: string): Promise<string> {
  const bytes = await readFile(caminho);
  return bytes.subarray(0, AMOSTRA_BYTES).toString("latin1");
}

async function classificarArquivo(
  caminho: string,
): Promise<{ ok: true; classificacao: Classificacao } | { ok: false; motivo: string }> {
  const ext = path.extname(caminho).toLowerCase();
  const nome = path.basename(caminho);

  if (ext === ".pdf") {
    try {
      const { PDFParse } = await import("pdf-parse");
      const { text } = await new PDFParse({ data: await readFile(caminho) }).getText();
      if (!text.trim()) {
        return { ok: false, motivo: "PDF sem texto (digitalizado?) — precisa de OCR" };
      }
      return classificarPdf(text, nome);
    } catch (e) {
      return {
        ok: false,
        motivo: `falha ao ler o PDF: ${e instanceof Error ? e.message : String(e)}`,
      };
    }
  }

  return classificarTexto(ext, await amostraTexto(caminho), nome);
}

/** O arquivo está debaixo da raiz da plataforma? Define mover vs copiar. */
function dentroDaRaiz(caminho: string, raiz: string): boolean {
  const rel = path.relative(raiz, caminho);
  return !rel.startsWith("..") && !path.isAbsolute(rel);
}

/** Nome de pasta no padrão da plataforma: RAZAO_SOCIAL_CNPJ, sem acento. */
function nomearPasta(razaoSocial: string, cnpj: string): string {
  const razao = razaoSocial
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Za-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .toUpperCase();
  return `${razao}_${cnpj}`;
}

/** Pasta que já existe na raiz terminando neste CNPJ, se houver. */
function pastaExistenteDoCnpj(raiz: string, cnpj: string): string | null {
  try {
    const achada = readdirSync(raiz, { withFileTypes: true }).find(
      (e) => e.isDirectory() && e.name.endsWith(`_${cnpj}`),
    );
    return achada ? path.join(raiz, achada.name) : null;
  } catch {
    return null;
  }
}

/**
 * A pasta de empresa mais próxima acima do arquivo — a que termina em `_CNPJ`.
 *
 * Serve de último recurso para documento cujo conteúdo não identifica ninguém.
 * Também atende a quarentena, cujos grupos são nomeados com o CNPJ apurado.
 */
function pastaAncestralComCnpj(arquivo: string, raiz: string): string | null {
  let atual = path.dirname(arquivo);
  while (atual.startsWith(raiz) && atual !== raiz) {
    const nome = path.basename(atual);
    const cnpj = /_(\d{14})$/.exec(nome)?.[1];
    if (cnpj && validarCnpj(cnpj)) {
      // Na quarentena o grupo é uma cópia do nome da empresa: a pasta de
      // verdade é a da raiz, não a da quarentena.
      return pastaExistenteDoCnpj(raiz, cnpj) ?? path.join(raiz, nome);
    }
    atual = path.dirname(atual);
  }
  return null;
}

/**
 * A competência de um `.REC`, descoberta pelo hash do SPED.
 *
 * O `.REC` traz o hash do arquivo transmitido, e esse mesmo hash está impresso
 * no recibo em PDF — que já está arquivado com a competência no nome. Achando o
 * recibo que carrega o hash, sabe-se de que mês é o `.REC`.
 *
 * É melhor que qualquer palpite pela data de transmissão: entrega atrasada, ou
 * retificação meses depois, quebrariam a conta "mês seguinte".
 */
async function competenciaPeloHashDoSped(
  pastaEmpresa: string,
  hash: string,
): Promise<{ ano: number; mes: number } | null> {
  const recibos = path.join(pastaEmpresa, "RECIBOS");
  if (!existsSync(recibos)) return null;

  let anos: string[];
  try {
    anos = await readdir(recibos);
  } catch {
    return null;
  }

  const { PDFParse } = await import("pdf-parse");
  for (const ano of anos) {
    const dir = path.join(recibos, ano);
    let nomes: string[];
    try {
      nomes = await readdir(dir);
    } catch {
      continue;
    }
    for (const nome of nomes) {
      // O nome é padronizado pelo próprio robô ("SPED FISCAL 09.2025.pdf"), e é
      // dele que sai a competência — o PDF só confirma que é este recibo.
      const comp = /\b(0[1-9]|1[0-2])\.(20\d{2})\b/.exec(nome);
      if (!comp) continue;
      try {
        const { text } = await new PDFParse({
          data: await readFile(path.join(dir, nome)),
        }).getText();
        if (text.replace(/\s+/g, "").toUpperCase().includes(hash)) {
          return { ano: Number(comp[2]), mes: Number(comp[1]) };
        }
      } catch {
        continue;
      }
    }
  }
  return null;
}

/** Pasta onde ficam as anotações do que precisa de olho humano. */
const PASTA_OBSERVACAO = "OBSERVAÇÃO";
const ARQUIVO_OBSERVACAO = "_A CONFERIR.md";

/**
 * Primeiro nome livre a partir do desejado: `GPS 03.2019 -2.pdf`, `-3`, ...
 *
 * Existe para nunca sobrescrever e nunca descartar: dois documentos diferentes
 * da mesma competência ficam os dois, lado a lado, na mesma pasta.
 */
function nomeLivre(caminho: string): string {
  const dir = path.dirname(caminho);
  const ext = path.extname(caminho);
  const base = path.basename(caminho, ext);
  for (let i = 2; i < 100; i++) {
    const tentativa = path.join(dir, `${base} -${i}${ext}`);
    if (!existsSync(tentativa)) return tentativa;
  }
  return path.join(dir, `${base} -${Date.now()}${ext}`);
}

/**
 * Escreve na pasta OBSERVAÇÃO da empresa o que precisa ser analisado.
 *
 * Decisão do Higor em 02/09/2026: em vez de o robô engolir a dúvida (ou de ela
 * morrer num relatório de execução que ninguém reabre), ela fica escrita na
 * pasta do cliente, ao lado dos documentos — onde quem vai conferir já está.
 */
async function anotarObservacao(params: {
  pastaEmpresa: string;
  texto: string;
  simular: boolean;
}): Promise<void> {
  if (params.simular) return;
  const dir = path.join(params.pastaEmpresa, PASTA_OBSERVACAO);
  await mkdir(dir, { recursive: true });
  const arquivo = path.join(dir, ARQUIVO_OBSERVACAO);
  const hoje = new Date().toLocaleDateString("pt-BR");

  let conteudo = "";
  try {
    conteudo = await readFile(arquivo, "utf8");
  } catch {
    conteudo =
      "# A conferir\n\n" +
      "Anotado pelo organizador de documentos. Cada item é uma dúvida que o robô\n" +
      "não podia resolver sozinho sem arriscar perder informação.\n";
  }
  // Repetir a mesma anotação a cada passagem transformaria o arquivo em lixo.
  if (conteudo.includes(params.texto)) return;
  await writeFile(arquivo, `${conteudo}\n## ${hoje}\n\n${params.texto}\n`, "utf8");
}

/** O que a fase 1 apurou de cada arquivo, para a fase 2 decidir. */
interface Pendente {
  arquivo: string;
  hash: string;
  classificacao: Classificacao;
  /**
   * Cliente fixo do endereço de onde o arquivo veio.
   *
   * Vale só quando o documento não se identifica — pasta de cliente no servidor
   * é palpite de quem salvou, e documento que diz de quem é continua mandando.
   */
  clienteDaOrigem: string | null;
}

/**
 * Move para a quarentena o que não deu pra arquivar, agrupado por empresa.
 *
 * Só mexe em arquivo que está DENTRO da raiz da plataforma: documento que veio
 * do servidor do escritório fica onde está, sempre.
 *
 * O nome original é preservado — na quarentena o que importa é reconhecer o
 * arquivo, não padronizar. Colisão de nome ganha sufixo em vez de sobrescrever.
 */
async function mandarPraQuarentena(params: {
  arquivo: string;
  raiz: string;
  empresa: string | null;
  simular: boolean;
  /** Por que parou — vira a anotação na pasta OBSERVAÇÃO da empresa. */
  motivo?: string;
}): Promise<string | null> {
  const { arquivo, raiz, empresa, simular, motivo } = params;
  if (!dentroDaRaiz(arquivo, raiz)) return null;

  // NÃO MEXE em arquivo que já está na pasta da empresa dele.
  //
  // A quarentena existe para o que está solto ou perdido — não para punir o
  // documento que o robô não soube ler. Quando o `.rec` entrou na varredura, 28
  // arquivos que estavam quietos na pasta do cliente foram arrancados de lá e
  // empilhados na quarentena, que tinha acabado de ser zerada. Movê-los não
  // acrescentou nada: só tirou o documento de onde o contador já o encontrava.
  const jaNaPastaDaEmpresa = pastaAncestralComCnpj(arquivo, raiz);
  const naQuarentena = path
    .relative(raiz, arquivo)
    .split(path.sep)
    .includes(PASTA_QUARENTENA);

  // Quando dá pra saber de quem é, a pendência é anotada NA PASTA DA EMPRESA.
  // A quarentena é do robô; a pasta do cliente é de quem confere — e é lá que a
  // pessoa está quando percebe que falta alguma coisa.
  if (jaNaPastaDaEmpresa && !naQuarentena) {
    if (motivo) {
      await anotarObservacao({
        pastaEmpresa: jaNaPastaDaEmpresa,
        texto:
          `**${path.basename(arquivo)}** não foi organizado: ${motivo}.\n\n` +
          `   - continua onde estava: \`${path.relative(jaNaPastaDaEmpresa, arquivo)}\`\n` +
          `   - **o que fazer:** renomear com a competência (ex.: \`03.2025\`) e rodar o ` +
          `organizador de novo, ou dizer o que é o documento.`,
        simular,
      });
    }
    return arquivo; // fica onde está
  }

  if (motivo && empresa) {
    const cnpjDaEmpresa = /_(\d{14})$/.exec(nomeSeguroDePasta(empresa))?.[1];
    const pastaEmpresa = cnpjDaEmpresa ? pastaExistenteDoCnpj(raiz, cnpjDaEmpresa) : null;
    if (pastaEmpresa) {
      await anotarObservacao({
        pastaEmpresa,
        texto:
          `**${path.basename(arquivo)}** ficou em quarentena: ${motivo}.\n\n` +
          `   - está em: \`_QUARENTENA\\${nomeSeguroDePasta(empresa)}\\\`\n` +
          `   - **o que fazer:** renomear com a competência (ex.: \`03.2025\`) e rodar o ` +
          `organizador de novo, ou dizer o que é o documento.`,
        simular,
      });
    }
  }

  const grupo = empresa ? nomeSeguroDePasta(empresa) : SEM_IDENTIFICACAO;
  const pasta = path.join(raiz, PASTA_QUARENTENA, grupo);
  let destino = path.join(pasta, path.basename(arquivo));

  if (path.resolve(destino) === path.resolve(arquivo)) return destino;

  if (existsSync(destino)) {
    const ext = path.extname(destino);
    const base = path.basename(destino, ext);
    let n = 2;
    while (existsSync(path.join(pasta, `${base} (${n})${ext}`)) && n < 100) n++;
    destino = path.join(pasta, `${base} (${n})${ext}`);
  }

  if (!simular) {
    await mkdir(pasta, { recursive: true });
    await rename(arquivo, destino);
  }
  return destino;
}

/**
 * Grupo da quarentena quando não se sabe a empresa: a pasta de onde o arquivo
 * veio. Preserva o contexto — "estava na pasta da LUPO" já é meia resposta pra
 * quem vai analisar.
 */
function grupoDaOrigem(arquivo: string, raiz: string): string | null {
  const rel = path.relative(raiz, arquivo);
  if (rel.startsWith("..") || path.isAbsolute(rel)) return null;
  // Arquivo que JÁ está na quarentena mantém o grupo que recebeu — sem isto,
  // cada passagem do robô o enfiaria um nível mais fundo:
  // `_QUARENTENA\_QUARENTENA\_QUARENTENA\...`
  const partes = rel.split(path.sep).filter((p) => p !== PASTA_QUARENTENA);
  const primeiro = partes[0];
  return primeiro && primeiro !== path.basename(arquivo) ? primeiro : null;
}

/** Nome de pasta legível e seguro no Windows. */
function nomeSeguroDePasta(nome: string): string {
  return nome
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[<>:"/\\|?*]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 70);
}

export async function organizarDocumentos(params: {
  escritorioId: string;
  /** Sem escrever nada — só diz o que faria. Padrão: true. */
  simular?: boolean;
  /** Limita a execução a um endereço cadastrado. */
  origemId?: string;
}): Promise<RelatorioOrganizacao> {
  const simular = params.simular ?? true;
  const raiz = pastaRaiz();

  const origens = await prisma.origemArquivo.findMany({
    where: {
      escritorioId: params.escritorioId,
      ativo: true,
      ...(params.origemId ? { id: params.origemId } : {}),
    },
  });

  const relatorio: RelatorioOrganizacao = {
    simulado: simular,
    origens: origens.map((o) => o.caminho),
    arquivosVistos: 0,
    arquivados: 0,
    jaNoLugar: 0,
    jaExistia: 0,
    conflitos: 0,
    quarentena: 0,
    erros: 0,
    itens: [],
  };

  if (origens.length === 0) return relatorio;

  const clientes = await prisma.cliente.findMany({
    where: { escritorioId: params.escritorioId },
    select: { id: true, razaoSocial: true, cnpj: true, inscricaoEstadual: true, pastaLocal: true },
  });
  const porCnpj = new Map(clientes.map((c) => [c.cnpj.replace(/\D/g, ""), c]));
  const porId = new Map(clientes.map((c) => [c.id, c]));
  const porIe = new Map(
    clientes
      .filter((c) => c.inscricaoEstadual)
      .map((c) => [c.inscricaoEstadual!.replace(/\D/g, ""), c]),
  );

  // O escritório também tem escrituração própria, e ele nunca é cliente de si
  // mesmo: sem isso, os SPED da March ficavam em quarentena por "sem razão
  // social", sendo que o nome dela está no cadastro desde sempre.
  const escritorio = await prisma.escritorio.findUnique({
    where: { id: params.escritorioId },
    select: { razaoSocial: true, cnpj: true },
  });
  const cnpjDoEscritorio = escritorio?.cnpj?.replace(/\D/g, "") ?? null;

  // Hashes já arquivados — não se arquiva o mesmo conteúdo duas vezes.
  const jaArquivados = new Set(
    (
      await prisma.arquivoOrganizado.findMany({
        where: { escritorioId: params.escritorioId, status: { in: ["ARQUIVADO", "JA_NO_LUGAR"] } },
        select: { hash: true },
      })
    ).map((a) => a.hash),
  );

  const registrar = async (
    item: ItemOrganizado,
    dados: {
      hash: string;
      tipo: string;
      clienteId: string | null;
      ano: number | null;
      mes: number | null;
    },
  ) => {
    relatorio.itens.push(item);
    if (simular) return;
    await prisma.arquivoOrganizado.upsert({
      where: { escritorioId_hash: { escritorioId: params.escritorioId, hash: dados.hash } },
      create: {
        escritorioId: params.escritorioId,
        hash: dados.hash,
        origemCaminho: item.origem,
        destinoCaminho: item.destino,
        tipoDocumento: dados.tipo,
        clienteId: dados.clienteId,
        ano: dados.ano,
        mes: dados.mes,
        status: item.status,
        motivo: item.detalhe,
      },
      update: { destinoCaminho: item.destino, status: item.status, motivo: item.detalhe },
    });
  };

  const itemBase = (arquivo: string): ItemOrganizado => ({
    origem: arquivo,
    nomeArquivo: path.basename(arquivo),
    status: "ERRO",
    tipo: null,
    cliente: null,
    destino: null,
    acao: null,
    detalhe: "",
  });

  // =========================================================================
  // FASE 1 — identificar, sem decidir nada
  // =========================================================================
  const pendentes: Pendente[] = [];
  const vistosNestaExecucao = new Set<string>();

  for (const origem of origens) {
    let arquivos: string[];
    try {
      const st = await stat(origem.caminho);
      if (!st.isDirectory()) {
        relatorio.erros++;
        relatorio.itens.push({
          ...itemBase(origem.caminho),
          nomeArquivo: origem.nome,
          detalhe: "o caminho cadastrado não é uma pasta",
        });
        continue;
      }
      arquivos = await listarArquivos(origem.caminho, origem.recursivo);
    } catch (e) {
      relatorio.erros++;
      relatorio.itens.push({
        ...itemBase(origem.caminho),
        nomeArquivo: origem.nome,
        detalhe: `não consegui ler a pasta: ${e instanceof Error ? e.message : String(e)}`,
      });
      continue;
    }

    for (const arquivo of arquivos) {
      relatorio.arquivosVistos++;
      const base = itemBase(arquivo);
      try {
        const hash = await hashDoArquivo(arquivo);
        if (jaArquivados.has(hash) || vistosNestaExecucao.has(hash)) {
          relatorio.jaExistia++;
          relatorio.itens.push({
            ...base,
            status: "JA_EXISTIA",
            detalhe: "conteúdo já arquivado antes",
          });
          continue;
        }
        vistosNestaExecucao.add(hash);

        const cls = await classificarArquivo(arquivo);
        if (!cls.ok) {
          relatorio.quarentena++;
          const destino = await mandarPraQuarentena({
            arquivo,
            raiz,
            empresa: grupoDaOrigem(arquivo, raiz),
            simular,
            motivo: cls.motivo,
          });
          await registrar(
            { ...base, status: "QUARENTENA", destino, detalhe: cls.motivo },
            { hash, tipo: "DESCONHECIDO", clienteId: null, ano: null, mes: null },
          );
          continue;
        }
        pendentes.push({
          arquivo,
          hash,
          classificacao: cls.classificacao,
          clienteDaOrigem: origem.clienteId,
        });
      } catch (e) {
        relatorio.erros++;
        relatorio.itens.push({
          ...base,
          detalhe: e instanceof Error ? e.message : String(e),
        });
      }
    }

    if (!simular) {
      await prisma.origemArquivo.update({
        where: { id: origem.id },
        data: { ultimaVarreduraEm: new Date() },
      });
    }
  }

  // -------------------------------------------------------------------------
  // Um CNPJ, um nome: o mais recente que apareceu nos documentos.
  // -------------------------------------------------------------------------
  // "Mais recente" tem que ser por COMPETÊNCIA, não por ano: a CRS Atacadista
  // passou a assinar no meio de 2023, e no mesmo ano existem documentos com os
  // dois nomes. Comparando só o ano, dava empate e vencia o antigo.
  const nomePorCnpj = new Map<string, { nome: string; competencia: number }>();
  for (const { classificacao: c } of pendentes) {
    if (!c.cnpj || !pareceRazaoSocial(c.nomeEmpresa)) continue;
    const competencia = (c.ano ?? 0) * 12 + (c.mes ?? 0);
    const atual = nomePorCnpj.get(c.cnpj);
    if (!atual || competencia > atual.competencia) {
      nomePorCnpj.set(c.cnpj, { nome: c.nomeEmpresa!, competencia });
    }
  }

  // =========================================================================
  // FASE 2 — decidir e agir
  // =========================================================================
  for (const { arquivo, hash, classificacao: c, clienteDaOrigem } of pendentes) {
    const base = itemBase(arquivo);
    base.tipo = c.tipo;

    try {
      // --- De quem é? ---
      //
      // Cliente cadastrado é o caso feliz. Mas o documento diz de quem ele é
      // (CNPJ e razão social estão dentro dele), e o Higor decidiu em
      // 31/08/2026: se dá pra saber, arquiva na empresa certa mesmo sem
      // cadastro. Foi o caso dos SPED da CRS/Ponto Forte que uma cópia em lote
      // largou dentro da pasta da Construtora Rodrigues Almeida.
      const cliente =
        (c.cnpj ? porCnpj.get(c.cnpj) : undefined) ??
        (c.inscricaoEstadual ? porIe.get(c.inscricaoEstadual) : undefined);

      let pastaDaEmpresa: string | null = null;
      if (cliente) {
        pastaDaEmpresa = pastaCliente(cliente);
      } else if (c.cnpj) {
        const escolhido =
          nomePorCnpj.get(c.cnpj)?.nome ??
          (c.cnpj === cnpjDoEscritorio ? (escritorio?.razaoSocial ?? null) : null);
        pastaDaEmpresa =
          pastaExistenteDoCnpj(raiz, c.cnpj) ??
          (escolhido ? path.join(raiz, nomearPasta(escolhido, c.cnpj)) : null);
      }

      // Quando o CONTEÚDO é mudo sobre o dono, a pasta onde o arquivo está é a
      // única prova que existe. Isto NÃO afrouxa a regra de content-over-path:
      // documento que diz de quem é continua mandando na localização (foi assim
      // que os SPED da CRS saíram da pasta da Construtora). Aqui é o inverso —
      // o resumo por CFOP não imprime CNPJ nenhum, e sem isso ele ficaria em
      // quarentena para sempre. Fica registrado que a origem foi o caminho.
      let donoPelaPasta = false;
      if (!pastaDaEmpresa && !c.cnpj && !c.inscricaoEstadual) {
        // Primeiro o cliente fixo do endereço: quem cadastrou a pasta afirmou
        // de quem ela é, e essa afirmação vale mais que o palpite do caminho.
        const fixo = clienteDaOrigem ? porId.get(clienteDaOrigem) : undefined;
        const herdada = fixo ? pastaCliente(fixo) : pastaAncestralComCnpj(arquivo, raiz);
        if (herdada) {
          pastaDaEmpresa = herdada;
          donoPelaPasta = true;
        }
      }

      if (!pastaDaEmpresa) {
        relatorio.quarentena++;
        const quem = c.cnpj
          ? `CNPJ ${c.cnpj}, sem razão social confiável no arquivo`
          : c.inscricaoEstadual
            ? `IE ${c.inscricaoEstadual}`
            : "sem CNPJ válido no arquivo";
        const destino = await mandarPraQuarentena({
          arquivo,
          raiz,
          empresa: c.cnpj ? `CNPJ ${c.cnpj}` : grupoDaOrigem(arquivo, raiz),
          simular,
        });
        await registrar(
          {
            ...base,
            status: "QUARENTENA",
            destino,
            detalhe: `não deu pra saber de quem é (${quem})`,
          },
          { hash, tipo: c.tipo, clienteId: null, ano: c.ano, mes: c.mes },
        );
        continue;
      }
      base.cliente = cliente
        ? cliente.razaoSocial
        : `${nomePorCnpj.get(c.cnpj!)?.nome ?? c.cnpj} (sem cadastro)`;

      // O `.REC` sem competência no nome só descobre de que mês é agora, que a
      // pasta da empresa é conhecida: o recibo em PDF dela carrega o mesmo hash.
      if (c.tipo === "RECIBO_REC" && !c.mes && c.contaCodigo) {
        const achada = await competenciaPeloHashDoSped(pastaDaEmpresa, c.contaCodigo);
        if (achada) {
          c.ano = achada.ano;
          c.mes = achada.mes;
          c.evidencia = `registro RC01; competência pelo recibo com o hash ${c.contaCodigo.slice(0, 8)}…`;
        }
      }

      // --- Para onde vai? ---
      const dest = destinoDoDocumento(c, path.extname(arquivo));
      if (!dest.ok) {
        relatorio.quarentena++;
        // Aqui a empresa é conhecida — o que falta é a competência. Vai pra
        // quarentena DELA, não pro monte dos sem identificação.
        const destino = await mandarPraQuarentena({
          arquivo,
          raiz,
          empresa: path.basename(pastaDaEmpresa),
          simular,
        });
        await registrar(
          { ...base, status: "QUARENTENA", destino, detalhe: dest.motivo },
          { hash, tipo: c.tipo, clienteId: cliente?.id ?? null, ano: c.ano, mes: c.mes },
        );
        continue;
      }

      const destinoOriginal = path.join(pastaDaEmpresa, dest.destino.relativo);
      let destinoAbs = destinoOriginal;
      base.destino = destinoAbs;

      if (path.resolve(destinoAbs) === path.resolve(arquivo)) {
        relatorio.jaNoLugar++;
        await registrar(
          { ...base, status: "JA_NO_LUGAR", detalhe: "já está no lugar certo, com o nome certo" },
          { hash, tipo: c.tipo, clienteId: cliente?.id ?? null, ano: c.ano, mes: c.mes },
        );
        continue;
      }

      // Destino ocupado: só é conflito se o conteúdo for diferente.
      if (existsSync(destinoAbs)) {
        const hashDestino = await hashDoArquivo(destinoAbs);
        if (hashDestino === hash) {
          relatorio.jaExistia++;
          await registrar(
            { ...base, status: "JA_EXISTIA", detalhe: "o destino já tem este mesmo conteúdo" },
            { hash, tipo: c.tipo, clienteId: cliente?.id ?? null, ano: c.ano, mes: c.mes },
          );
          continue;
        }
        // Decisão do Higor em 02/09/2026: sabendo o que o arquivo é, GUARDA OS
        // DOIS. Duas GPS de 03/2019 com valores diferentes (R$ 910,53 e
        // R$ 899,84) não são cópia — é guia recalculada, e sumir com uma
        // esconde justamente o que o contador precisa ver. O segundo ganha
        // sufixo, e a divergência é escrita na pasta OBSERVAÇÃO da empresa.
        const alternativo = nomeLivre(destinoAbs);
        destinoAbs = alternativo;
        base.destino = alternativo;
        await anotarObservacao({
          pastaEmpresa: pastaDaEmpresa,
          texto:
            `**${path.basename(destinoOriginal)}** — chegou um segundo documento para a mesma ` +
            `competência, com conteúdo diferente. Nenhum foi descartado: o novo está como ` +
            `\`${path.basename(alternativo)}\`.\n\n` +
            `   - origem: \`${arquivo}\`\n` +
            `   - tipo: ${c.tipo}${c.mes ? ` — competência ${c.mes}/${c.ano}` : ""}\n` +
            `   - **o que conferir:** qual dos dois vale. Costuma ser retificação ou ` +
            `recálculo; se os valores forem iguais, é reimpressão e um pode sair.`,
          simular,
        });
        relatorio.conflitos++;
      }

      const acao: "mover" | "copiar" = dentroDaRaiz(arquivo, raiz) ? "mover" : "copiar";
      base.acao = acao;
      const detalhe =
        `${acao === "mover" ? "movido" : "copiado"} — ${dest.destino.explicacao}` +
        (donoPelaPasta
          ? clienteDaOrigem
            ? " (dono veio do cliente fixo do endereço: o arquivo não se identifica)"
            : " (dono deduzido da pasta: o arquivo não se identifica)"
          : "");

      if (!simular) {
        await mkdir(path.dirname(destinoAbs), { recursive: true });
        if (acao === "mover") await rename(arquivo, destinoAbs);
        else await copyFile(arquivo, destinoAbs);
      }

      relatorio.arquivados++;
      await registrar(
        { ...base, status: "ARQUIVADO", detalhe: simular ? `seria ${detalhe}` : detalhe },
        { hash, tipo: c.tipo, clienteId: cliente?.id ?? null, ano: c.ano, mes: c.mes },
      );
    } catch (e) {
      relatorio.erros++;
      relatorio.itens.push({
        ...base,
        status: "ERRO",
        detalhe: e instanceof Error ? e.message : String(e),
      });
    }
  }

  if (!simular) await escreverResumoQuarentena(raiz, relatorio);

  return relatorio;
}

/**
 * Escreve `_QUARENTENA\_LEIA-ME.md` com o motivo de cada arquivo parado.
 *
 * Sem isso a quarentena é um monte de PDF sem explicação: quem for analisar
 * teria que abrir um por um pra descobrir por que o robô não soube arquivar.
 */
async function escreverResumoQuarentena(
  raiz: string,
  relatorio: RelatorioOrganizacao,
): Promise<void> {
  const emQuarentena = relatorio.itens.filter((i) => i.status === "QUARENTENA" && i.destino);
  if (emQuarentena.length === 0) return;

  const porGrupo = new Map<string, ItemOrganizado[]>();
  for (const i of emQuarentena) {
    const rel = path.relative(path.join(raiz, PASTA_QUARENTENA), i.destino!);
    const grupo = rel.split(path.sep)[0] ?? SEM_IDENTIFICACAO;
    if (!porGrupo.has(grupo)) porGrupo.set(grupo, []);
    porGrupo.get(grupo)!.push(i);
  }

  const linhas: string[] = [
    "# Quarentena do organizador",
    "",
    `Gerado em ${new Date().toLocaleString("pt-BR")} · ${emQuarentena.length} arquivo(s)`,
    "",
    "Documentos que o robô **não soube arquivar**, agrupados por empresa (ou pela",
    "pasta de onde vieram, quando não deu pra identificar). Cada um traz o motivo.",
    "",
    "Arquivo daqui não foi apagado nem alterado — só movido para cá. Resolvido o",
    "motivo, ele volta a ser arquivado na próxima passagem do robô.",
    "",
  ];

  for (const [grupo, itens] of [...porGrupo.entries()].sort((a, b) => b[1].length - a[1].length)) {
    linhas.push(`## ${grupo} — ${itens.length} arquivo(s)`);
    linhas.push("");
    linhas.push("| Arquivo | Tipo | Motivo |");
    linhas.push("|---|---|---|");
    for (const i of itens.slice(0, 200)) {
      const nome = path.basename(i.destino!);
      linhas.push(`| ${nome} | ${i.tipo ?? "não identificado"} | ${i.detalhe} |`);
    }
    if (itens.length > 200) linhas.push(`| … | | mais ${itens.length - 200} arquivo(s) |`);
    linhas.push("");
  }

  const destino = path.join(raiz, PASTA_QUARENTENA, "_LEIA-ME.md");
  await mkdir(path.dirname(destino), { recursive: true });
  const { writeFile } = await import("node:fs/promises");
  await writeFile(destino, linhas.join("\n"), "utf8");
}
