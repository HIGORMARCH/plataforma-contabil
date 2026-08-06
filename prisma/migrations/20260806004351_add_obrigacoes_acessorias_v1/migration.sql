-- AlterTable
ALTER TABLE "Cliente" ADD COLUMN     "incluirObrigacoesNoRelatorio" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "ArquivoObrigacaoDetectado" (
    "id" TEXT NOT NULL,
    "clienteId" TEXT NOT NULL,
    "tipoObrigacao" TEXT NOT NULL,
    "ano" INTEGER NOT NULL,
    "mes" INTEGER,
    "caminho" TEXT NOT NULL,
    "nomeArquivo" TEXT NOT NULL,
    "tamanhoBytes" INTEGER NOT NULL DEFAULT 0,
    "hashArquivo" TEXT,
    "mtime" TIMESTAMP(3) NOT NULL,
    "detectadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ArquivoObrigacaoDetectado_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EntregaObrigacaoManual" (
    "id" TEXT NOT NULL,
    "clienteId" TEXT NOT NULL,
    "tipoObrigacao" TEXT NOT NULL,
    "ano" INTEGER NOT NULL,
    "mes" INTEGER,
    "dataEntrega" TIMESTAMP(3) NOT NULL,
    "numeroRecibo" TEXT,
    "observacao" TEXT,
    "registradoPor" TEXT,
    "registradoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EntregaObrigacaoManual_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ArquivoObrigacaoDetectado_clienteId_idx" ON "ArquivoObrigacaoDetectado"("clienteId");

-- CreateIndex
CREATE UNIQUE INDEX "ArquivoObrigacaoDetectado_clienteId_tipoObrigacao_ano_mes_key" ON "ArquivoObrigacaoDetectado"("clienteId", "tipoObrigacao", "ano", "mes");

-- CreateIndex
CREATE INDEX "EntregaObrigacaoManual_clienteId_idx" ON "EntregaObrigacaoManual"("clienteId");

-- CreateIndex
CREATE UNIQUE INDEX "EntregaObrigacaoManual_clienteId_tipoObrigacao_ano_mes_key" ON "EntregaObrigacaoManual"("clienteId", "tipoObrigacao", "ano", "mes");

-- AddForeignKey
ALTER TABLE "ArquivoObrigacaoDetectado" ADD CONSTRAINT "ArquivoObrigacaoDetectado_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "Cliente"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EntregaObrigacaoManual" ADD CONSTRAINT "EntregaObrigacaoManual_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "Cliente"("id") ON DELETE CASCADE ON UPDATE CASCADE;
