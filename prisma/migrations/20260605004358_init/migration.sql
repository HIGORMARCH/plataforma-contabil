-- CreateTable
CREATE TABLE "Escritorio" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "razaoSocial" TEXT NOT NULL,
    "nomeFantasia" TEXT,
    "cnpj" TEXT,
    "crc" TEXT,
    "endereco" TEXT,
    "telefone" TEXT,
    "email" TEXT,
    "site" TEXT,
    "logoDataUrl" TEXT,
    "assinaturaDataUrl" TEXT,
    "corPrimaria" TEXT NOT NULL DEFAULT '#1e3a5f',
    "corSecundaria" TEXT NOT NULL DEFAULT '#2c7a7b',
    "rodapePadrao" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Usuario" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "nome" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "senhaHash" TEXT NOT NULL,
    "papel" TEXT NOT NULL,
    "crc" TEXT,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "escritorioId" TEXT NOT NULL,
    "clienteId" TEXT,
    "aceiteTermos" BOOLEAN NOT NULL DEFAULT false,
    "aceiteTermosData" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Usuario_escritorioId_fkey" FOREIGN KEY ("escritorioId") REFERENCES "Escritorio" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Usuario_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "Cliente" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Cliente" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "razaoSocial" TEXT NOT NULL,
    "nomeFantasia" TEXT,
    "cnpj" TEXT NOT NULL,
    "inscricaoEstadual" TEXT,
    "inscricaoMunicipal" TEXT,
    "cnaePrincipal" TEXT,
    "regimeTributario" TEXT,
    "porte" TEXT,
    "naturezaJuridica" TEXT,
    "municipio" TEXT,
    "uf" TEXT,
    "setorAtividade" TEXT,
    "responsavelLegal" TEXT,
    "contadorResponsavel" TEXT,
    "crcContador" TEXT,
    "email" TEXT,
    "telefone" TEXT,
    "escritorioId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Cliente_escritorioId_fkey" FOREIGN KEY ("escritorioId") REFERENCES "Escritorio" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Exercicio" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "ano" INTEGER NOT NULL,
    "dadosJson" TEXT NOT NULL,
    "documentos" TEXT,
    "clienteId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Exercicio_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "Cliente" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Relatorio" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "titulo" TEXT NOT NULL DEFAULT 'Relatório de Análise Financeira e Contábil',
    "periodo" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'EM_ANALISE',
    "situacao" TEXT,
    "bloqueado" BOOLEAN NOT NULL DEFAULT false,
    "conteudoJson" TEXT NOT NULL,
    "origemTexto" TEXT,
    "observacaoIA" TEXT,
    "comentarioContador" TEXT,
    "clienteId" TEXT NOT NULL,
    "criadoPor" TEXT,
    "aprovadoPor" TEXT,
    "aprovadoEm" DATETIME,
    "liberadoEm" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Relatorio_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "Cliente" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "LogAcesso" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "acao" TEXT NOT NULL,
    "detalhe" TEXT,
    "usuarioId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "LogAcesso_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "Usuario_email_key" ON "Usuario"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Exercicio_clienteId_ano_key" ON "Exercicio"("clienteId", "ano");
