# Manual da Pasta do Cliente — Plataforma Contábil

> Última atualização: 13/09/2026 (importar Balanço e DRE do Domínio, um de cada vez)
> Todas as pastas ficam em `C:\PlataformaContabil\`

Este manual é para quem organiza os arquivos dos clientes. Ele diz onde guardar
cada documento, como nomear o que precisa de nome, o que a plataforma faz
sozinha e o que ela nunca faz — e o que conferir quando alguma coisa não
aparece na tela.

Não é preciso saber nada de sistema para seguir este manual.

---

## 1. Em uma frase

**A plataforma lê a pasta do cliente; ela não arruma a sua pasta.** Nenhum
arquivo seu é movido, renomeado ou apagado — mas o que estiver no lugar errado,
ou com nome que não diz o que é, simplesmente não é encontrado.

---

## 2. Uma pasta por cliente, com o nome que você quiser

Cada cliente tem uma pasta dentro de `C:\PlataformaContabil\`. **O nome é
livre** — use o apelido que a equipe usa no dia a dia:

```
C:\PlataformaContabil\LUPO -  PALMAS QUIOSQUE COMERCIO DE ACESSORIOS E VESTUARIO LTDA\
```

O que amarra a pasta ao cliente não é o nome: é o cadastro.

> **Passo obrigatório.** Cadastros → Clientes → *Editar* → seção **Pasta do
> cliente (fonte única)** → escolher a pasta na lista → **Salvar**.
>
> Sem isso, a plataforma procura por um nome que ela mesma compõe (razão social
> + CNPJ, tipo `PALMAS_QUIOSQUE_..._34351482000146`), que quase nunca existe em
> disco — e o cliente aparece com "pasta ainda não criada", com todos os
> arquivos invisíveis.

Ao salvar, a pasta `RAZAO` é criada automaticamente dentro da pasta do cliente.

---

## 3. A árvore

```
<PASTA DO CLIENTE>\
│
├── RAZAO\                                  ← VOCÊ põe: razão por tributo
│
├── FISCAL\
│   ├── IMPOSTOS\
│   │   ├── SIMPLES NACIONAL\<ANO>\         ← VOCÊ põe: guias do DAS e comprovantes
│   │   ├── GIAM\<ANO>\                     ← VOCÊ põe: espelhos e comprovantes da GIAM
│   │   └── ICMS\<ANO>\
│   ├── DECLARAÇÕES\                        ← VOCÊ põe: SPEDs, DCTF, ECF transmitidos
│   │   ├── SPED CONTÁBIL\   SPED FISCAL\
│   │   ├── SPED CONTRIBUIÇÕES\   ECF\   DCTF\
│   └── DOCUMENTOS FISCAIS\<ANO>\<MM.ANO>\  ← VOCÊ põe: XMLs e zips de notas
│
├── SPED-ECD\<ANO>\<ANO>.txt                ← A PLATAFORMA cria
├── SPED-ECD-DOMINIO\<ANO>\<ANO>.txt        ← A PLATAFORMA cria
├── SPED-ECF\<ANO>\<ANO>.txt                ← A PLATAFORMA cria
├── SPED-FISCAL\<ANO>\<MM>.txt              ← A PLATAFORMA cria
├── SPED-CONTRIBUICOES\<ANO>\<MM>.txt       ← A PLATAFORMA cria
├── DCTF-ANTIGA\<ANO>\<MM>.dec              ← A PLATAFORMA cria
├── DCTFWEB\<ANO>\<MM>.xml                  ← A PLATAFORMA cria
├── BALANCOS-DOMINIO\<ANO>\balanco.pdf      ← A PLATAFORMA cria
└── DEFIS\<ANO>\<ANO>.xml                   ← A PLATAFORMA cria
```

As pastas em MAIÚSCULO-COM-HÍFEN são **cópias padronizadas** que a plataforma
grava quando você importa um arquivo pela tela ou quando ela mesma baixa algo do
SERPRO. **Não monte essas pastas à mão** — e não apague o original de onde ele
está.

---

## 4. Onde o nome do arquivo manda

Em quase tudo, a plataforma **abre o arquivo e descobre o que ele é**: o SPED
pelo registro `|0000|`, a GIAM pela inscrição estadual escrita dentro, o PDF do
Simples pela frase do cabeçalho. Nome bonito não ajuda e nome feio não atrapalha.

**A exceção é a pasta `RAZAO`.** Ali o nome é o de-para: é ele que diz qual
tributo aquele razão representa.

| Onde | Nome importa? |
|---|---|
| `RAZAO\` | **Sim** |
| `FISCAL\IMPOSTOS\SIMPLES NACIONAL\` | Não |
| `FISCAL\DECLARAÇÕES\` | Não |
| `FISCAL\IMPOSTOS\GIAM\` | Não |
| Pastas criadas pela plataforma | Sim — mas quem nomeia é ela |

---

## 5. A pasta RAZAO

Um PDF por tributo, exportado do Domínio (razão da conta "a recolher").

```
RAZAO\
  Razao simples nacional.pdf
  Razao INSS.pdf
  Razao FGTS.pdf
  Razao IRRF.pdf
  Razao ICMS.pdf
  Razao ICMS DIFAL.pdf
```

**Como nomear:**

| Situação | Exemplo | Resultado |
|---|---|---|
| Com espaço | `Razao ICMS.pdf` | ✔ |
| Colado | `RazaoINSS.pdf` | ✔ |
| Com acento e maiúscula | `RAZÃO IRRF.pdf` | ✔ |
| Com ano no nome | `Razao ICMS 2025.pdf` | ✔ |
| Duas contas do mesmo tributo | `Razao ICMS.pdf` + `Razao ICMS DIFAL.pdf` | ✔ — viram duas linhas |
| Dois tributos no mesmo arquivo | `Razao PIS e COFINS.pdf` | ✘ — **recusado** |
| Sem dizer o tributo | `Razao.pdf`, `razao2025.pdf` | ✘ — **recusado** |

> Arquivo com dois tributos é recusado de propósito: escolher um seria adivinhar,
> e a metade que sobrasse entraria no tributo errado. Exporte separado.

**Cada empresa põe só os razões que tem.** Tributo sem arquivo não é pendência —
a tela mostra "sem arquivo" e segue.

**Empresa do Simples não deve ter** `Razao Pis`, `Razao Cofins`, `Razao Irpj` nem
`Razao Csll`: esses tributos estão dentro do DAS. A tela já os marca como "dentro
do DAS", em cinza.

---

## 6. A pasta do Simples Nacional

`FISCAL\IMPOSTOS\SIMPLES NACIONAL\<ANO>\`

Dois documentos diferentes moram aqui, e a plataforma separa um do outro pelo
conteúdo — pode largar os dois na mesma pasta:

| Documento | Como costuma vir do portal | Serve para |
|---|---|---|
| **Guia do DAS** | `PGDASD-DAS-12.2025.pdf` | O valor cobrado: vencimento e composição por tributo |
| **Comprovante de Arrecadação** | `PAGAMENTO 2025.pdf` — o ano inteiro num PDF só | A prova do pagamento: data de arrecadação, banco e agência |

> O comprovante vale mais que a guia: é ele que prova que o dinheiro saiu, e ele
> traz também os DARF da folha (INSS dos segurados e IRRF), não só o DAS.

---

## 7. Onde ponho cada documento

| Tenho este documento | Ponho em | Quem usa |
|---|---|---|
| Razão de uma conta de imposto (PDF do Domínio) | `RAZAO\` | Conciliação de Impostos |
| Guia do DAS | `FISCAL\IMPOSTOS\SIMPLES NACIONAL\<ANO>\` | PGDAS-D · Conciliação |
| Comprovante de Arrecadação da Receita | `FISCAL\IMPOSTOS\SIMPLES NACIONAL\<ANO>\` | PGDAS-D · Conciliação |
| Espelho ou comprovante da GIAM | `FISCAL\IMPOSTOS\GIAM\<ANO>\` | Auditoria de ICMS |
| SPED-Fiscal, SPED-Contribuições, ECD, ECF (o `.txt` transmitido) | `FISCAL\DECLARAÇÕES\<tipo>\` | Auditoria · Balanço · Balancete |
| Balanço e DRE do Domínio (PDF) | Subir pela tela do exercício, **um de cada vez** (seção 7.1) | Conciliação Domínio × ECD |
| XML e zip de notas | `FISCAL\DOCUMENTOS FISCAIS\<ANO>\<MM.ANO>\` | Tributação NCM |

### 7.1 Balanço e DRE do Domínio: um PDF de cada vez

Tela: cliente → **Exercícios** → quadro *Extrair de PDF (Balanço / DRE)*.

**Balanço e DRE entram separados, um depois do outro.** Nunca os dois no mesmo
PDF, nunca os dois selecionados juntos. A plataforma lê um arquivo por vez e
descobre pelo conteúdo se é o Balanço ou a DRE; cada um preenche só a sua parte
do formulário.

**Passo a passo:**

1. Digite o **ano do exercício** no formulário.
2. Suba o PDF do **Balanço** exportado do Domínio.
3. Confira no lado do balanço:
   - o total do **ATIVO** e do **PASSIVO** é o mesmo que o Domínio imprime;
   - a linha **Ativo = Passivo + PL** está verde.
4. Suba o PDF da **D.R.E.** Ela preenche só os campos da DRE; o balanço continua
   como estava.
5. Confira a linha **Resultado da DRE transferido para o PL** verde. O resultado
   do exercício que está no Patrimônio Líquido tem que ser o mesmo da DRE.
6. Clique em **Salvar exercício**.

Nada é gravado antes do passo 6. Se algo não bater, corrija na tela ou suba o PDF
de novo.

**Avisos da tela:**

| Aviso | O que significa | O que fazer |
|---|---|---|
| "Este PDF é do exercício X, mas o formulário está em Y" (amarelo) | O PDF é de outro ano. O ano do formulário **não** foi trocado | Conferir se subiu o documento certo |
| "Ativo diferente de Passivo + PL" (vermelho) | Os campos do balanço não fecham | Conferir o Balanço contra o PDF |
| "Resultado no PL diferente da DRE" (vermelho) | O resultado do exercício no PL não é o da DRE: não foi transferido, ou Balanço e DRE são de versões diferentes | Reexportar os dois do Domínio no mesmo momento e subir de novo |

---

## 8. Preparar um cliente novo — passo a passo

1. Criar a pasta do cliente em `C:\PlataformaContabil\` (nome livre).
2. Copiar para dentro dela a árvore `FISCAL\` que já existe no servidor.
3. No cadastro do cliente, apontar a pasta e **salvar** (a `RAZAO` nasce aqui).
4. Exportar do Domínio o razão de cada tributo que a empresa recolhe e salvar em
   `RAZAO\` com o nome do tributo.
5. Tela do **PGDAS-D** → *Varrer pasta do cliente*. Custo zero, é arquivo local.
6. **Auditoria Tributária** → sincronizar o e-CAC.
7. Abrir a **Conciliação de Impostos** e conferir.

---

## 9. A rotina do mês

| Quando | O que atualizar |
|---|---|
| Fechado o mês | Novas guias e comprovantes na pasta do Simples Nacional |
| Fechado o mês | Rodar *Varrer pasta do cliente* e sincronizar o e-CAC |
| Fechada a contabilidade do mês | Reexportar do Domínio os razões da pasta `RAZAO` (substituindo os antigos) |
| Ao transmitir SPED | Guardar o `.txt` em `FISCAL\DECLARAÇÕES\` |

> Reexportar o razão inteiro é melhor que exportar mês a mês: a plataforma lê o
> arquivo todo e recalcula. Um arquivo por tributo, sempre o mais recente.

---

## 10. O que a plataforma faz e não faz com seus arquivos

**Faz:**
- lê o arquivo, extrai os valores e descarta o conteúdo — só dado no banco;
- cria a pasta `RAZAO` quando você salva o cadastro;
- grava cópia padronizada do que ela baixou (SERPRO, e-CAC) ou do que você subiu.

**Não faz:**
- não move, não renomeia, não apaga arquivo seu;
- não escreve em servidor de terceiro (Z:\, ReceitanetBX, Domínio) — trabalha
  sempre na cópia local;
- não guarda o PDF nem o SPED: o binário morre no fim da leitura.

---

## 11. Os campos de pasta no cadastro

| Campo | Para quê |
|---|---|
| **Pasta do cliente** | A pasta na fonte única. É o campo que vale daqui pra frente — conciliação, razão, PGDAS-D e as cópias padronizadas |
| **Pasta da ECD** | Ex.: `DECLARACOES\SPED\ECD`. Conciliação Domínio × ECD e Obrigações Acessórias |
| **Pasta da ECF** | Ex.: `DECLARACOES\SPED\ECF`. IRPJ/CSLL e Obrigações Acessórias |
| **Pasta da EFD-Contribuições** | Ex.: `DECLARACOES\SPED\EFD_CONTRIBUICOES`. PIS/COFINS e Obrigações Acessórias |
| **Pasta da EFD ICMS/IPI** | Ex.: `DECLARACOES\SPED\EFD_ICMS_IPI`. SPED-Fiscal × GIAM do Domínio × GIAM do portal |
| **Pasta geral dos SPEDs** | Opcional. Só é usada quando a pasta do tipo está vazia |
| **Pasta da GIAM** | Pasta onde o Domínio salva a GIAM; a plataforma filtra pela inscrição estadual |

Uma pasta por tipo de SPED deixa claro, para quem mexe nas pastas, onde cada
arquivo vai. Mesmo assim a plataforma confere o conteúdo: arquivo de outro tipo
ou de outro CNPJ é ignorado, não importado errado.

> **ECD:** não renomeie o `.txt`. A conciliação acha o arquivo pelo período no
> nome (`AAAA0101-AAAA1231`), como vem do ReceitanetBX.

---

## 12. Quando algo não aparece

| Sintoma | Causa provável | O que fazer |
|---|---|---|
| "Pasta ainda não criada" no cadastro | Pasta não apontada | Escolher na lista e salvar (seção 2) |
| Varredura do Simples acha 0 PDFs | PDFs fora de `FISCAL\IMPOSTOS\SIMPLES NACIONAL` | Mover para lá |
| Tributo com "sem arquivo" na conciliação | Razão fora de `RAZAO`, ou nome não diz o tributo | Conferir a seção 5 |
| Arquivo listado como "não identificável" | Nome ambíguo ou sem tributo | Renomear para `Razao <TRIBUTO>` |
| Tributo em cinza, "dentro do DAS" | Cliente do Simples — está certo | Nada a fazer |
| Coluna "Pago" vazia no FGTS | Não temos fonte de pagamento de FGTS ainda | Nada a fazer hoje (será o eSocial) |
| Coluna "Pago" vazia no ICMS | O DARE estadual não passa pelo e-CAC | A tela mostra o declarado na GIAM, com asterisco |
| Balanço/Balancete sem um ano | Falta o `SPED-ECD\<ANO>\<ANO>.txt` | Importar o ECD pela tela do exercício |
| Obrigações Acessórias vazio | Pastas da ECD, ECF e EFD-Contribuições não preenchidas | Preencher no cadastro (seção 11) |

---

## 13. Perguntas que aparecem sempre

**Posso renomear a pasta do cliente depois?**
Pode — mas volte no cadastro e aponte de novo, senão a plataforma procura no
caminho antigo.

**Posso ter subpasta dentro da `RAZAO`?**
Pode: `RAZAO\ICMS\razao.pdf` funciona. O nome da subpasta também serve de de-para.

**E se a empresa tiver duas contas do mesmo tributo?**
Coloque os dois arquivos. A LUPO tem ICMS e ICMS DIFAL — aparecem como duas
linhas, cada uma com a sua conta contábil.

**Preciso apagar o razão antigo antes de pôr o novo?**
Se o nome for o mesmo, o novo substitui. Se for diferente (`Razao ICMS 2024.pdf`
e `Razao ICMS 2025.pdf`), os dois viram linhas separadas — o que provavelmente
não é o que você quer. Prefira um arquivo por tributo, sempre o mais recente.

**A plataforma some com o meu arquivo?**
Não. Ela lê e devolve; nada é movido nem apagado.
