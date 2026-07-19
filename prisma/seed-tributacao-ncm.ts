/**
 * Semente do módulo de Tributação NCM.
 *
 * Popula:
 *  - ConfiguracaoNcm com as 54 configurações do arquivo pai da Autmais + as 3 novas
 *    descobertas com o cliente Lupo (55/56/57).
 *  - NcmBase com os NCMs mapeados no arquivo pai (3089 linhas).
 *
 * Rodar: pnpm exec tsx prisma/seed-tributacao-ncm.ts
 * Ou:    npx tsx prisma/seed-tributacao-ncm.ts
 */
import { PrismaClient } from "@prisma/client";
import { readFileSync, existsSync } from "node:fs";

const prisma = new PrismaClient();

// Fonte: TXT completo Autmais (formato 9 colunas ;)
const ARQ_PAI = "Z:/HIGOR OBRIGAÇOES MENSAIS/AUTMAIS/e9f40d79-7266-4989-9013-c6505d0c8c1b.txt.txt";

// Deriva tipo do CST entrada
function tipoDoCst(cstE: string): string {
  switch (cstE.trim()) {
    case "73": return "aliquota_zero";
    case "70": return "monofasico";
    case "71": return "isenta";
    case "72": return "suspensao";
    case "74": return "sem_incidencia";
    case "75": return "substituicao";
    case "50": return "normal";
    case "98": return "outras_operacoes";
    default:   return "outro";
  }
}

async function main() {
  if (!existsSync(ARQ_PAI)) {
    console.error(`Arquivo pai não encontrado: ${ARQ_PAI}`);
    console.error("Ajuste o caminho ARQ_PAI no script se necessário.");
    process.exit(1);
  }

  // Lê arquivo pai (windows-1252)
  const buf = readFileSync(ARQ_PAI);
  const texto = new TextDecoder("windows-1252").decode(buf);
  const linhas = texto.split(/\r?\n/).filter((l) => l.trim());

  console.log(`[seed] lendo ${linhas.length} linhas do arquivo pai`);

  // Agrupa por código de configuração
  interface ConfigInfo {
    codigo: number;
    descricao: string;
    cstEntrada: string;
    cstSaida: string;
    natureza: string;
    ncms: string[];
  }
  const configs = new Map<number, ConfigInfo>();

  for (const linha of linhas) {
    const partes = linha.split(";");
    if (partes.length < 9) continue;
    const codigo = Number(partes[0]);
    if (Number.isNaN(codigo)) continue;
    const descricao = partes[1].trim();
    const ncm = partes[2].trim().replace(/\D/g, "").padStart(8, "0").slice(0, 8);
    const cstEntrada = partes[4].trim();
    const cstSaida = partes[7].trim();
    const natureza = partes[8].trim() || "0";

    if (!configs.has(codigo)) {
      configs.set(codigo, { codigo, descricao, cstEntrada, cstSaida, natureza, ncms: [] });
    }
    configs.get(codigo)!.ncms.push(ncm);
  }
  console.log(`[seed] ${configs.size} configurações únicas encontradas`);

  // Insere/atualiza configurações
  let contConfig = 0;
  let contNcm = 0;
  for (const cfg of configs.values()) {
    const tipo = tipoDoCst(cfg.cstEntrada);
    const conf = await prisma.configuracaoNcm.upsert({
      where: { codigo: cfg.codigo },
      update: {
        descricao: cfg.descricao,
        tipo,
        cstEntrada: cfg.cstEntrada,
        cstSaida: cfg.cstSaida,
        natureza: cfg.natureza,
      },
      create: {
        codigo: cfg.codigo,
        descricao: cfg.descricao,
        tipo,
        cstEntrada: cfg.cstEntrada,
        cstSaida: cfg.cstSaida,
        natureza: cfg.natureza,
        origem: "seed_autmais",
      },
    });
    contConfig++;

    // NCMs desta config
    for (const ncm of cfg.ncms) {
      await prisma.ncmBase.upsert({
        where: { ncm },
        update: { configuracaoId: conf.id },
        create: { ncm, configuracaoId: conf.id, origem: "seed_autmais" },
      });
      contNcm++;
    }
  }

  console.log(`[seed] ✅ ${contConfig} configurações e ${contNcm} NCMs base gravados`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
