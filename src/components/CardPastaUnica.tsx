import { existsSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { pastaCliente, type ClienteRef, type TipoDocumento } from "@/lib/storage/filesystem";

const TIPOS: Array<{ tipo: TipoDocumento; rotulo: string; emoji: string }> = [
  { tipo: "DCTF-ANTIGA", rotulo: "DCTF antiga (.dec)", emoji: "📄" },
  { tipo: "DCTFWEB", rotulo: "DCTFWeb (XML)", emoji: "🌐" },
  { tipo: "SPED-CONTRIBUICOES", rotulo: "SPED-Contribuições", emoji: "🧾" },
  { tipo: "SPED-FISCAL", rotulo: "SPED-Fiscal (ICMS)", emoji: "📊" },
  { tipo: "SPED-ECD", rotulo: "SPED-ECD (Contábil)", emoji: "📚" },
  { tipo: "SPED-ECF", rotulo: "SPED-ECF (Fiscal)", emoji: "📕" },
  { tipo: "BALANCOS-DOMINIO", rotulo: "Balanços do Domínio", emoji: "📈" },
  { tipo: "DEFIS", rotulo: "DEFIS (Simples)", emoji: "📝" },
];

/** Conta arquivos recursivamente na subpasta do tipo. */
function contarArquivos(basePath: string): { total: number; anos: number[] } {
  if (!existsSync(basePath)) return { total: 0, anos: [] };
  const anos: number[] = [];
  let total = 0;
  try {
    for (const nome of readdirSync(basePath)) {
      const p = path.join(basePath, nome);
      if (!statSync(p).isDirectory()) continue;
      if (!/^\d{4}$/.test(nome)) continue;
      const arqs = readdirSync(p).filter((f) => statSync(path.join(p, f)).isFile());
      if (arqs.length > 0) {
        anos.push(Number(nome));
        total += arqs.length;
      }
    }
  } catch {
    // pasta sem permissão ou corrompida — ignora
  }
  return { total, anos: anos.sort((a, b) => a - b) };
}

/**
 * Card com o inventário local por tipo de documento — fonte única do cliente.
 * Server component: lê o filesystem no render. Se a pasta não existir, mostra
 * mensagem de "ainda não populada".
 */
export function CardPastaUnica({ cliente }: { cliente: ClienteRef }) {
  const raiz = pastaCliente(cliente);
  const pastaExiste = existsSync(raiz);

  const inventario = TIPOS.map((t) => {
    const p = path.join(raiz, t.tipo);
    const { total, anos } = contarArquivos(p);
    return { ...t, total, anos };
  });

  const totalGeral = inventario.reduce((s, i) => s + i.total, 0);

  return (
    <section className="card p-5">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-bold uppercase tracking-wide text-slate-500">
          Arquivos locais (pasta única)
        </h2>
        <span className="text-xs font-semibold text-slate-500">
          {totalGeral} arquivo(s)
        </span>
      </div>
      <div className="mb-3 rounded bg-slate-50 px-3 py-2 text-xs text-slate-600">
        <code className="break-all">{raiz}</code>
        {!pastaExiste && (
          <div className="mt-1 text-amber-700">
            ⚠ Pasta ainda não criada — vai surgir na primeira importação.
          </div>
        )}
      </div>
      <ul className="space-y-1 text-sm">
        {inventario.map((i) => (
          <li key={i.tipo} className="flex items-center justify-between">
            <span className="flex items-center gap-2">
              <span className="text-base">{i.emoji}</span>
              <span className={i.total === 0 ? "text-slate-400" : "text-slate-700"}>{i.rotulo}</span>
            </span>
            <span className={`tabular-nums ${i.total === 0 ? "text-slate-300" : "font-semibold text-slate-700"}`}>
              {i.total === 0 ? "—" : `${i.total} · ${i.anos[0]}-${i.anos[i.anos.length - 1]}`}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
