# Publicação de 28/09/2026 — estabelecimentos, Siagri e ECF por período

O banco de produção sai do schema de 14/08/2026. A ordem importa: o vínculo com
o estabelecimento não pode nascer obrigatório em tabela que já tem dado.

1. Backup do banco (pg_dump) e parar o serviço `plataforma-contabil`.
2. `git pull` e `npm ci`.
3. Conferir o que vai mudar, sem aplicar:
   `npx prisma migrate diff --from-schema-datasource prisma/schema.prisma --to-schema-datamodel prisma/deploy-2026-09-28/schema-fase-a.prisma --script`
4. `npx prisma db push --schema prisma/deploy-2026-09-28/schema-fase-a.prisma --skip-generate`
5. `npx prisma generate` e `npx tsx prisma/deploy-2026-09-28/preencher.ts`
   — tem que terminar com "OK: nenhum registro sem estabelecimento".
6. `npx prisma db push` (schema final) — os avisos de chave única nova são
   esperados; não há duplicata porque cada cliente tem só a matriz.
7. `npx prisma generate`, build e religar o serviço.
