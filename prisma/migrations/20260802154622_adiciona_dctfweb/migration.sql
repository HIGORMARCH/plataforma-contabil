-- CreateTable
CREATE TABLE "DctfWebDeclaracao" (
    "id" TEXT NOT NULL,
    "clienteId" TEXT NOT NULL,
    "periodoApuracao" TIMESTAMP(3) NOT NULL,
    "categoria" TEXT,
    "pisConfessado" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "cofinsConfessado" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "numeroRecibo" TEXT,
    "situacao" TEXT,
    "dataRecepcao" TIMESTAMP(3),
    "transmitida" BOOLEAN NOT NULL DEFAULT false,
    "payloadBruto" JSONB,
    "sincronizacaoId" TEXT NOT NULL,

    CONSTRAINT "DctfWebDeclaracao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DctfWebSincronizacao" (
    "id" TEXT NOT NULL,
    "clienteId" TEXT NOT NULL,
    "periodoInicial" TIMESTAMP(3) NOT NULL,
    "periodoFinal" TIMESTAMP(3) NOT NULL,
    "declaracoesRetornadas" INTEGER NOT NULL DEFAULT 0,
    "sucesso" BOOLEAN NOT NULL DEFAULT true,
    "mensagem" TEXT,
    "requisitadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "requisitadoPor" TEXT,

    CONSTRAINT "DctfWebSincronizacao_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DctfWebDeclaracao_clienteId_periodoApuracao_idx" ON "DctfWebDeclaracao"("clienteId", "periodoApuracao");

-- CreateIndex
CREATE UNIQUE INDEX "DctfWebDeclaracao_clienteId_periodoApuracao_categoria_key" ON "DctfWebDeclaracao"("clienteId", "periodoApuracao", "categoria");

-- CreateIndex
CREATE INDEX "DctfWebSincronizacao_clienteId_requisitadoEm_idx" ON "DctfWebSincronizacao"("clienteId", "requisitadoEm");

-- AddForeignKey
ALTER TABLE "DctfWebDeclaracao" ADD CONSTRAINT "DctfWebDeclaracao_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "Cliente"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DctfWebDeclaracao" ADD CONSTRAINT "DctfWebDeclaracao_sincronizacaoId_fkey" FOREIGN KEY ("sincronizacaoId") REFERENCES "DctfWebSincronizacao"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DctfWebSincronizacao" ADD CONSTRAINT "DctfWebSincronizacao_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "Cliente"("id") ON DELETE CASCADE ON UPDATE CASCADE;
