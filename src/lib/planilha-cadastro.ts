import ExcelJS from "exceljs";
import { prisma } from "@/lib/db";
import { cifrar } from "@/lib/crypto";
import { listarEstabelecimentos } from "@/lib/estabelecimento";

/**
 * Planilha de cadastro das empresas mantida pelo escritório (uma aba, uma
 * linha por estabelecimento — matriz e cada filial com o seu CNPJ).
 *
 * Pedido do Higor (27/09/2026): no cadastro da empresa, um botão busca a linha
 * pelo CNPJ e preenche o que estiver VAZIO — só quando ele manda, nunca
 * automático, e nunca sobrescreve o que já está no cadastro. Divergência
 * (IE diferente, por exemplo) é apontada, não corrigida.
 *
 * A planilha tem senhas. Quem lê é a aplicação: a senha vai direto para
 * `cifrar` e nunca é devolvida, logada nem mostrada. O caminho vem da
 * configuração (`PLANILHA_CADASTRO` no .env) — documento fora, dado dentro.
 *
 * Colunas localizadas pelo TÍTULO (não pela letra). "Usuario e Senha
 * prefeitura" fica de fora: usuário e senha na mesma célula, sem formato
 * definido para separar.
 */

const norm = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();

const soDigitos = (s: string | null | undefined) => (s ?? "").replace(/\D/g, "");

const COLUNAS = {
  apelido: "APELIDO NO SISTEMA",
  cnpj: "CNPJ",
  codigoDominio: "COD DOMINIO",
  uf: "UF",
  cidade: "CIDADE",
  enquadramento: "ENQUADRAMENTO",
  ie: "INSCRICAO ESTADUAL",
  senhaGiam: "SENHA GIAM",
  im: "INSCRICAO MUNICIPAL",
  ccp: "CCP",
  email: "E-MAIL",
} as const;
type Coluna = keyof typeof COLUNAS;
type LinhaPlanilha = Partial<Record<Coluna, string>>;

function textoCelula(v: ExcelJS.CellValue): string {
  if (v == null) return "";
  if (typeof v === "object") {
    if ("richText" in v) return v.richText.map((t) => t.text).join("").trim();
    if ("text" in v) return String(v.text).trim(); // hyperlink (e-mail)
    if ("result" in v) return String(v.result ?? "").trim(); // fórmula
    if (v instanceof Date) return v.toISOString();
  }
  return String(v).trim();
}

/** Lê a planilha e devolve as linhas indexadas pelo CNPJ (só dígitos). */
async function lerPlanilha(caminho: string): Promise<Map<string, LinhaPlanilha>> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(caminho);
  const ws = wb.worksheets[0];
  if (!ws) throw new Error("A planilha não tem aba.");

  // Linha de títulos: a primeira (até a 10ª) que tem a coluna CNPJ.
  let linhaTitulo = 0;
  const posicao: Partial<Record<Coluna, number>> = {};
  for (let r = 1; r <= Math.min(10, ws.rowCount) && !linhaTitulo; r++) {
    const row = ws.getRow(r);
    const titulos = new Map<string, number>();
    row.eachCell((cell, col) => titulos.set(norm(textoCelula(cell.value)), col));
    if (titulos.has(COLUNAS.cnpj)) {
      linhaTitulo = r;
      for (const [k, titulo] of Object.entries(COLUNAS) as [Coluna, string][]) {
        const c = titulos.get(titulo);
        if (c) posicao[k] = c;
      }
    }
  }
  if (!linhaTitulo) throw new Error("Não achei a linha de títulos (coluna CNPJ) nas 10 primeiras linhas.");

  const porCnpj = new Map<string, LinhaPlanilha>();
  for (let r = linhaTitulo + 1; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    const linha: LinhaPlanilha = {};
    for (const [k, c] of Object.entries(posicao) as [Coluna, number][]) {
      const t = textoCelula(row.getCell(c).value);
      if (t) linha[k] = t;
    }
    const cnpj = soDigitos(linha.cnpj);
    if (cnpj.length === 14) porCnpj.set(cnpj, linha);
  }
  return porCnpj;
}

/** "Enquadramento" da planilha → valores do cadastro. Desconhecido = não preenche. */
function regimeDoEnquadramento(e: string): string | null {
  const n = norm(e);
  if (n.includes("MEI")) return "MEI";
  if (n.includes("SIMPLES")) return "Simples Nacional";
  if (n.includes("PRESUMIDO")) return "Lucro Presumido";
  if (n.includes("REAL")) return "Lucro Real";
  return null;
}

export interface ResultadoEstabelecimento {
  rotulo: string;
  cnpj: string;
  encontrado: boolean;
  preenchidos: string[]; // nomes dos campos (nunca valores de senha)
  avisos: string[];
}

export interface ResultadoPlanilha {
  ok: boolean;
  mensagem: string;
  estabelecimentos: ResultadoEstabelecimento[];
}

/**
 * Preenche o cadastro do cliente (matriz) e das filiais com o que a planilha
 * tem para cada CNPJ — só campos vazios.
 */
export async function preencherDaPlanilha(clienteId: string): Promise<ResultadoPlanilha> {
  const caminho = process.env.PLANILHA_CADASTRO;
  if (!caminho) {
    return { ok: false, mensagem: "PLANILHA_CADASTRO não está configurada no .env.", estabelecimentos: [] };
  }

  let planilha: Map<string, LinhaPlanilha>;
  try {
    planilha = await lerPlanilha(caminho);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, mensagem: `Não consegui ler a planilha: ${msg}`, estabelecimentos: [] };
  }

  const cliente = await prisma.cliente.findUniqueOrThrow({
    where: { id: clienteId },
    select: {
      apelidoSistema: true,
      codigoDominio: true,
      uf: true,
      municipio: true,
      regimeTributario: true,
      inscricaoEstadual: true,
      senhaSefaz: true,
      inscricaoMunicipal: true,
      ccpMunicipal: true,
      email: true,
    },
  });

  const resultados: ResultadoEstabelecimento[] = [];
  for (const e of await listarEstabelecimentos(clienteId)) {
    const linha = planilha.get(e.cnpj);
    const r: ResultadoEstabelecimento = {
      rotulo: e.rotulo,
      cnpj: e.cnpj,
      encontrado: Boolean(linha),
      preenchidos: [],
      avisos: [],
    };
    resultados.push(r);
    if (!linha) continue;

    // IE: preenche se vazia; se já existe e difere, só aponta.
    if (linha.ie && e.inscricaoEstadual && soDigitos(linha.ie) !== soDigitos(e.inscricaoEstadual)) {
      r.avisos.push(`IE da planilha (${linha.ie}) diferente da cadastrada (${e.inscricaoEstadual}) — mantida a cadastrada`);
    }
    if (linha.uf && e.uf && norm(linha.uf) !== norm(e.uf)) {
      r.avisos.push(`UF da planilha (${linha.uf}) diferente da cadastrada (${e.uf}) — mantida a cadastrada`);
    }

    if (e.tipo === "MATRIZ") {
      const data: Record<string, string> = {};
      const setSeVazio = (campo: keyof typeof cliente, rotulo: string, valor: string | null | undefined) => {
        if (valor && !cliente[campo]) {
          data[campo] = valor;
          r.preenchidos.push(rotulo);
        }
      };
      setSeVazio("apelidoSistema", "Apelido", linha.apelido);
      setSeVazio("codigoDominio", "Código Domínio", linha.codigoDominio);
      setSeVazio("uf", "UF", linha.uf?.toUpperCase());
      setSeVazio("municipio", "Município", linha.cidade);
      if (linha.enquadramento) {
        const regime = regimeDoEnquadramento(linha.enquadramento);
        if (!regime) r.avisos.push(`Enquadramento "${linha.enquadramento}" não reconhecido — regime não preenchido`);
        else setSeVazio("regimeTributario", "Regime", regime);
      }
      setSeVazio("inscricaoEstadual", "IE", linha.ie);
      setSeVazio("inscricaoMunicipal", "Inscrição Municipal", linha.im);
      setSeVazio("ccpMunicipal", "CCP", linha.ccp);
      setSeVazio("email", "E-mail", linha.email);
      if (linha.senhaGiam && !cliente.senhaSefaz) {
        data.senhaSefaz = cifrar(linha.senhaGiam);
        r.preenchidos.push("Senha SEFAZ");
      }
      if (Object.keys(data).length > 0) {
        await prisma.cliente.update({ where: { id: clienteId }, data });
      }
    } else {
      const atual = await prisma.estabelecimento.findUniqueOrThrow({
        where: { id: e.id },
        select: { apelido: true, uf: true, municipio: true, inscricaoEstadual: true, senhaSefaz: true },
      });
      const data: Record<string, string> = {};
      const setSeVazio = (campo: keyof typeof atual, rotulo: string, valor: string | null | undefined) => {
        if (valor && !atual[campo]) {
          data[campo] = valor;
          r.preenchidos.push(rotulo);
        }
      };
      setSeVazio("apelido", "Apelido", linha.apelido);
      setSeVazio("uf", "UF", linha.uf?.toUpperCase());
      setSeVazio("municipio", "Município", linha.cidade);
      setSeVazio("inscricaoEstadual", "IE", linha.ie);
      if (linha.senhaGiam && !atual.senhaSefaz) {
        data.senhaSefaz = cifrar(linha.senhaGiam);
        r.preenchidos.push("Senha SEFAZ");
      }
      if (Object.keys(data).length > 0) {
        await prisma.estabelecimento.update({ where: { id: e.id }, data });
      }
    }
  }

  const achados = resultados.filter((x) => x.encontrado).length;
  return {
    ok: true,
    mensagem: `${achados} de ${resultados.length} estabelecimento(s) encontrados na planilha.`,
    estabelecimentos: resultados,
  };
}
