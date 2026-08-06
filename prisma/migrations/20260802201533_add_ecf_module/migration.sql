-- CreateTable
CREATE TABLE "EcfApuracao" (
    "id" TEXT NOT NULL,
    "clienteId" TEXT NOT NULL,
    "ano" INTEGER NOT NULL,
    "trimestre" INTEGER NOT NULL,
    "dataInicial" TIMESTAMP(3) NOT NULL,
    "dataFinal" TIMESTAMP(3) NOT NULL,
    "regime" TEXT NOT NULL,
    "irpjApurado" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "csllApurada" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "importacaoId" TEXT NOT NULL,

    CONSTRAINT "EcfApuracao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EcfImportacao" (
    "id" TEXT NOT NULL,
    "clienteId" TEXT NOT NULL,
    "nomeArquivo" TEXT NOT NULL,
    "tamanhoBytes" INTEGER NOT NULL DEFAULT 0,
    "hashArquivo" TEXT,
    "origem" TEXT NOT NULL DEFAULT 'UPLOAD',
    "caminhoOrigem" TEXT,
    "totalLinhas" INTEGER NOT NULL DEFAULT 0,
    "apuracoesGravadas" INTEGER NOT NULL DEFAULT 0,
    "sucesso" BOOLEAN NOT NULL DEFAULT true,
    "mensagem" TEXT,
    "cnpjArquivo" TEXT,
    "dataInicioArq" TIMESTAMP(3),
    "dataFimArq" TIMESTAMP(3),
    "ano" INTEGER,
    "regimeAno" TEXT,
    "importadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "importadoPor" TEXT,

    CONSTRAINT "EcfImportacao_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "EcfApuracao_clienteId_ano_idx" ON "EcfApuracao"("clienteId", "ano");

-- CreateIndex
CREATE INDEX "EcfApuracao_importacaoId_idx" ON "EcfApuracao"("importacaoId");

-- CreateIndex
CREATE UNIQUE INDEX "EcfApuracao_clienteId_ano_trimestre_key" ON "EcfApuracao"("clienteId", "ano", "trimestre");

-- CreateIndex
CREATE INDEX "EcfImportacao_clienteId_importadoEm_idx" ON "EcfImportacao"("clienteId", "importadoEm");

-- CreateIndex
CREATE INDEX "EcfImportacao_clienteId_hashArquivo_idx" ON "EcfImportacao"("clienteId", "hashArquivo");

-- AddForeignKey
ALTER TABLE "EcfApuracao" ADD CONSTRAINT "EcfApuracao_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "Cliente"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EcfApuracao" ADD CONSTRAINT "EcfApuracao_importacaoId_fkey" FOREIGN KEY ("importacaoId") REFERENCES "EcfImportacao"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EcfImportacao" ADD CONSTRAINT "EcfImportacao_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "Cliente"("id") ON DELETE CASCADE ON UPDATE CASCADE;
