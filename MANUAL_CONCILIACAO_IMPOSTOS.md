# Manual da Conciliação de Impostos — Plataforma Contábil

> Última atualização: 29/08/2026 (razão do Domínio, comprovantes da Receita,
> PGDAS-D via SERPRO)
> Módulos: `src/lib/razao/`, `src/lib/pgdasd/`, `src/lib/serpro/`

Este manual descreve o módulo de conciliação de impostos: o que cada tela faz,
de onde vem cada número, quais regras a plataforma aplica sozinha, por que ela
recusa um confronto, e o que fazer em cada caso.

---

## 1. Em uma frase

**Conciliar imposto é provar que o que a contabilidade registrou é o que foi
declarado e o que foi pago.** Três documentos, um número: se os três não
convergem, ou a apuração está errada, ou a contabilidade não reflete a apuração,
ou o pagamento não aconteceu como se pensa.

---

## 2. Os três lados do confronto

| Lado | O que é | De onde vem |
|---|---|---|
| **Apurado** | O que a declaração diz que é devido na competência | PGDAS-D (SERPRO), GIAM, DCTFWeb, SPED, ECF |
| **Contabilizado** | O que o razão da conta "a recolher" registra | PDF do razão do Domínio, na pasta `RAZAO` do cliente |
| **Pago** | O documento de arrecadação efetivamente quitado | Comprovante da Receita (pasta) e e-CAC (SERPRO) |

No razão, **o crédito é a apuração da competência** e **o débito é a baixa** —
é o débito que se compara com o comprovante.

---

## 3. As telas, e quando usar cada uma

| Menu | Tela | Para quê |
|---|---|---|
| Contábil → **Conciliação de Impostos** | razão × pago, por tributo | O confronto: os nove tributos, competência a competência |
| Fiscal → **PGDAS-D (Simples Nacional)** | declaração do Simples | Consultar a declaração no SERPRO e ver o total do DAS por competência |
| Contábil → **Impostos a Pagar** | o que as declarações apontam | O lado "declaração" isolado, sem contabilidade |
| Cadastros → Clientes → **Editar** | pasta do cliente | Apontar a pasta real e criar a pasta `RAZAO` |

---

## 4. Preparar o cliente — uma vez só

1. **Apontar a pasta.** No cadastro do cliente, seção *Pasta do cliente (fonte
   única)*, escolha na lista a pasta que existe em `C:\PlataformaContabil`. As
   pastas foram criadas à mão, com o apelido da equipe ("LUPO - PALMAS QUIOSQUE
   ..."), e o nome que a plataforma compõe sozinha (razão social + CNPJ) **não
   existe em disco**. Sem isso, nenhum arquivo é encontrado.
2. **Salvar.** A pasta `RAZAO` é criada nesse momento, dentro da pasta do cliente.
3. **Colocar os razões** na pasta `RAZAO`, um PDF por tributo.

> A plataforma nunca copia, move nem altera arquivo do cliente. Ela lê e
> descarta — só os valores ficam no banco.

---

## 5. O nome do arquivo é o de-para

Dentro de `RAZAO`, o nome diz o tributo. Não há tabela de contas para preencher.

```
RAZAO\
  Razao simples nacional.pdf
  Razao INSS.pdf
  Razao FGTS.pdf
  Razao IRRF.pdf
  Razao ICMS.pdf
  Razao Pis.pdf
  Razao Cofins.pdf
  Razao Irpj.pdf
  Razao Csll.pdf
```

Regras do reconhecimento (`src/lib/razao/tributos.ts`):

- acento, caixa e extensão não importam: `RAZÃO ICMS.pdf` = `razao_icms.pdf`;
- nome colado funciona: `RazaoINSS.pdf`;
- **nome ambíguo é recusado**: `Razao PIS e COFINS.pdf` não entra em nenhum dos
  dois. Separe em dois arquivos — escolher um seria adivinhar, e a metade que
  sobrasse iria para o tributo errado;
- **mais de um razão por tributo é aceito**: a LUPO tem `Razao ICMS.pdf` e
  `Razao ICMS DIFAL.pdf`, contas diferentes, ambas exibidas.

**Cada empresa entra com os razões que tem.** Tributo sem arquivo não é falha.

---

## 6. Empresa do Simples: quatro tributos não existem à parte

IRPJ, CSLL, PIS e COFINS estão **dentro do DAS**. Para cliente do Simples, a tela
marca os quatro como "dentro do DAS" em cinza, e não cobra razão nem guia.

Continuam à parte, e por isso continuam cobrados:

| Tributo | Por quê |
|---|---|
| INSS | O DAS traz a cota patronal; a **retenção do empregado** é DARF próprio (código 1082) |
| IRRF | Retenção da folha (código 0561) |
| FGTS | Não é tributo do DAS |
| ICMS | O do DAS é sobre a receita; **complementação de alíquota e difal** vão em DARE estadual |

> Exceção conhecida: no **Anexo IV** a CPP patronal também sai do DAS e vira
> DARF. A regra atual assume Anexo I–III.

---

## 7. O fluxo do mês, na ordem

1. **Sincronizar o e-CAC** (Auditoria Tributária → Sincronizar). Traz os
   documentos pagos — DAS, DARF — com data de arrecadação.
2. **Varrer a pasta do cliente** (tela do PGDAS-D → *Varrer pasta do cliente*).
   Lê as guias do DAS e os *Comprovantes de Arrecadação* da Receita. Custo zero:
   é arquivo local.
3. **Consultar o PGDAS-D no SERPRO**, se quiser o lado declarado do Simples.
   **Cada competência é uma chamada paga** — o botão diz quantas serão.
4. **Abrir a Conciliação de Impostos** e conferir os números.
5. **Pedir o relatório de divergências** quando quiser a leitura.

---

## 8. As regras que a plataforma aplica sozinha

Todas em `src/lib/razao/conciliar.ts` e `src/lib/pgdasd/`.

### 8.1 O valor do DAS são os oito tributos, não o total impresso

No layout de declaração usado até 04/2025, o número que o extrator captura como
"total" é a **receita bruta**. A plataforma soma os oito tributos e usa essa
soma; o total impresso vira conferência, e a divergência vira alerta nomeado.

> Conferido contra 14 guias reais: a soma bate ao centavo em todas.

### 8.2 Baixa é débito com contrapartida — compensação não é

O Domínio imprime a linha do pagamento **sem histórico** em boa parte do período.
O que sempre aparece é a conta de contrapartida: débito da conta "a recolher"
contra banco é dinheiro saindo.

Ficam de fora: histórico com *compensação*, *estorno* ou *transferência*.

### 8.3 Competência sem histórico é assumida como o mês anterior

INSS, DAS, IRRF e FGTS vencem no mês seguinte à competência. Quando o histórico
não diz, a plataforma assume o mês anterior ao lançamento — e **conta quantas
vezes assumiu**, no relatório de divergências.

### 8.4 Documento com composição é contado pelas linhas dela

O DARF numerado da DCTFWeb (código 1410) carrega INSS e IRRF dentro. Contar o
documento e as linhas somaria o mesmo dinheiro duas vezes.

### 8.5 Zero à esquerda não cria dois registros

O e-CAC devolve `7202534312242658`; o comprovante imprime `07202534312242658`.
O mesmo pagamento. Igual em código de receita: `561` do e-CAC é o `0561` do
comprovante. A plataforma normaliza os dois antes de comparar.

---

## 9. O que a plataforma aponta, e o que ela não decide

Ela **aponta**:

- competência em que razão e pagamento não fecham;
- conta "a recolher" com **saldo devedor** — sinal de pagamento a mais ou
  provisão a menos;
- **possível pagamento em duplicidade**: mesmo valor debitado duas vezes em até
  45 dias;
- total impresso na declaração que não confere com a soma dos tributos;
- pagamento do e-CAC que não pertence a nenhum dos nove tributos (dívida ativa,
  MAED) — em seção própria, para não sumir da tela.

Ela **não decide**: nenhum valor é ajustado, nenhum lançamento é criado, nenhuma
declaração é retificada. A conclusão é do contador.

---

## 10. A tela mostra números; o relatório mostra divergência

A Conciliação de Impostos exibe, por competência: provisionado (crédito), baixa
por pagamento (débito) e pago (guia). Só isso.

O botão **Relatório de divergências** acrescenta a coluna de diferença, filtra as
competências que não fecham e lista os alertas do tributo.

---

## 11. O que ainda não tem fonte

| Tributo | Falta |
|---|---|
| **FGTS** | Nenhuma fonte de pagamento. Não passa pelo e-CAC (é GRF / FGTS Digital). Caminho decidido: eSocial |
| **ICMS** | O pagamento é DARE estadual. Hoje a tela mostra o **declarado na GIAM**, com asterisco |

---

## 12. Quando algo não aparece na tela

| Sintoma | Causa provável | O que fazer |
|---|---|---|
| "Pasta ainda não existe" no cadastro | Pasta não apontada | Escolher a pasta na lista, salvar |
| Tributo com "sem arquivo" | Razão não está em `RAZAO`, ou o nome não diz o tributo | Conferir o nome do arquivo (seção 5) |
| Tributo em cinza, "dentro do DAS" | Cliente do Simples — correto | Nada a fazer |
| Coluna "Pago" vazia no FGTS ou ICMS | Não há fonte de pagamento (seção 11) | Nada a fazer hoje |
| "Baixa por pagamento" vazia num mês | O razão não tem baixa naquela competência | Conferir se o pagamento foi lançado |
| Varredura acha 0 PDFs | Pasta apontada errada, ou os PDFs estão em outra subpasta | A varredura olha `FISCAL\IMPOSTOS\SIMPLES NACIONAL` |

---

## 13. Onde cada coisa vive

```
src/lib/pgdasd/
  parseDeclaracaoPdf.ts          declaração do PGDAS-D (SERPRO)
  parseDasPdf.ts                 guia do DAS (pasta do cliente)
  parseComprovanteArrecadacao.ts comprovante da Receita (pasta do cliente)
  sincronizar.ts                 consulta paga ao SERPRO, com guardas
  varrerPastaSimples.ts          leitura da pasta, sem custo

src/lib/razao/
  tributos.ts                    os nove tributos, de-para e códigos de receita
  parseRazaoPdf.ts               razão do Domínio, por coordenadas
  varrerPastaRazao.ts            inventário da pasta RAZAO
  conciliar.ts                   o confronto
  pagamentosEcac.ts              tudo que foi pago, por código
```

---

## 14. Duas coisas que custaram caro, para não repetir

1. **Layout de PDF não se adivinha.** O parser do PGDAS-D foi escrito a partir de
   uma descrição e trocou receita bruta por imposto — a tela chegou a mostrar
   R$ 5,9 milhões de DAS num quiosque. Todo parser desta pasta hoje é validado
   contra arquivo real antes de valer.
2. **Campo legado bloqueia cliente configurado certo.** O e-CAC exigia o caminho
   do `.pfx` em disco quando o certificado já vivia cifrado no banco: todos os
   clientes falhavam com "Certificado próprio não configurado".
