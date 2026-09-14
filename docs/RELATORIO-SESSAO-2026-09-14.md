# Relatório da sessão — 13 e 14/09/2026

Sessão longa (noite de 13 até a madrugada de 14/09). Cliente-piloto: Casa São
Paulo Calçados Ltda (CNPJ 37.417.896/0001-19).

## Diagnóstico

- **Importação do Balanço/DRE do Domínio** sobrescrevia campos do balanço com a
  DRE, deduzia valores e pegava o ano da linha de emissão (2026). O Higor exigiu
  valores exatamente como impressos.
- **Pastas do cliente** passaram a seguir o modelo do Higor: `C:\PlataformaContabil\<NOME>`
  (sem CNPJ; filial = `NOME - FILIAL 01`), `CONTABIL\<ANO>`, `FISCAL\SPED\<TIPO>\<ANO>`
  (transmitidos), `FISCAL\DOMINIO\<TIPO>\<ANO>`, `FISCAL\DCTF\<ANO>`, `FISCAL\DCTFWEB\<ANO>`.
- **Pasta duplicada** da Casa São Paulo: a causa foi a tarefa agendada
  "March - Varredura Declaracoes Servidor" (march-cofre), que recriava a pasta
  com nome antigo a cada hora. Tarefa **desabilitada** por ordem do Higor.
- **Erro meu registrado:** juntei pastas do robô nas pastas organizadas do Higor
  sem ordem. Regras gravadas: não fazer nada sem ordem; documento estranho →
  mostrar onde está e perguntar.
- **ECF:** faltava Lucro Real (blocos N) e separação SPED transmitido × Domínio;
  retificadora não era tratada ("vale a última entrega").
- **DCTF/DCTFWeb (backlog):** tentativa de baixar pelo e-CAC com a extensão do
  Chrome **não funcionou para lote** (hCaptcha invisível, página congelando a cada
  2–3 cliques, abas de impressão fechando sozinhas). O Higor baixou 2018 e 2019 à
  mão. Ele lembrou que o **ReceitanetBX Serviço** já está configurado
  (march-cofre) e deve ser avaliado antes de qualquer robô novo.
- **Escopo de trabalho:** 2019 a 2026.

## O que ficou pronto

| Área | Entrega |
|---|---|
| Balanço/DRE Domínio | `classificacao.ts`/`heuristic.ts`: DRE fiel ao impresso, ano ignora "Emissão", seção DRE só grava `dre.*`; PL com `resultadoExercicio` |
| Tela de exercícios | Ativo \| Passivo lado a lado com total no cabeçalho de cada grupo, DRE ao lado, `CampoMoeda` com milhar, conferência resultado do PL × DRE (`RESULTADO_PL_DIFERENTE_DRE`) |
| Cadastro | `PastasLocaisFields`: pasta do cliente, Contábil, Fiscal (SPED transmitidos / Domínio + GIAM); 10 campos novos em `Cliente` |
| Leitores de pasta | SPED, obrigações, PIS/COFINS, IRPJ/CSLL, ECD passam a ler as pastas do cadastro |
| ECF | Lucro Real (N030/N630/N670), `fonte` TRANSMITIDO × DOMINIO, `vigente.ts` escolhe a retificadora vigente; varredura por ano com falhas explicadas |
| Telas por ano | IRPJ/CSLL (colunas ECF SPED / ECF Domínio / DCTF), ICMS (SPED+GIAM), PGDAS-D — cada ano mostra só o resultado do próprio ano |
| Tradução do Chrome | `translate="no"` + meta `google: notranslate` (texto congelado no React) |
| Leitores de PDF | `src/lib/dctf-pdf/parseDctfMensalPdf.ts` e `parseReciboDctfWebPdf.ts`, testados com arquivos reais (12/2018 e recibo 12/2024) |
| Verificação | `tsc` sem erro; **186 testes passando** (22 arquivos) |

## Banco / dados

- `prisma db push` aplicado **só no Postgres local**: campos de pastas em `Cliente`,
  `fonte` em `EcfApuracao`/`EcfImportacao` e unique `[clienteId, ano, trimestre, fonte]`
  (4 linhas conferidas sem duplicidade antes do `--accept-data-loss`).
- Exercício 2026 errado da Casa São Paulo apagado no local.
- **Não houve deploy no 220** (credenciais do `.env.remote.used` inválidas).

## Arquivos na pasta da Casa São Paulo (estado ao fechar)

- `FISCAL\DCTF\2018\` e `FISCAL\DCTF\2019\`: 12 PDFs cada, salvos pelo Higor como
  `Impressão da Declaração - MMAAAA.pdf`.
- `FISCAL\DCTFWEB\2024\Recibo Declaracao 122024.pdf`.
- Sobra minha: `C:\Users\higor\Downloads\DCTF_ECAC_022019.html` (pode ir para a lixeira quando o Higor mandar).

## O que ficou faltando

| # | Ação | Quem |
|---|---|---|
| 1 | Avaliar o **ReceitanetBX Serviço** (manual em `C:\Dev\march-cofre\docs\MANUAL-RECEITANETBX-SERVICO.md`) como fonte de DCTF/DCTFWeb/recibos 2019–2026 de todos os clientes | Claude, com ordem do Higor |
| 2 | Varredura de `FISCAL\DCTF` e `FISCAL\DCTFWEB` gravando em `DctfWebDeclaracao` com os leitores novos (aceitar o nome `Impressão da Declaração - MMAAAA.pdf`, com e sem espaço) | Claude |
| 3 | Deploy no 220: código + `prisma db push` + apagar o exercício 2026 errado lá | Higor corrige credenciais do 220; Claude executa |
| 4 | Importador de `.dec` da DCTF antiga ainda copia para a pasta com nome antigo (`dctf-antiga/importarEVarrer.ts`) | Claude |
| 5 | Robô organizador e script de varredura do march-cofre na estrutura nova (tarefa agendada segue desabilitada) | sessões próprias |
| 6 | Conciliação de Impostos lendo razões de `CONTABIL\<ANO>` | Claude |
| 7 | Senha por pasta de cliente para mover/alterar arquivos (definir o que exige senha, quem define, recuperação) | Higor decide |
