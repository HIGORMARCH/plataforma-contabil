/**
 * Parser da planilha "RELAÇÃO DE PRODUTOS" que o Domínio exporta.
 *
 * A planilha tem:
 *  - Cabeçalhos repetidos a cada página (Empresa, CNPJ, "Página X/Y")
 *  - Muitas mesclas (colunas 1-4, 6-10, 12-15 são vazias, parte de células mescladas)
 *  - Colunas úteis (índice 0-based após mesclas): 0=Código, 5=Descrição, 11=NCM
 *
 * Retorna produtos únicos + NCMs únicos.
 */
import * as XLSX from "xlsx";

export interface ProdutoEstoque {
  codigo: string;
  descricao: string;
  ncm: string; // sempre 8 dígitos
}

export interface ResultadoParse {
  produtos: ProdutoEstoque[];
  ncmsUnicos: string[];
  linhasIgnoradas: number;
}

function normalizarNcm(ncm: string): string | null {
  const digitos = (ncm || "").replace(/\D/g, "");
  if (digitos.length < 4) return null;
  return digitos.padStart(8, "0").slice(0, 8);
}

function ehCabecalhoOuLixo(codigo: string): boolean {
  const s = (codigo || "").toLowerCase();
  return (
    s === "" ||
    s === "código" ||
    s === "codigo" ||
    s.includes("empresa") ||
    s.includes("c.n.p.j") ||
    s.includes("cnpj") ||
    s.includes("página")
  );
}

/**
 * Faz o parse a partir de um Buffer (arquivo enviado).
 * Suporta .xls (BIFF), .xlsx e .csv.
 */
export function parseEstoqueDominio(arquivo: Buffer | Uint8Array): ResultadoParse {
  const wb = XLSX.read(arquivo, {
    type: arquivo instanceof Buffer ? "buffer" : "array",
    cellDates: false,
    cellText: true,
    dense: true, // usa array 2D
    WTF: true, // parser mais permissivo
  });

  const sheetName = wb.SheetNames[0];
  const sheet = wb.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    defval: "",
    raw: false,
  });

  const produtos: ProdutoEstoque[] = [];
  const ncmsSet = new Set<string>();
  let linhasIgnoradas = 0;

  for (const r of rows) {
    if (!Array.isArray(r) || r.length < 12) {
      linhasIgnoradas++;
      continue;
    }
    const codigo = String(r[0] ?? "").trim();
    const descricao = String(r[5] ?? "").trim();
    const ncmRaw = String(r[11] ?? "").trim();

    if (!codigo || !descricao || !ncmRaw) {
      linhasIgnoradas++;
      continue;
    }
    if (ehCabecalhoOuLixo(codigo)) {
      linhasIgnoradas++;
      continue;
    }
    const ncm = normalizarNcm(ncmRaw);
    if (!ncm) {
      linhasIgnoradas++;
      continue;
    }
    if (ncm === "00000000") {
      linhasIgnoradas++;
      continue;
    }

    produtos.push({ codigo, descricao, ncm });
    ncmsSet.add(ncm);
  }

  return {
    produtos,
    ncmsUnicos: [...ncmsSet].sort(),
    linhasIgnoradas,
  };
}
