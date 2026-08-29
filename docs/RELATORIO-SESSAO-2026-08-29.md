# Relatório de sessão — 29/08/2026

Conciliação de impostos: o razão contábil entrou na plataforma, o PGDAS-D passou
a ser consultado no SERPRO, e dois bugs que produziam número errado na tela
foram encontrados e corrigidos.

---

## Diagnóstico da sessão

### O bug que mostrava receita como imposto

A tela do PGDAS-D exibia **R$ 5.917.354,53** de DAS para a LUPO QUIOSQUE, e o
relatório de Impostos a Pagar, **R$ 4.265.170,96**. Números impossíveis para um
quiosque.

Causa: no layout de declaração usado até 04/2025, o número que o parser capturava
como "total do débito" é a **receita bruta**. Em 10/2019, gravou R$ 45.244,92 de
imposto num mês cujo DAS foi R$ 1.809,80.

A prova veio das guias reais da pasta do cliente: **a soma dos oito tributos bate
ao centavo com o DAS em 14 de 14 competências** (05/2025 a 06/2026). O total
correto do período é **R$ 466.934,18**, não 5,9 milhões.

Conserto: os oito tributos passaram a mandar; o total impresso virou conferência,
e divergência entre eles vira alerta nomeado. O valor antigo não some — vai para
`payloadBruto.totalImpressoDescartado`.

### O e-CAC parado por um campo legado

O print do Higor mostrava "LUPO QUIOSQUE: Certificado próprio não configurado".
Os três clientes têm o `.pfx` cifrado no banco e nenhum tem caminho em disco —
e `src/lib/serpro/sincronizar.ts` exigia justamente o caminho legado. Uma linha
de guarda bloqueava todos os clientes configurados do jeito certo.

Depois do conserto, a sincronização do Higor importou **161 documentos**.

### A pasta que a plataforma não achava

O cadastro procurava `PALMAS_QUIOSQUE_..._34351482000146`, nome derivado da razão
social. A pasta real chama-se `LUPO -  PALMAS QUIOSQUE ...`, com o apelido da
equipe. Resultado: 100 arquivos invisíveis para a plataforma.

Nada de adivinhar por semelhança de nome (foi o que derrubou a vinculação de
plano de contas em 10/08): o cadastro agora tem um seletor com as pastas que
existem em disco.

### O mesmo pagamento contado duas vezes

Ao importar os comprovantes, cada pagamento virou dois registros: o e-CAC devolve
`7202534312242658` e o comprovante imprime `07202534312242658`. Só o zero à
esquerda. Mesma classe de bug apareceu no código de receita do IRRF (`561` × `0561`),
que fazia o IRRF aparecer zerado na tela.

---

## O que ficou pronto

### PGDAS-D consultado no SERPRO

| Camada | Arquivo |
|---|---|
| Chamada (PGDASD · CONSULTIMADECREC14) | `src/lib/serpro/client.ts` |
| Parser da declaração | `src/lib/pgdasd/parseDeclaracaoPdf.ts` |
| Orquestrador com guarda de regime e de período | `src/lib/pgdasd/sincronizar.ts` |
| Tela (menu Fiscal) | `src/app/painel/clientes/[id]/pgdasd/` |
| Banco | `PgdasdDeclaracao`, `PgdasdSincronizacao` |

Valor unificado na frente (o total do DAS), composição por tributo atrás de um
clique. Retificadora sobrescreve a original — o serviço devolve sempre a última
declaração transmitida da competência.

### Leitura da pasta do cliente

- **Guia DAS** (`parseDasPdf.ts`) — 14 guias lidas, validadas contra os arquivos reais.
- **Comprovante de Arrecadação da Receita** (`parseComprovanteArrecadacao.ts`) —
  um PDF traz o ano inteiro, uma página por documento pago, com data de
  arrecadação, banco e composição por código. 161 pagamentos gravados, fundidos
  com os do e-CAC pela chave normalizada.
- Nenhum PDF é copiado ou guardado: leitura em memória, só os valores ficam.

### Razão contábil (novo)

Convenção definida com o Higor: pasta `RAZAO` dentro da pasta do cliente, um
arquivo por tributo (`Razao ICMS`, `Razao INSS`, ...). **O nome do arquivo é o
de-para** — não há tabela de contas para preencher.

O parser lê por coordenadas (o `pdf-parse` embaralha o relatório do Domínio):

| Arquivo | Conta | Lançamentos | Saldo final |
|---|---|---|---|
| Razao SIMPLES NACIONAL.pdf | 2.1.40.101.5 | 176 | R$ 36.351,31 **devedor** |
| RazaoINSS.pdf | 2.1.50.200.1 | 280 | R$ 15.951,18 **devedor** |
| Razao FGTS.pdf | 2.1.50.200.2 | 263 | R$ 12.423,03 **devedor** |
| Razao ICMS.pdf | 2.1.40.100.2 | 888 | R$ 20.742,32 credor |
| Razao ICMS DIFAL.pdf | 2.1.40.102.5 | 56 | — |
| Razao IRRF.pdf | 2.1.40.100.8 | 105 | R$ 1.067,95 credor |

**1.768 lançamentos, e o saldo corrido confere com o saldo impresso em todos —
zero divergência.**

### Conciliação de Impostos (tela nova)

`/painel/conciliacao-estadual` deixou de ser aviso "em construção" e virou o
módulo **Conciliação de Impostos**, por cliente:

- os nove tributos, com o razão que cada empresa tem;
- **tudo que foi pago no e-CAC** por código de receita (R$ 523.202,29 na LUPO),
  incluindo o que não é um dos nove — dívida ativa do Simples (R$ 1.600,18) e
  MAED da DCTFWeb (R$ 221,24), que antes sumiam da tela;
- por tributo: provisionado (crédito) × baixa por pagamento (débito) × pago (guia);
- **a tela mostra só números**; a leitura das divergências é o botão "Relatório
  de divergências" — regra do Higor.

### Achado contábil

O relatório aponta, de forma sistemática nos quatro tributos, o **mesmo pagamento
lançado duas vezes** — um pelo extrato (PIX) e outro pela rotina de impostos:

```
14/01/2025  D 1.048,67  "PAGAMENTO PIX QR CODE DINAMICO ... 14/01"
20/01/2025  D 1.048,67  "PAGAMENTO FGTS 12/2024"
```

É o que explica as contas "a recolher" fechando com saldo **devedor**. A
plataforma aponta como "possível duplicidade" — a conclusão é do contador.

### Regra de domínio registrada

Empresa do Simples **não recolhe PIS, COFINS, IRPJ e CSLL à parte** (estão no
DAS). A tela parou de cobrar razão desses quatro e passou a marcá-los como
"dentro do DAS". Continuam à parte: INSS retido, IRRF, FGTS e o ICMS de
complementação/difal. Em `src/lib/razao/tributos.ts`, com teste, e na memória
`reference_simples_tributos_dentro_do_das`.

---

## O que ficou faltando

| Item | Situação |
|---|---|
| **eSocial** — fonte de pagamento de FGTS (hoje sem nenhuma) e reforço de INSS/IRRF | Decidido que entra na mesma tela. Falta mapear o portal com o Higor logado e escrever o robô (mesmo trilho do robô do Portal Simples: certificado do cliente) |
| **DARE estadual** no confronto do ICMS | O robô da SEFAZ já busca; falta ligar na tela — hoje o ICMS mostra o declarado na GIAM, com asterisco |
| **Acesso nativo no servidor de automação** | Ideia do Higor: deixar o certificado instalado no servidor para o robô autenticar sem humano. A registrar quando o eSocial for construído |
| **Anexo IV do Simples** | Nele a CPP patronal sai do DAS e vira DARF próprio. A regra atual assume Anexo I–III |
| **Verificação visual das telas novas** | Feita por leitura de página no navegador do Higor; nenhuma foi conferida por ele ainda |
| `prisma db push` no servidor 220 | As tabelas novas (`PgdasdDeclaracao`, `PgdasdSincronizacao`, `DasSimplesGuia`, campos `pastaLocal` e `EcacPagamento.origem`) foram aplicadas só no Postgres local |

---

## Números da sessão

- 132 testes passando (eram 105 no início do dia)
- 3 parsers novos validados contra arquivos reais, não contra suposição
- 1 sessão paralela editou `parseDeclaracaoPdf.ts` no meio do caminho; a mudança
  foi mantida e o teste da precedência antiga, reescrito
