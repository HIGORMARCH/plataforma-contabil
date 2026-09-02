/**
 * Conferência da apuração do ICMS de quem não escritura no Domínio.
 *
 * O cliente que apura em sistema próprio (Siagri, por exemplo) imprime o
 * conjunto do mês e manda pro escritório. E ali existe uma dependência que não
 * aparece em lugar nenhum: **sem fechar o inventário do mês o sistema não apura
 * o ICMS**. Quando falta o inventário na pasta, ou o fechamento não foi feito
 * (e aí a apuração que está ali não vale), ou foi feito e ninguém guardou o
 * comprovante.
 *
 * O jeito antigo de descobrir isso era alguém abrir a pasta e sentir falta.
 * Aqui a falta é apontada.
 */

import { readdirSync, statSync } from "node:fs";
import path from "node:path";
import { pastaRaiz } from "@/lib/storage/filesystem";

/** Nome da pasta onde o robô arquiva o conjunto da apuração. */
export const PASTA_APURACAO = "APURAÇÃO ICMS";

/**
 * Documentos que a competência precisa ter.
 *
 * O resumo por CFOP fica de fora de propósito: é conferência, não obrigação —
 * cobrar ele viraria alarme falso todo mês.
 */
export const DOCUMENTOS_ESPERADOS = ["APURAÇÃO ICMS", "ENTRADAS", "SAIDAS", "INVENTARIO"] as const;

export type DocumentoApuracao = (typeof DOCUMENTOS_ESPERADOS)[number];

export interface CompetenciaApuracao {
  empresa: string;
  /** Nome da pasta, para o operador achar no disco. */
  pasta: string;
  ano: number;
  mes: number;
  presentes: string[];
  faltando: DocumentoApuracao[];
}

/** `APURAÇÃO ICMS 01.2026.pdf` → documento + competência. */
function lerNome(nome: string): { documento: string; ano: number; mes: number } | null {
  const m = /^(.+?) (\d{2})\.(\d{4})(?: RETIFICADORA)?\.[a-z]+$/i.exec(nome);
  if (!m) return null;
  return { documento: m[1].toUpperCase(), ano: Number(m[3]), mes: Number(m[2]) };
}

/** A empresa é o nome da pasta sem o CNPJ colado no fim. */
function nomeLegivel(pasta: string): string {
  return pasta.replace(/_\d{14}$/, "").replace(/_/g, " ").trim();
}

/**
 * Varre as pastas de apuração e devolve uma linha por competência encontrada.
 *
 * Só enxerga empresa que TEM a pasta: quem escritura no Domínio não passa por
 * aqui e não pode aparecer como pendência.
 */
export function conferirApuracaoIcms(raiz = pastaRaiz()): CompetenciaApuracao[] {
  const linhas: CompetenciaApuracao[] = [];

  let empresas: string[];
  try {
    empresas = readdirSync(raiz, { withFileTypes: true })
      .filter((e) => e.isDirectory() && !e.name.startsWith("_"))
      .map((e) => e.name);
  } catch {
    return [];
  }

  for (const empresa of empresas) {
    const base = path.join(raiz, empresa, "FISCAL", PASTA_APURACAO);
    let anos: string[];
    try {
      anos = readdirSync(base);
    } catch {
      continue; // empresa que apura no Domínio — não tem essa pasta
    }

    for (const ano of anos) {
      const dir = path.join(base, ano);
      try {
        if (!statSync(dir).isDirectory()) continue;
      } catch {
        continue;
      }

      // Competência → o que existe nela.
      const porCompetencia = new Map<string, Set<string>>();
      for (const arquivo of readdirSync(dir)) {
        const lido = lerNome(arquivo);
        if (!lido) continue;
        const chave = `${lido.ano}-${lido.mes}`;
        const conjunto = porCompetencia.get(chave) ?? new Set<string>();
        conjunto.add(lido.documento);
        porCompetencia.set(chave, conjunto);
      }

      for (const [chave, presentes] of porCompetencia) {
        const [a, m] = chave.split("-").map(Number);
        linhas.push({
          empresa: nomeLegivel(empresa),
          pasta: empresa,
          ano: a,
          mes: m,
          presentes: [...presentes].sort(),
          faltando: DOCUMENTOS_ESPERADOS.filter((d) => !presentes.has(d)),
        });
      }
    }
  }

  return linhas.sort(
    (x, y) => x.empresa.localeCompare(y.empresa) || y.ano - x.ano || y.mes - x.mes,
  );
}
