-- CreateTable
CREATE TABLE "Escritorio" (
    "id" TEXT NOT NULL,
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
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Escritorio_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Usuario" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "senhaHash" TEXT NOT NULL,
    "papel" TEXT NOT NULL,
    "crc" TEXT,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "escritorioId" TEXT NOT NULL,
    "clienteId" TEXT,
    "aceiteTermos" BOOLEAN NOT NULL DEFAULT false,
    "aceiteTermosData" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Usuario_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Cliente" (
    "id" TEXT NOT NULL,
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
    "atividadeTributaria" TEXT,
    "responsavelLegal" TEXT,
    "contadorResponsavel" TEXT,
    "crcContador" TEXT,
    "email" TEXT,
    "telefone" TEXT,
    "metodoAcessoEcac" TEXT NOT NULL DEFAULT 'PROCURACAO_MARCH',
    "certificadoCaminho" TEXT,
    "certificadoSenha" TEXT,
    "senhaSefaz" TEXT,
    "pastaFiscal" TEXT,
    "pastaGiam" TEXT,
    "escritorioId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Cliente_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Exercicio" (
    "id" TEXT NOT NULL,
    "ano" INTEGER NOT NULL,
    "dadosJson" TEXT NOT NULL,
    "documentos" TEXT,
    "clienteId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Exercicio_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Relatorio" (
    "id" TEXT NOT NULL,
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
    "aprovadoEm" TIMESTAMP(3),
    "liberadoEm" TIMESTAMP(3),
    "shareToken" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Relatorio_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AcessoRelatorio" (
    "id" TEXT NOT NULL,
    "relatorioId" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "ip" TEXT,
    "userAgent" TEXT,
    "dispositivo" TEXT,
    "referer" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AcessoRelatorio_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LogAcesso" (
    "id" TEXT NOT NULL,
    "acao" TEXT NOT NULL,
    "detalhe" TEXT,
    "usuarioId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LogAcesso_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConfiguracaoNcm" (
    "id" TEXT NOT NULL,
    "codigo" INTEGER NOT NULL,
    "descricao" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "cstEntrada" TEXT NOT NULL,
    "cstSaida" TEXT NOT NULL,
    "natureza" TEXT NOT NULL,
    "origem" TEXT NOT NULL DEFAULT 'seed_autmais',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ConfiguracaoNcm_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NcmBase" (
    "ncm" TEXT NOT NULL,
    "configuracaoId" TEXT NOT NULL,
    "origem" TEXT NOT NULL DEFAULT 'seed_autmais',
    "atividadeContexto" TEXT,
    "atualizadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NcmBase_pkey" PRIMARY KEY ("ncm")
);

-- CreateTable
CREATE TABLE "VigenciaNcm" (
    "id" TEXT NOT NULL,
    "clienteId" TEXT NOT NULL,
    "dataVigencia" TIMESTAMP(3) NOT NULL,
    "descricao" TEXT NOT NULL DEFAULT 'TRIBUTAÇÃO',
    "status" TEXT NOT NULL DEFAULT 'EM_ELABORACAO',
    "arquivoEstoquePath" TEXT,
    "arquivoEstoqueNome" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VigenciaNcm_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NcmVigencia" (
    "id" TEXT NOT NULL,
    "vigenciaId" TEXT NOT NULL,
    "ncm" TEXT NOT NULL,
    "configuracaoId" TEXT NOT NULL,
    "origem" TEXT NOT NULL,
    "observacao" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NcmVigencia_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CacheEconet" (
    "id" TEXT NOT NULL,
    "ncm" TEXT NOT NULL,
    "atividade" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "natureza" TEXT,
    "cstEntrada" TEXT,
    "cstSaida" TEXT,
    "abasHtml" TEXT,
    "observacoes" TEXT,
    "consultadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CacheEconet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EcacPagamento" (
    "id" TEXT NOT NULL,
    "clienteId" TEXT NOT NULL,
    "numeroDocumento" TEXT NOT NULL,
    "tipoCodigo" TEXT NOT NULL,
    "tipoDescricao" TEXT NOT NULL,
    "referencia" TEXT,
    "periodoApuracao" TIMESTAMP(3) NOT NULL,
    "dataArrecadacao" TIMESTAMP(3) NOT NULL,
    "dataVencimento" TIMESTAMP(3) NOT NULL,
    "codigoReceitaPrincipal" TEXT NOT NULL,
    "descricaoReceitaPrincipal" TEXT,
    "valorTotal" DECIMAL(65,30) NOT NULL,
    "valorPrincipal" DECIMAL(65,30) NOT NULL,
    "valorMulta" DECIMAL(65,30),
    "valorJuros" DECIMAL(65,30),
    "valorSaldoTotal" DECIMAL(65,30),
    "valorSaldoPrincipal" DECIMAL(65,30),
    "valorSaldoMulta" DECIMAL(65,30),
    "valorSaldoJuros" DECIMAL(65,30),
    "sincronizadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EcacPagamento_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EcacDesmembramento" (
    "id" TEXT NOT NULL,
    "pagamentoId" TEXT NOT NULL,
    "sequencial" TEXT NOT NULL,
    "codigoReceita" TEXT NOT NULL,
    "descricaoReceita" TEXT,
    "extensaoCodigo" TEXT,
    "extensaoDescricao" TEXT,
    "periodoApuracao" TIMESTAMP(3) NOT NULL,
    "dataVencimento" TIMESTAMP(3) NOT NULL,
    "valorTotal" DECIMAL(65,30) NOT NULL,
    "valorPrincipal" DECIMAL(65,30) NOT NULL,
    "valorMulta" DECIMAL(65,30),
    "valorJuros" DECIMAL(65,30),
    "valorSaldoTotal" DECIMAL(65,30),
    "valorSaldoPrincipal" DECIMAL(65,30),
    "valorSaldoMulta" DECIMAL(65,30),
    "valorSaldoJuros" DECIMAL(65,30),
    "cib" TEXT,

    CONSTRAINT "EcacDesmembramento_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EcacSincronizacao" (
    "id" TEXT NOT NULL,
    "clienteId" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "periodoInicial" TIMESTAMP(3) NOT NULL,
    "periodoFinal" TIMESTAMP(3) NOT NULL,
    "quantidade" INTEGER NOT NULL DEFAULT 0,
    "sucesso" BOOLEAN NOT NULL DEFAULT true,
    "mensagem" TEXT,
    "executadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EcacSincronizacao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RazaoLancamento" (
    "id" TEXT NOT NULL,
    "clienteId" TEXT NOT NULL,
    "codigoReceita" TEXT NOT NULL,
    "numeroDocumento" TEXT,
    "descricaoReceita" TEXT,
    "contaContabil" TEXT,
    "historico" TEXT,
    "valorPrincipal" DECIMAL(65,30) NOT NULL,
    "valorMulta" DECIMAL(65,30),
    "valorJuros" DECIMAL(65,30),
    "valorTotal" DECIMAL(65,30) NOT NULL,
    "dataLancamento" TIMESTAMP(3) NOT NULL,
    "periodoApuracao" TIMESTAMP(3),
    "importacaoId" TEXT NOT NULL,

    CONSTRAINT "RazaoLancamento_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RazaoImportacao" (
    "id" TEXT NOT NULL,
    "clienteId" TEXT NOT NULL,
    "nomeArquivo" TEXT NOT NULL,
    "tamanhoBytes" INTEGER NOT NULL DEFAULT 0,
    "totalLinhas" INTEGER NOT NULL DEFAULT 0,
    "linhasImportadas" INTEGER NOT NULL DEFAULT 0,
    "linhasIgnoradas" INTEGER NOT NULL DEFAULT 0,
    "sucesso" BOOLEAN NOT NULL DEFAULT true,
    "mensagem" TEXT,
    "colunasDetectadas" TEXT,
    "importadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "importadoPor" TEXT,

    CONSTRAINT "RazaoImportacao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SpedApuracao" (
    "id" TEXT NOT NULL,
    "clienteId" TEXT NOT NULL,
    "periodoApuracao" TIMESTAMP(3) NOT NULL,
    "dataInicial" TIMESTAMP(3) NOT NULL,
    "dataFinal" TIMESTAMP(3) NOT NULL,
    "totalDebitos" DECIMAL(65,30) NOT NULL,
    "totalCreditos" DECIMAL(65,30) NOT NULL,
    "saldoDevedorApurado" DECIMAL(65,30) NOT NULL,
    "deducoes" DECIMAL(65,30) NOT NULL,
    "icmsARecolher" DECIMAL(65,30) NOT NULL,
    "saldoCredorTransp" DECIMAL(65,30) NOT NULL,
    "ajustesDebitos" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "totalAjustesDebitos" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "estornosCreditos" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "ajustesCreditos" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "totalAjustesCreditos" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "estornosDebitos" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "saldoCredorAnterior" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "debitoEspecial" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "totalCompras" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "totalVendas" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "qtdNotasCompras" INTEGER NOT NULL DEFAULT 0,
    "qtdNotasVendas" INTEGER NOT NULL DEFAULT 0,
    "importacaoId" TEXT NOT NULL,

    CONSTRAINT "SpedApuracao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SpedImportacao" (
    "id" TEXT NOT NULL,
    "clienteId" TEXT NOT NULL,
    "nomeArquivo" TEXT NOT NULL,
    "tamanhoBytes" INTEGER NOT NULL DEFAULT 0,
    "hashArquivo" TEXT,
    "origem" TEXT NOT NULL DEFAULT 'UPLOAD',
    "caminhoOrigem" TEXT,
    "totalLinhas" INTEGER NOT NULL DEFAULT 0,
    "registrosE110" INTEGER NOT NULL DEFAULT 0,
    "apuracoesGravadas" INTEGER NOT NULL DEFAULT 0,
    "apuracoesSubstituidas" INTEGER NOT NULL DEFAULT 0,
    "sucesso" BOOLEAN NOT NULL DEFAULT true,
    "mensagem" TEXT,
    "cnpjArquivo" TEXT,
    "ieArquivo" TEXT,
    "uf" TEXT,
    "dataInicioArq" TIMESTAMP(3),
    "dataFimArq" TIMESTAMP(3),
    "importadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "importadoPor" TEXT,

    CONSTRAINT "SpedImportacao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GiamApuracao" (
    "id" TEXT NOT NULL,
    "clienteId" TEXT NOT NULL,
    "periodoApuracao" TIMESTAMP(3) NOT NULL,
    "retificacao" TEXT NOT NULL DEFAULT '00',
    "debitoSaidas" DECIMAL(65,30) NOT NULL,
    "outrosDebitos" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "estornoCreditos" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "creditoEntradas" DECIMAL(65,30) NOT NULL,
    "outrosCreditos" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "estornosDebito" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "saldoCredorAnterior" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "deducoes" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "difAliquotaARecolher" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "totalEntradasBaseCalculo" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "totalEntradasIsentas" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "totalEntradasOutras" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "totalEntradasST" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "totalEntradasValorContabil" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "totalEntradasCredito" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "totalSaidasBaseCalculo" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "totalSaidasIsentas" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "totalSaidasOutras" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "totalSaidasST" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "totalSaidasValorContabil" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "totalSaidasDebito" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "totalCompras" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "totalVendas" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "icmsARecolherTotal" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "totalRegistros" INTEGER NOT NULL DEFAULT 0,
    "importacaoId" TEXT NOT NULL,

    CONSTRAINT "GiamApuracao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GiamSefazApuracao" (
    "id" TEXT NOT NULL,
    "clienteId" TEXT NOT NULL,
    "periodoApuracao" TIMESTAMP(3) NOT NULL,
    "retificacao" TEXT NOT NULL DEFAULT '00',
    "numeroControle" TEXT NOT NULL,
    "dataRecepcao" TIMESTAMP(3),
    "totalEntradasBaseCalculo" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "totalEntradasIsentas" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "totalEntradasOutras" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "totalEntradasST" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "totalEntradasValorContabil" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "totalEntradasCredito" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "totalSaidasBaseCalculo" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "totalSaidasIsentas" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "totalSaidasOutras" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "totalSaidasST" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "totalSaidasValorContabil" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "totalSaidasDebito" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "totalCompras" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "totalVendas" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "debitoSaidas" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "creditoEntradas" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "saldoCredorAnterior" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "deducoes" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "icmsARecolherNormal" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "sincronizadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sincronizacaoId" TEXT NOT NULL,

    CONSTRAINT "GiamSefazApuracao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GiamSefazLinhaSegmentoB" (
    "id" TEXT NOT NULL,
    "apuracaoId" TEXT NOT NULL,
    "natureza" TEXT NOT NULL,
    "cfop" TEXT NOT NULL,
    "baseCalculo" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "isentasNaoTributadas" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "outras" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "substituicaoTributaria" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "valorContabil" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "creditoDebitoImposto" DECIMAL(65,30) NOT NULL DEFAULT 0,

    CONSTRAINT "GiamSefazLinhaSegmentoB_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GiamSefazSincronizacao" (
    "id" TEXT NOT NULL,
    "clienteId" TEXT NOT NULL,
    "ano" INTEGER NOT NULL,
    "mesInicial" INTEGER NOT NULL,
    "mesFinal" INTEGER NOT NULL,
    "competenciasSolicitadas" INTEGER NOT NULL DEFAULT 0,
    "competenciasImportadas" INTEGER NOT NULL DEFAULT 0,
    "competenciasSubstituidas" INTEGER NOT NULL DEFAULT 0,
    "sucesso" BOOLEAN NOT NULL DEFAULT true,
    "mensagem" TEXT,
    "executadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "executadoPor" TEXT,

    CONSTRAINT "GiamSefazSincronizacao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GiamLinhaSegmentoB" (
    "id" TEXT NOT NULL,
    "apuracaoId" TEXT NOT NULL,
    "natureza" TEXT NOT NULL,
    "cfop" TEXT NOT NULL,
    "baseCalculo" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "isentasNaoTributadas" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "outras" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "substituicaoTributaria" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "valorContabil" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "creditoDebitoImposto" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "domicilioFiscal" TEXT NOT NULL,

    CONSTRAINT "GiamLinhaSegmentoB_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GiamIcmsARecolher" (
    "id" TEXT NOT NULL,
    "apuracaoId" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "dataVencimento" TIMESTAMP(3),
    "valor" DECIMAL(65,30) NOT NULL,

    CONSTRAINT "GiamIcmsARecolher_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GiamImportacao" (
    "id" TEXT NOT NULL,
    "clienteId" TEXT NOT NULL,
    "nomeArquivo" TEXT NOT NULL,
    "tamanhoBytes" INTEGER NOT NULL DEFAULT 0,
    "hashArquivo" TEXT,
    "origem" TEXT NOT NULL DEFAULT 'UPLOAD',
    "caminhoOrigem" TEXT,
    "sucesso" BOOLEAN NOT NULL DEFAULT true,
    "mensagem" TEXT,
    "ieArquivo" TEXT,
    "periodoArquivo" TEXT,
    "retificacaoArquivo" TEXT,
    "versaoArquivo" TEXT,
    "nomeContabilista" TEXT,
    "crcContabilista" TEXT,
    "importadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "importadoPor" TEXT,

    CONSTRAINT "GiamImportacao_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Usuario_email_key" ON "Usuario"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Exercicio_clienteId_ano_key" ON "Exercicio"("clienteId", "ano");

-- CreateIndex
CREATE UNIQUE INDEX "Relatorio_shareToken_key" ON "Relatorio"("shareToken");

-- CreateIndex
CREATE INDEX "AcessoRelatorio_relatorioId_idx" ON "AcessoRelatorio"("relatorioId");

-- CreateIndex
CREATE UNIQUE INDEX "ConfiguracaoNcm_codigo_key" ON "ConfiguracaoNcm"("codigo");

-- CreateIndex
CREATE INDEX "VigenciaNcm_clienteId_dataVigencia_idx" ON "VigenciaNcm"("clienteId", "dataVigencia");

-- CreateIndex
CREATE INDEX "NcmVigencia_vigenciaId_idx" ON "NcmVigencia"("vigenciaId");

-- CreateIndex
CREATE UNIQUE INDEX "NcmVigencia_vigenciaId_ncm_key" ON "NcmVigencia"("vigenciaId", "ncm");

-- CreateIndex
CREATE INDEX "CacheEconet_consultadoEm_idx" ON "CacheEconet"("consultadoEm");

-- CreateIndex
CREATE UNIQUE INDEX "CacheEconet_ncm_atividade_key" ON "CacheEconet"("ncm", "atividade");

-- CreateIndex
CREATE INDEX "EcacPagamento_clienteId_dataArrecadacao_idx" ON "EcacPagamento"("clienteId", "dataArrecadacao");

-- CreateIndex
CREATE INDEX "EcacPagamento_clienteId_periodoApuracao_idx" ON "EcacPagamento"("clienteId", "periodoApuracao");

-- CreateIndex
CREATE UNIQUE INDEX "EcacPagamento_clienteId_numeroDocumento_key" ON "EcacPagamento"("clienteId", "numeroDocumento");

-- CreateIndex
CREATE INDEX "EcacDesmembramento_pagamentoId_idx" ON "EcacDesmembramento"("pagamentoId");

-- CreateIndex
CREATE INDEX "EcacDesmembramento_codigoReceita_periodoApuracao_idx" ON "EcacDesmembramento"("codigoReceita", "periodoApuracao");

-- CreateIndex
CREATE INDEX "EcacSincronizacao_clienteId_executadoEm_idx" ON "EcacSincronizacao"("clienteId", "executadoEm");

-- CreateIndex
CREATE INDEX "EcacSincronizacao_clienteId_tipo_periodoInicial_periodoFina_idx" ON "EcacSincronizacao"("clienteId", "tipo", "periodoInicial", "periodoFinal");

-- CreateIndex
CREATE INDEX "RazaoLancamento_clienteId_codigoReceita_numeroDocumento_idx" ON "RazaoLancamento"("clienteId", "codigoReceita", "numeroDocumento");

-- CreateIndex
CREATE INDEX "RazaoLancamento_clienteId_periodoApuracao_idx" ON "RazaoLancamento"("clienteId", "periodoApuracao");

-- CreateIndex
CREATE INDEX "RazaoLancamento_importacaoId_idx" ON "RazaoLancamento"("importacaoId");

-- CreateIndex
CREATE INDEX "RazaoImportacao_clienteId_importadoEm_idx" ON "RazaoImportacao"("clienteId", "importadoEm");

-- CreateIndex
CREATE INDEX "SpedApuracao_clienteId_periodoApuracao_idx" ON "SpedApuracao"("clienteId", "periodoApuracao");

-- CreateIndex
CREATE INDEX "SpedApuracao_importacaoId_idx" ON "SpedApuracao"("importacaoId");

-- CreateIndex
CREATE UNIQUE INDEX "SpedApuracao_clienteId_periodoApuracao_key" ON "SpedApuracao"("clienteId", "periodoApuracao");

-- CreateIndex
CREATE INDEX "SpedImportacao_clienteId_importadoEm_idx" ON "SpedImportacao"("clienteId", "importadoEm");

-- CreateIndex
CREATE INDEX "SpedImportacao_clienteId_hashArquivo_idx" ON "SpedImportacao"("clienteId", "hashArquivo");

-- CreateIndex
CREATE INDEX "GiamApuracao_clienteId_periodoApuracao_idx" ON "GiamApuracao"("clienteId", "periodoApuracao");

-- CreateIndex
CREATE INDEX "GiamApuracao_importacaoId_idx" ON "GiamApuracao"("importacaoId");

-- CreateIndex
CREATE UNIQUE INDEX "GiamApuracao_clienteId_periodoApuracao_retificacao_key" ON "GiamApuracao"("clienteId", "periodoApuracao", "retificacao");

-- CreateIndex
CREATE INDEX "GiamSefazApuracao_clienteId_periodoApuracao_idx" ON "GiamSefazApuracao"("clienteId", "periodoApuracao");

-- CreateIndex
CREATE INDEX "GiamSefazApuracao_sincronizacaoId_idx" ON "GiamSefazApuracao"("sincronizacaoId");

-- CreateIndex
CREATE UNIQUE INDEX "GiamSefazApuracao_clienteId_periodoApuracao_retificacao_key" ON "GiamSefazApuracao"("clienteId", "periodoApuracao", "retificacao");

-- CreateIndex
CREATE INDEX "GiamSefazLinhaSegmentoB_apuracaoId_idx" ON "GiamSefazLinhaSegmentoB"("apuracaoId");

-- CreateIndex
CREATE INDEX "GiamSefazLinhaSegmentoB_apuracaoId_natureza_cfop_idx" ON "GiamSefazLinhaSegmentoB"("apuracaoId", "natureza", "cfop");

-- CreateIndex
CREATE INDEX "GiamSefazSincronizacao_clienteId_executadoEm_idx" ON "GiamSefazSincronizacao"("clienteId", "executadoEm");

-- CreateIndex
CREATE INDEX "GiamSefazSincronizacao_clienteId_ano_idx" ON "GiamSefazSincronizacao"("clienteId", "ano");

-- CreateIndex
CREATE INDEX "GiamLinhaSegmentoB_apuracaoId_idx" ON "GiamLinhaSegmentoB"("apuracaoId");

-- CreateIndex
CREATE INDEX "GiamLinhaSegmentoB_apuracaoId_natureza_cfop_idx" ON "GiamLinhaSegmentoB"("apuracaoId", "natureza", "cfop");

-- CreateIndex
CREATE INDEX "GiamIcmsARecolher_apuracaoId_idx" ON "GiamIcmsARecolher"("apuracaoId");

-- CreateIndex
CREATE INDEX "GiamImportacao_clienteId_importadoEm_idx" ON "GiamImportacao"("clienteId", "importadoEm");

-- CreateIndex
CREATE INDEX "GiamImportacao_clienteId_hashArquivo_idx" ON "GiamImportacao"("clienteId", "hashArquivo");

-- AddForeignKey
ALTER TABLE "Usuario" ADD CONSTRAINT "Usuario_escritorioId_fkey" FOREIGN KEY ("escritorioId") REFERENCES "Escritorio"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Usuario" ADD CONSTRAINT "Usuario_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "Cliente"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Cliente" ADD CONSTRAINT "Cliente_escritorioId_fkey" FOREIGN KEY ("escritorioId") REFERENCES "Escritorio"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Exercicio" ADD CONSTRAINT "Exercicio_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "Cliente"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Relatorio" ADD CONSTRAINT "Relatorio_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "Cliente"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AcessoRelatorio" ADD CONSTRAINT "AcessoRelatorio_relatorioId_fkey" FOREIGN KEY ("relatorioId") REFERENCES "Relatorio"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LogAcesso" ADD CONSTRAINT "LogAcesso_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NcmBase" ADD CONSTRAINT "NcmBase_configuracaoId_fkey" FOREIGN KEY ("configuracaoId") REFERENCES "ConfiguracaoNcm"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VigenciaNcm" ADD CONSTRAINT "VigenciaNcm_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "Cliente"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NcmVigencia" ADD CONSTRAINT "NcmVigencia_vigenciaId_fkey" FOREIGN KEY ("vigenciaId") REFERENCES "VigenciaNcm"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NcmVigencia" ADD CONSTRAINT "NcmVigencia_configuracaoId_fkey" FOREIGN KEY ("configuracaoId") REFERENCES "ConfiguracaoNcm"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EcacPagamento" ADD CONSTRAINT "EcacPagamento_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "Cliente"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EcacDesmembramento" ADD CONSTRAINT "EcacDesmembramento_pagamentoId_fkey" FOREIGN KEY ("pagamentoId") REFERENCES "EcacPagamento"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RazaoLancamento" ADD CONSTRAINT "RazaoLancamento_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "Cliente"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RazaoLancamento" ADD CONSTRAINT "RazaoLancamento_importacaoId_fkey" FOREIGN KEY ("importacaoId") REFERENCES "RazaoImportacao"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RazaoImportacao" ADD CONSTRAINT "RazaoImportacao_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "Cliente"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SpedApuracao" ADD CONSTRAINT "SpedApuracao_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "Cliente"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SpedApuracao" ADD CONSTRAINT "SpedApuracao_importacaoId_fkey" FOREIGN KEY ("importacaoId") REFERENCES "SpedImportacao"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SpedImportacao" ADD CONSTRAINT "SpedImportacao_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "Cliente"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GiamApuracao" ADD CONSTRAINT "GiamApuracao_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "Cliente"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GiamApuracao" ADD CONSTRAINT "GiamApuracao_importacaoId_fkey" FOREIGN KEY ("importacaoId") REFERENCES "GiamImportacao"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GiamSefazApuracao" ADD CONSTRAINT "GiamSefazApuracao_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "Cliente"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GiamSefazApuracao" ADD CONSTRAINT "GiamSefazApuracao_sincronizacaoId_fkey" FOREIGN KEY ("sincronizacaoId") REFERENCES "GiamSefazSincronizacao"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GiamSefazLinhaSegmentoB" ADD CONSTRAINT "GiamSefazLinhaSegmentoB_apuracaoId_fkey" FOREIGN KEY ("apuracaoId") REFERENCES "GiamSefazApuracao"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GiamSefazSincronizacao" ADD CONSTRAINT "GiamSefazSincronizacao_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "Cliente"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GiamLinhaSegmentoB" ADD CONSTRAINT "GiamLinhaSegmentoB_apuracaoId_fkey" FOREIGN KEY ("apuracaoId") REFERENCES "GiamApuracao"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GiamIcmsARecolher" ADD CONSTRAINT "GiamIcmsARecolher_apuracaoId_fkey" FOREIGN KEY ("apuracaoId") REFERENCES "GiamApuracao"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GiamImportacao" ADD CONSTRAINT "GiamImportacao_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "Cliente"("id") ON DELETE CASCADE ON UPDATE CASCADE;
