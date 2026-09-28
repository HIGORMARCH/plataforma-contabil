/**
 * Publicação de 28/09/2026 — passo entre o schema-fase-a e o schema final.
 *
 *  1. Todo cliente sem estabelecimento ganha a MATRIZ (numero 0) com o
 *     CNPJ/IE/UF/município do cadastro. Senha SEFAZ e vigência da IE NÃO são
 *     copiadas (a matriz lê do Cliente — src/lib/estabelecimento.ts).
 *  2. Apurações/importações de ICMS sem vínculo são ligadas à matriz.
 *  3. ECF antiga ganha o período "T0<trimestre>".
 *
 * Nenhum valor é alterado. Idempotente. SQL direto porque o client gerado do
 * schema final já tem o vínculo como obrigatório.
 *
 * Rodar (na pasta da aplicação): npx tsx prisma/deploy-2026-09-28/preencher.ts
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const soDigitos = (s: string | null) => (s ?? "").replace(/\D/g, "");
const TABELAS = [
  "SpedApuracao",
  "SpedImportacao",
  "GiamApuracao",
  "GiamImportacao",
  "GiamSefazApuracao",
  "GiamSefazSincronizacao",
];

async function main() {
  const clientes = await prisma.$queryRawUnsafe<
    { id: string; razaoSocial: string; cnpj: string; inscricaoEstadual: string | null; uf: string | null; municipio: string | null }[]
  >(`SELECT id, "razaoSocial", cnpj, "inscricaoEstadual", uf, municipio FROM "Cliente"`);

  for (const c of clientes) {
    const [ex] = await prisma.$queryRawUnsafe<{ id: string }[]>(
      `SELECT id FROM "Estabelecimento" WHERE "clienteId" = $1 AND numero = 0`,
      c.id,
    );
    let matrizId = ex?.id;
    if (!matrizId) {
      const m = await prisma.estabelecimento.create({
        data: {
          clienteId: c.id,
          tipo: "MATRIZ",
          numero: 0,
          cnpj: soDigitos(c.cnpj),
          inscricaoEstadual: c.inscricaoEstadual,
          uf: c.uf,
          municipio: c.municipio,
        },
        select: { id: true },
      });
      matrizId = m.id;
    }
    const ligados: string[] = [];
    for (const t of TABELAS) {
      const n = await prisma.$executeRawUnsafe(
        `UPDATE "${t}" SET "estabelecimentoId" = $1 WHERE "clienteId" = $2 AND "estabelecimentoId" IS NULL`,
        matrizId,
        c.id,
      );
      if (n) ligados.push(`${t}=${n}`);
    }
    console.log(`${c.razaoSocial}: matriz ok${ligados.length ? " · " + ligados.join(" ") : ""}`);
  }

  const ecf = await prisma.$executeRawUnsafe(
    `UPDATE "EcfApuracao" SET "periodo" = 'T0' || "trimestre" WHERE "periodo" = ''`,
  );
  console.log(`ECF com período preenchido: ${ecf}`);

  let soltos = 0;
  for (const t of TABELAS) {
    const [{ n }] = await prisma.$queryRawUnsafe<{ n: bigint }[]>(
      `SELECT count(*) AS n FROM "${t}" WHERE "estabelecimentoId" IS NULL`,
    );
    if (Number(n) > 0) {
      soltos += Number(n);
      console.log(`ATENÇÃO: ${t} com ${n} registro(s) sem estabelecimento`);
    }
  }
  console.log(soltos === 0 ? "OK: nenhum registro sem estabelecimento — pode aplicar o schema final." : "PARE: há registros sem estabelecimento.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
