-- AlterTable
ALTER TABLE "EntregaObrigacaoManual" ADD COLUMN     "origem" TEXT NOT NULL DEFAULT 'MANUAL';

-- CreateTable
CREATE TABLE "SimplesNacionalSincronizacao" (
    "id" TEXT NOT NULL,
    "clienteId" TEXT NOT NULL,
    "anoInicial" INTEGER NOT NULL,
    "anoFinal" INTEGER NOT NULL,
    "tiposConsultados" TEXT NOT NULL,
    "entregasEncontradas" INTEGER NOT NULL DEFAULT 0,
    "entregasSubstituidas" INTEGER NOT NULL DEFAULT 0,
    "sucesso" BOOLEAN NOT NULL DEFAULT true,
    "mensagem" TEXT,
    "executadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "executadoPor" TEXT,

    CONSTRAINT "SimplesNacionalSincronizacao_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SimplesNacionalSincronizacao_clienteId_executadoEm_idx" ON "SimplesNacionalSincronizacao"("clienteId", "executadoEm");

-- AddForeignKey
ALTER TABLE "SimplesNacionalSincronizacao" ADD CONSTRAINT "SimplesNacionalSincronizacao_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "Cliente"("id") ON DELETE CASCADE ON UPDATE CASCADE;
