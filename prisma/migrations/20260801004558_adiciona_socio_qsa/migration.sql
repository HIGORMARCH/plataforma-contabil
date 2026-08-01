-- CreateTable
CREATE TABLE "Socio" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "codigoQualificacao" INTEGER,
    "qualificacao" TEXT,
    "cpfCnpjMascarado" TEXT,
    "faixaEtaria" TEXT,
    "dataEntradaSociedade" TIMESTAMP(3),
    "nomeRepresentanteLegal" TEXT,
    "cpfRepresentanteMascarado" TEXT,
    "codigoQualificacaoRepresentante" INTEGER,
    "clienteId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Socio_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Socio_clienteId_idx" ON "Socio"("clienteId");

-- AddForeignKey
ALTER TABLE "Socio" ADD CONSTRAINT "Socio_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "Cliente"("id") ON DELETE CASCADE ON UPDATE CASCADE;
