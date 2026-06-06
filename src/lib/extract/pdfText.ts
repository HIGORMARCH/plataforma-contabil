/**
 * Extração de texto de PDF no servidor (Node), usando pdfjs-dist.
 * Reconstrói linhas agrupando itens por posição vertical, para manter
 * "nome da conta" e "valor" na mesma linha — essencial para o parser.
 */

// Build legacy roda em Node sem worker dedicado (fake worker no mesmo thread).
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";

interface ItemTexto {
  str: string;
  transform: number[];
}

export async function extrairLinhasPdf(buffer: ArrayBuffer): Promise<string[]> {
  const loadingTask = getDocument({
    data: new Uint8Array(buffer),
    useSystemFonts: true,
  });
  const pdf = await loadingTask.promise;
  const linhas: string[] = [];

  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p);
    const content = await page.getTextContent();
    const itens = content.items as ItemTexto[];

    // Agrupa por coordenada Y (arredondada) para formar linhas.
    const grupos = new Map<number, { x: number; str: string }[]>();
    for (const it of itens) {
      if (!it.str || !it.str.trim()) continue;
      const y = Math.round(it.transform[5]);
      const x = it.transform[4];
      // Tolerância: agrupa Ys próximos (±2) ao grupo existente mais próximo.
      let chave = y;
      for (const k of grupos.keys()) {
        if (Math.abs(k - y) <= 2) {
          chave = k;
          break;
        }
      }
      if (!grupos.has(chave)) grupos.set(chave, []);
      grupos.get(chave)!.push({ x, str: it.str });
    }

    // Ordena linhas de cima para baixo (Y decrescente) e itens da esquerda p/ direita.
    const ys = [...grupos.keys()].sort((a, b) => b - a);
    for (const y of ys) {
      const partes = grupos.get(y)!.sort((a, b) => a.x - b.x);
      const texto = partes.map((p) => p.str).join(" ").replace(/\s+/g, " ").trim();
      if (texto) linhas.push(texto);
    }
  }

  await pdf.cleanup();
  return linhas;
}
