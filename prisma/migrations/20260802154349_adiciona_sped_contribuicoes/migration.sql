-- CreateTable
CREATE TABLE "SpedContribApuracao" (
    "id" TEXT NOT NULL,
    "clienteId" TEXT NOT NULL,
    "periodoApuracao" TIMESTAMP(3) NOT NULL,
    "dataInicial" TIMESTAMP(3) NOT NULL,
    "dataFinal" TIMESTAMP(3) NOT NULL,
    "regimeApuracao" TEXT,
    "indAtividade" TEXT,
    "pisNaoCumulativaPeriodo" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "pisCreditosDescontados" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "pisNaoCumulativaDevida" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "pisCumulativaPeriodo" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "pisApuradaPeriodo" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "pisCreditoAnterior" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "pisAjustesAcrescimo" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "pisAjustesReducao" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "pisContribuicaoDevida" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "cofinsNaoCumulativaPeriodo" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "cofinsCreditosDescontados" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "cofinsNaoCumulativaDevida" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "cofinsCumulativaPeriodo" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "cofinsApuradaPeriodo" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "cofinsCreditoAnterior" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "cofinsAjustesAcrescimo" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "cofinsAjustesReducao" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "cofinsContribuicaoDevida" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "importacaoId" TEXT NOT NULL,

    CONSTRAINT "SpedContribApuracao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SpedContribImportacao" (
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
    "regimeArq" TEXT,
    "importadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "importadoPor" TEXT,

    CONSTRAINT "SpedContribImportacao_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SpedContribApuracao_clienteId_periodoApuracao_idx" ON "SpedContribApuracao"("clienteId", "periodoApuracao");

-- CreateIndex
CREATE INDEX "SpedContribApuracao_importacaoId_idx" ON "SpedContribApuracao"("importacaoId");

-- CreateIndex
CREATE UNIQUE INDEX "SpedContribApuracao_clienteId_periodoApuracao_key" ON "SpedContribApuracao"("clienteId", "periodoApuracao");

-- CreateIndex
CREATE INDEX "SpedContribImportacao_clienteId_importadoEm_idx" ON "SpedContribImportacao"("clienteId", "importadoEm");

-- CreateIndex
CREATE INDEX "SpedContribImportacao_clienteId_hashArquivo_idx" ON "SpedContribImportacao"("clienteId", "hashArquivo");

-- AddForeignKey
ALTER TABLE "SpedContribApuracao" ADD CONSTRAINT "SpedContribApuracao_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "Cliente"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SpedContribApuracao" ADD CONSTRAINT "SpedContribApuracao_importacaoId_fkey" FOREIGN KEY ("importacaoId") REFERENCES "SpedContribImportacao"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SpedContribImportacao" ADD CONSTRAINT "SpedContribImportacao_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "Cliente"("id") ON DELETE CASCADE ON UPDATE CASCADE;
