# Relatório da sessão — 02/09/2026

Organizador de documentos: da quarentena com 953 arquivos até a estrutura de
três pastas por cliente.

## Diagnóstico — o que a sessão descobriu

A quarentena não era um depósito de documentos estranhos. Ela era o sintoma de
**erros de identificação** que também já tinham arquivado documento no lugar
errado. Cada arquivo aberto revelou um:

| erro | consequência real |
|---|---|
| `/CONTRIBUI/` casava com "Contribuinte", palavra de todo recibo | 182 recibos do SPED-Fiscal arquivados como "SPED CONTRIBUIÇÃO" |
| CNPJ do SPED vinha de varredura, não da posição no `\|0000\|` | 46 SPED na empresa errada — um deles criou a pasta de uma transportadora |
| Competência da folha lida da versão do programa | RE do 13º de 2019 arquivado em 12/2017 |
| GIAM procurada por CNPJ | Ela não tem CNPJ; identifica-se pela inscrição estadual |
| `.REC` fora da lista de extensões | 357 recibos de transmissão invisíveis ao robô |
| `DECLARACOES\` paralela à árvore padronizada | 802 arquivos em dobro |
| Janela deslizante de CNPJ em `.dec` | Cinco CNPJ "válidos" num arquivo, nenhum o titular |

Detalhe de cada uma em `reference_armadilhas_identificacao_documento`.

## O que ficou pronto

**Quarentena zerada.** De 953 para 0. A pasta `_QUARENTENA` não existe mais.

**25 tipos de documento reconhecidos** (eram 15). Novos: GPS, GRF/FGTS,
GFIP/SEFIP, comprovante de GFIP, notificação de multa, DARE, DEFIS, livro
fiscal, termo de credenciamento, demonstrativo do ICMS, dossiê do e-CAC,
apuração do IPI e recibo `.REC`.

**Estrutura de três pastas por cliente** (decisão do Higor):

```
DECLARAÇÕES\   o que foi declarado (SPED, GIAM, DCTF, DEFIS, PGDAS-D, GFIP)
GUIAS\         o que foi pago (DAS, DARE, GPS, GRF, comprovantes)
RAZÃO\         os razões que a conciliação compara
OUTROS\        balanço, processo, notificação, termo
OBSERVAÇÃO\    _A CONFERIR.md — o que precisa de olho humano
```

1.236 arquivos em DECLARAÇÕES, 57 em GUIAS, 142 em OUTROS.

**Regra "guarda os dois".** Conteúdo diferente disputando o mesmo nome não vai
mais para quarentena: o segundo entra com sufixo ` -2` e a divergência é escrita
na pasta OBSERVAÇÃO da empresa. Nasceu de um caso concreto — duas GPS de 03/2019
da New Office com R$ 910,53 e R$ 899,84.

**Conferência da apuração do ICMS** (tela do Organizador). Para quem apura fora
do Domínio, o fechamento do inventário do mês é o que libera a apuração — a tela
acusa a competência que tem apuração e não tem inventário.

**Correções em massa aplicadas:** 166 recibos renomeados, 46 SPED realocados, 18
documentos de folha com competência corrigida, 3 pastas de empresa duplicadas
fundidas (54 arquivos), 802 duplicados de `DECLARACOES` e 796 da árvore antiga
removidos — todos com SHA-256 provando identidade.

## O que ficou faltando

**Migração incompleta em 39 arquivos.** Ficaram na árvore antiga porque o robô
não os reconhece: PDFs digitalizados (precisam de OCR), PDFs de 0 byte, e três
arquivos com extensão `.pdf` que na verdade são objeto serializado de Java
(corrompidos na origem).

**Pastas antigas ainda com conteúdo:** `DECLARACOES` (38), `FISCAL` (49). São os
39 acima mais os que colidiram. Rodar `scripts/migrar-para-tres-pastas.mjs`
depois de resolver cada caso.

**A pasta `Imagens` na raiz não é cliente.** Tem `Screenshots`, `AnyDesk`,
`Camera Roll`, `logs` — é pasta de usuário que caiu em `C:\PlataformaContabil`.
Decidir se sai da raiz.

**Um `.pfx` solto na raiz** com a dica da senha no nome do arquivo. Não abri.
Deve sair de uma pasta que o robô varre.

**80 arquivos com sufixo ` -N`** aguardando decisão: são documentos distintos da
mesma competência (retificação, recálculo ou reimpressão). Cada um está anotado
na `OBSERVAÇÃO` da empresa.

## Onde retomar

Amanhã: painel de obrigações varrendo `GUIAS\` para dizer de quais clientes o
comprovante já está na pasta. É exatamente para isso que a estrutura foi criada.

## Scripts criados (todos com simulação por padrão)

| script | o que faz |
|---|---|
| `migrar-para-tres-pastas.mjs` | reclassifica e recoloca na estrutura nova |
| `corrigir-sped-na-empresa-errada.mjs` | SPED cujo CNPJ do titular não bate com a pasta |
| `corrigir-competencia-folha.mjs` | folha com competência lida da versão do programa |
| `fundir-pastas-duplicadas.mjs` | duas pastas para o mesmo CNPJ |
| `limpar-declaracoes-duplicadas.mjs` | árvore `DECLARACOES` paralela |
| `limpar-quarentena.mjs` | cópias idênticas e pastas vazias |
| `limpar-copias-numeradas.mjs` | irmãos ` -N` repetidos |
