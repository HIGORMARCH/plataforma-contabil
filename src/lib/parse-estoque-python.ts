/**
 * Parser via Python `python-calamine` (engine Rust) — lê o .xls "estranho"
 * do Domínio que o SheetJS não consegue abrir.
 *
 * Requer Python instalado + pacote python-calamine (foi instalado hoje
 * durante o piloto Lupo).
 */
import { spawn } from "node:child_process";
import { writeFile, mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

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

const SCRIPT_PYTHON = `
import sys, json
from python_calamine import CalamineWorkbook

path = sys.argv[1]
wb = CalamineWorkbook.from_path(path)
rows = wb.get_sheet_by_index(0).to_python()

produtos = []
ncms = set()
ignoradas = 0

for r in rows:
    if len(r) < 12:
        ignoradas += 1
        continue
    codigo = str(r[0] or "").strip()
    descricao = str(r[5] or "").strip()
    ncm_raw = str(r[11] or "").strip()

    if not codigo or not descricao or not ncm_raw:
        ignoradas += 1
        continue
    cl = codigo.lower()
    if cl in ("codigo", "código") or "empresa" in cl or "c.n.p.j" in cl or "cnpj" in cl or "página" in cl:
        ignoradas += 1
        continue

    digitos = "".join(c for c in ncm_raw if c.isdigit())
    if len(digitos) < 4:
        ignoradas += 1
        continue
    ncm = digitos.zfill(8)[:8]
    if ncm == "00000000":
        ignoradas += 1
        continue

    produtos.append({"codigo": codigo, "descricao": descricao, "ncm": ncm})
    ncms.add(ncm)

print(json.dumps({
    "produtos": produtos,
    "ncmsUnicos": sorted(ncms),
    "linhasIgnoradas": ignoradas,
}, ensure_ascii=False))
`;

export async function parseEstoqueViaPython(caminhoArquivo: string): Promise<ResultadoParse> {
  // Grava o script num arquivo temp e roda
  const dir = await mkdtemp(join(tmpdir(), "estoque-parse-"));
  const scriptPath = join(dir, "parse.py");
  await writeFile(scriptPath, SCRIPT_PYTHON, "utf-8");

  return new Promise<ResultadoParse>((resolve, reject) => {
    const proc = spawn("python", [scriptPath, caminhoArquivo], {
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    proc.stdout.on("data", (d) => (stdout += d.toString("utf-8")));
    proc.stderr.on("data", (d) => (stderr += d.toString("utf-8")));
    proc.on("error", (e) => reject(new Error(`Falha ao spawn python: ${e.message}`)));
    proc.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(`Python saiu com código ${code}: ${stderr.slice(0, 400)}`));
        return;
      }
      try {
        const parsed = JSON.parse(stdout);
        resolve(parsed as ResultadoParse);
      } catch (e) {
        reject(new Error(`Erro parseando JSON do Python: ${e instanceof Error ? e.message : String(e)}`));
      }
    });
  });
}
