/**
 * Varre uma pasta procurando arquivos SPED-ECF e importa cada um.
 * Aceita .txt/.ecf/.sped e valida por CNPJ + presença do 0000 LECF.
 *
 * Um ano, um arquivo: se a pasta tem mais de um arquivo DIFERENTE do mesmo ano
 * (ex.: a transmitida junto com versões geradas no Domínio), nenhum deles é
 * importado — escolher um seria adivinhar. A falha diz quais arquivos disputam
 * o ano, pro contador deixar na pasta só o que vale. Cópia idêntica é ignorada.
 */
import { createHash } from "node:crypto";
import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { prisma } from "@/lib/db";
import { importarSpedEcf, type FonteEcf } from "./importar";
import { escolherEcfVigente } from "./vigente";

export interface ResultadoVarreduraEcf {
  arquivosVistos: number;
  ignoradosNaoEcf: number;
  ignoradosCnpjDiferente: number;
  ignoradosJaImportados: number;
  importadosNovos: number;
  substituidos: number;
  falhas: Array<{ arquivo: string; motivo: string }>;
  detalhes: Array<{ arquivo: string; ano?: number; acao: string }>;
}

function soDigitos(s: string | null | undefined): string {
  return (s ?? "").replace(/\D/g, "");
}

function decodificarLatin1(bytes: Buffer): string {
  // SPED brasileiro é latin1/CP1252
  return bytes.toString("latin1");
}

// Detecta pelo início do arquivo — evita ler MB de dados de um SPED que não é ECF
function pareceSpedEcf(conteudo: string): boolean {
  const primeirasLinhas = conteudo.slice(0, 2000);
  return /^\|0000\|LECF\|/m.test(primeirasLinhas);
}

/** Ano do DT_INI no |0000|LECF|VER|CNPJ|NOME|x|x|x|x|DT_INI|. */
function anoDoZero(conteudo: string): number | null {
  const m = conteudo.slice(0, 2000).match(/^\|0000\|LECF\|[^|]*\|\d{14}\|[^|]*\|(?:[^|]*\|){4}(\d{8})\|/m);
  return m ? Number(m[1].slice(4, 8)) : null;
}

export async function varrerPastaEcf(params: {
  clienteId: string;
  pasta: string;
  usuarioId?: string;
  fonte?: FonteEcf;
}): Promise<ResultadoVarreduraEcf> {
  const { clienteId, pasta } = params;
  const fonte: FonteEcf = params.fonte ?? "TRANSMITIDO";

  const cliente = await prisma.cliente.findUnique({
    where: { id: clienteId },
    select: { cnpj: true },
  });
  if (!cliente) throw new Error("Cliente não encontrado.");
  const cnpjCliente = soDigitos(cliente.cnpj);

  const st = await stat(pasta).catch(() => null);
  if (!st || !st.isDirectory()) throw new Error(`Pasta inválida: ${pasta}`);

  const res: ResultadoVarreduraEcf = {
    arquivosVistos: 0,
    ignoradosNaoEcf: 0,
    ignoradosCnpjDiferente: 0,
    ignoradosJaImportados: 0,
    importadosNovos: 0,
    substituidos: 0,
    falhas: [],
    detalhes: [],
  };
  const falhar = (arquivo: string, motivo: string, ano?: number) => {
    res.falhas.push({ arquivo, motivo });
    res.detalhes.push({ arquivo, ano, acao: `FALHA: ${motivo}` });
  };

  async function coletar(dir: string, prof = 0): Promise<string[]> {
    if (prof > 4) return [];
    const entradas = await readdir(dir, { withFileTypes: true }).catch(() => []);
    const arqs: string[] = [];
    for (const e of entradas) {
      const p = path.join(dir, e.name);
      if (e.isFile() && /\.(txt|ecf|sped)$/i.test(e.name)) arqs.push(p);
      else if (e.isDirectory()) arqs.push(...(await coletar(p, prof + 1)));
    }
    return arqs;
  }
  const arquivos = await coletar(pasta);

  // 1) Lê e filtra: só ECF do cliente entra na disputa por ano.
  type Candidato = { caminho: string; nomeArquivo: string; conteudo: string; ano: number | null; hash: string };
  const candidatos: Candidato[] = [];
  for (const caminho of arquivos) {
    const nomeArquivo = path.basename(caminho);
    res.arquivosVistos++;
    try {
      const conteudo = decodificarLatin1(await readFile(caminho));

      if (!pareceSpedEcf(conteudo)) {
        res.ignoradosNaoEcf++;
        res.detalhes.push({ arquivo: nomeArquivo, acao: "ignorado (não é SPED-ECF)" });
        continue;
      }

      // Confere CNPJ direto do 0000 sem parse completo pra performance
      const m0000 = conteudo.match(/^\|0000\|LECF\|[^|]*\|(\d{14})\|/m);
      if (!m0000 || m0000[1] !== cnpjCliente) {
        res.ignoradosCnpjDiferente++;
        res.detalhes.push({
          arquivo: nomeArquivo,
          acao: `ignorado (CNPJ ${m0000?.[1] ?? "??"} != cliente ${cnpjCliente})`,
        });
        continue;
      }

      candidatos.push({
        caminho,
        nomeArquivo,
        conteudo,
        ano: anoDoZero(conteudo),
        hash: createHash("sha256").update(conteudo).digest("hex"),
      });
    } catch (e) {
      falhar(nomeArquivo, (e as Error).message);
    }
  }

  // 2) Um arquivo por ano.
  const porAno = new Map<string, Candidato[]>();
  for (const c of candidatos) {
    const k = String(c.ano ?? "sem ano");
    porAno.set(k, [...(porAno.get(k) ?? []), c]);
  }

  for (const [chave, grupo] of porAno) {
    const ano = grupo[0].ano ?? undefined;
    const distintos = [...new Map(grupo.map((c) => [c.hash, c])).values()];
    let c = distintos[0];
    if (distintos.length > 1) {
      // Antes de recusar: retificadora? A última entrega aceita é a que vale.
      const escolha = escolherEcfVigente(distintos);
      if (!escolha.ok) {
        for (const d of distintos) falhar(d.nomeArquivo, `${chave}: ${escolha.motivo}`, ano);
        continue;
      }
      c = escolha.vigente;
      // Inclui as cópias idênticas dos substituídos (ex.: 2021.txt = original de 30/08/2022).
      const hashesSubstituidos = new Set(escolha.substituidos.map((s) => s.hash));
      for (const s of grupo.filter((g) => hashesSubstituidos.has(g.hash))) {
        res.detalhes.push({
          arquivo: s.nomeArquivo,
          ano,
          acao: `não importado — substituído pela ${escolha.motivo}`,
        });
      }
    }

    for (const copia of grupo.filter((g) => g !== c && g.hash === c.hash)) {
      res.detalhes.push({ arquivo: copia.nomeArquivo, ano, acao: `cópia idêntica de ${c.nomeArquivo} — ignorada` });
    }

    try {
      const r = await importarSpedEcf({
        clienteId,
        nomeArquivo: c.nomeArquivo,
        conteudo: c.conteudo,
        fonte,
        origem: "VARREDURA_PASTA",
        caminhoOrigem: c.caminho,
        importadoPor: params.usuarioId,
      });

      if (!r.ok) {
        falhar(c.nomeArquivo, r.mensagem, ano);
        continue;
      }

      if (r.mensagem.includes("já importado")) {
        res.ignoradosJaImportados++;
        res.detalhes.push({ arquivo: c.nomeArquivo, ano: r.ano, acao: "já importado (hash igual)" });
      } else if (r.substituiu) {
        res.substituidos++;
        res.detalhes.push({ arquivo: c.nomeArquivo, ano: r.ano, acao: "substituído" });
      } else {
        res.importadosNovos++;
        res.detalhes.push({ arquivo: c.nomeArquivo, ano: r.ano, acao: "importado" });
      }
    } catch (e) {
      falhar(c.nomeArquivo, (e as Error).message, ano);
    }
  }

  return res;
}
