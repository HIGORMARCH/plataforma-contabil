# Relatório da sessão — 19, 25 e 27/09/2026

Sessão longa, iniciada em 19/09 e retomada em 25 e 27/09. Cliente-piloto: Casa
São Paulo Calçados Ltda (CNPJ 37.417.896/0001-19).

Pedido de origem: *"um relatório que eu possa imprimir onde demonstre quais as
divergências deste período inteiro"*, na tela Auditoria ICMS — SPED-Fiscal + GIAM.

## Diagnóstico

- **A tela de ICMS mostrava três tabelas e deixava a comparação no olho.** Um ano
  por vez, sem apontar onde os números não batiam.
- **O robô da SEFAZ inventava três campos.** `sefazScraper.ts` gravava zero no
  saldo credor anterior e nas deduções, e CALCULAVA o imposto a recolher como
  débito − crédito. Consequência medida na Casa São Paulo: 57 competências com
  "divergência" de saldo credor e 35 de imposto a recolher que não existiam —
  eram defeito do robô. Quebra direta da regra "importar fiel, nunca adivinhar".
- **A leitura CFOP a CFOP estava morta em produção, em silêncio.** O `pdf-parse`
  embute pdfjs 5.x e pendura o worker dele em `globalThis.pdfjsWorker`; o nosso
  pdfjs 6.x carregava esse worker e morria com "API version does not match Worker
  version". O `catch` do scraper engolia o erro e gravava a GIAM sem as linhas
  por CFOP.
- **O sistema criava uma segunda árvore de pastas por cliente.** `pastaCliente()`
  caía na convenção `<RAZAO>_<CNPJ>` quando o campo `pastaLocal` não vinha no
  `select` do Prisma — e treze pontos do código não traziam o campo. Em 19/09 às
  20:30 e 20:39, a tela de Balanço/Balancete Comparado gravou a ECD de 2018 na
  pasta errada. Causa diferente da de 13/09 (tarefa agendada do march-cofre, já
  desabilitada).
- **`sincronizadoEm` nunca era atualizado numa regravação** — `@default(now())`
  só vale na criação. A competência relida continuava com a data da primeira
  leitura.
- **O Higor reestruturou as pastas do cliente durante a sessão** (novo modelo
  `Declaraçoes` × `Dominio`), tornando o modelo de 13/09 obsoleto.

## O que ficou pronto

| Área | Entrega |
|---|---|
| Relatório de ICMS do período | `/painel/clientes/<id>/sped/relatorio` — resumo, mapa ano × mês, compras e vendas por ano, divergências por campo, detalhe por competência, declarações não localizadas e nota de critério. A4 paisagem com papel timbrado e coluna "Conferido" |
| Motor do confronto | `src/lib/icms/divergenciasPeriodo.ts` — diverge quando maior − menor > R$ 0,01 entre as fontes que TÊM o valor; fonte ausente vira "falta", não divergência; GIAM usa a última retificação |
| Totais por ano | Compras e vendas somadas por fonte, com o número de meses ao lado; a coluna Dif. só é calculada quando as fontes cobrem os mesmos meses |
| Robô da SEFAZ lendo a apuração | `extrairApuracaoEspelhoPdfjs` lê os itens 5.1, 6.1, 6.4 (saldo credor), 7.2 (deduções) e 7.3 (imposto a recolher); sem o layout esperado, o mês FALHA em vez de gravar número chutado |
| Leitura CFOP a CFOP | Worker do pdfjs fixado na nossa versão + cópia do buffer a cada leitura. Ago/2021 voltou a trazer 10 linhas |
| Carimbo de sincronização | `sincronizadoEm` gravado explicitamente na regravação — é o que o relatório usa para saber se a apuração veio do robô novo |
| Fim da pasta inventada | `pastaLocal` obrigatório no tipo `ClienteRef`; `pastaCliente()` erra de propósito sem ele; `pastaClienteOuNull()` para exibição; a opção "usar a convenção" saiu do cadastro |
| Verificação | `tsc` sem erro; **186 testes passando (22 arquivos)** |

## Números da Casa São Paulo (2019–2026)

Efeito da correção do robô, medido no banco:

| Campo | Antes | Depois |
|---|---|---|
| Saldo credor anterior | 57 competências divergentes | 21 |
| ICMS a recolher | 35 | 5 |

A queda vem de eliminar o alarme falso; o que sobrou é real. Estado final: 62
competências com divergência, 20 conferindo, 10 sem declaração localizada.

**Achado material:** de 06/2024 em diante a GIAM da SEFAZ acumula um saldo credor
que a escrituração não tem — R$ 224.907,63 em 06/2024 chegando a R$ 676.337,97 em
11/2025. A causa aparece nas mesmas competências: em 05, 06, 08, 09 e 12/2024 (e
em 07/2020) a GIAM recepcionada declara débito de saídas quase nulo (R$ 1.765,39
em 08/2024, contra R$ 139.324,01 no SPED). Saída não declarada vira crédito
sobrando, que rola para os meses seguintes. De 09/2025 em diante a GIAM diz que
não há ICMS a recolher enquanto o SPED apura imposto a pagar.

## Banco / dados

- **Nenhuma mudança de schema.** Sem `prisma db push`, sem `generate`.
- **84 competências de GIAM SEFAZ regravadas** (2019 a 2025), em três passadas:
  a primeira com os campos novos, a segunda para gravar o `sincronizadoEm`, a
  terceira a pedido do Higor. 05/2024 entrou como competência nova. 2026 não tem
  nenhuma GIAM no portal.
- Nada foi apagado do banco.

## Pastas (só a Casa São Paulo — ordem do Higor)

| Ação | Destino |
|---|---|
| Pasta duplicada `CASA_SAO_PAULO_CALCADOS_LTDA_37417896000119` (2 arquivos, cópia idêntica por SHA-256) | `_QUARENTENA\CASA SAO PAULO - pasta duplicada com CNPJ (19-09-2026)`, com `_POR-QUE-ESTA-AQUI.md` |
| SPED do Domínio que estava em `CONTABIL\2018` | `_QUARENTENA\CASA SAO PAULO - duplicatas (19-09-2026)` |
| ECD de 2023 guardada em `ECD\2019` | `FISCAL\SPED\ECD\2023` |
| Notas do que precisa de decisão | `OBSERVAÇÃO\_A CONFERIR.md` na pasta do cliente |

Nada foi apagado. **Nenhum outro cliente foi tocado** — ordem expressa do Higor:
a Casa São Paulo é o piloto.

### Modelo de pastas novo (definido pelo Higor em 19/09)

```
C:\PlataformaContabil\<NOME DO CLIENTE>\
├── Declaraçoes\{DCTF,DCTFWEB,ECD,ECF,EFD_CONTRIBUICOES,EFD_ICMS_IPI}\<ANO>\
├── Dominio\
│   ├── Contabil\{Balancete,DRE,ECD,Razao}\<ANO>\
│   └── Fiscal\{DCTF,DCTFWEB,ECF,EFD_CONTRIBUICOES,EFD_ICMS_IPI,Giam}\<ANO>\
└── OBSERVAÇÃO\
```

A divisão de primeiro nível deixou de ser CONTABIL/FISCAL e passou a ser
**Declaraçoes (transmitido) × Dominio (gerado)**. O cadastro da Casa São Paulo já
foi reapontado pelo Higor: 12 dos 13 campos estão corretos.

## O que ficou faltando

| # | Ação | Quem |
|---|---|---|
| 1 | `pastaContabil` da Casa São Paulo aponta para `CONTABIL`, que não existe mais — apontar para `Dominio\Contabil` | Claude, quando liberado |
| 2 | `Dominio\Fiscal\Giam` contém as DCTF em PDF; as GIAM `.r1` do Domínio não estão no disco | Higor |
| 3 | `Dominio\Contabil\ECD` vazia — o Higor disse que vai colocar | Higor |
| 4 | Reapontar `destino.ts` e `pastaTipoAno` para o modelo novo (o código ainda grava no de 13/09) | Claude |
| 5 | Conferir o relatório na impressão (Ctrl+P) | Higor |
| 6 | Decidir sobre as seis GIAM quase vazias de 2024 e sobre 03/2024 (R$ 12,1 milhões) | Higor |
| 7 | Migração dos demais clientes — PARADA até a Casa São Paulo fechar; faltam 4 decisões (RECIBOS, GUIAS, OUTROS, GIAM em PDF) | Higor |
| 8 | Deploy no 220 — herança das sessões anteriores, credenciais inválidas | Higor |

Lista completa em `.claude/pendencias.md`, seção "Abertas em 27/09/2026".
