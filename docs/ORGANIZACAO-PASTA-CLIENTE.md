# Como organizar a pasta do cliente

> Última atualização: 30/08/2026
> Raiz: `C:\PlataformaContabil\` (configurável em `PLATAFORMA_ROOT`)

Relatório do que a plataforma **de fato** procura hoje, módulo por módulo, e
como a pasta do cliente deve ficar para que tudo seja encontrado.

---

## 1. Em uma frase

**A plataforma lê a pasta do cliente; nunca escreve nela** — exceto para criar a
pasta `RAZAO` e para guardar cópia dos arquivos que ela mesma baixou. Nenhum
arquivo seu é movido, renomeado ou apagado.

---

## 2. Onde fica a pasta do cliente

Uma pasta por cliente, dentro de `C:\PlataformaContabil\`.

O nome da pasta **não precisa seguir padrão nenhum**: no cadastro do cliente,
seção *Pasta do cliente (fonte única)*, você escolhe na lista qual das pastas
existentes é a dele. É assim que a `LUPO -  PALMAS QUIOSQUE ...` funciona, mesmo
sem CNPJ no nome.

> Sem esse apontamento, a plataforma procura por um nome composto da razão social
> + CNPJ (`PALMAS_QUIOSQUE_..._34351482000146`), que normalmente **não existe em
> disco** — e o cliente aparece com "pasta ainda não criada".

---

## 3. A estrutura recomendada

```
C:\PlataformaContabil\<PASTA DO CLIENTE>\
│
├── RAZAO\                          ← razão contábil, um PDF por tributo
│     Razao simples nacional.pdf
│     Razao INSS.pdf
│     Razao FGTS.pdf
│     Razao IRRF.pdf
│     Razao ICMS.pdf
│     Razao ICMS DIFAL.pdf
│     Razao Pis.pdf                 (só quem recolhe à parte)
│     Razao Cofins.pdf
│     Razao Irpj.pdf
│     Razao Csll.pdf
│
├── FISCAL\
│   ├── IMPOSTOS\
│   │   ├── SIMPLES NACIONAL\       ← guias do DAS e comprovantes de pagamento
│   │   │   ├── 2025\
│   │   │   │     PGDASD-DAS-05.2025.pdf
│   │   │   │     PAGAMENTO 2025.pdf
│   │   │   └── 2026\
│   │   ├── GIAM\<ANO>\             ← espelhos e comprovantes da GIAM
│   │   └── ICMS\<ANO>\
│   ├── DECLARAÇÕES\                ← SPEDs, DCTF, ECF transmitidos
│   │   ├── SPED CONTÁBIL\
│   │   ├── SPED FISCAL\
│   │   ├── SPED CONTRIBUIÇÕES\
│   │   ├── ECF\
│   │   └── DCTF\
│   └── DOCUMENTOS FISCAIS\<ANO>\<MM.ANO>\   ← XMLs e zips de notas
│
├── SPED-ECD\<ANO>\<ANO>.txt        ← cópia padronizada, criada pela plataforma
├── SPED-ECD-DOMINIO\<ANO>\<ANO>.txt
├── SPED-ECF\<ANO>\<ANO>.txt
├── SPED-FISCAL\<ANO>\<MM>.txt
├── SPED-CONTRIBUICOES\<ANO>\<MM>.txt
├── DCTF-ANTIGA\<ANO>\<MM>.dec
├── DCTFWEB\<ANO>\<MM>.xml
├── BALANCOS-DOMINIO\<ANO>\balanco.pdf, dre.pdf
└── DEFIS\<ANO>\<ANO>.xml
```

As pastas em MAIÚSCULO-COM-HÍFEN (`SPED-ECD`, `BALANCOS-DOMINIO`...) são as
**cópias padronizadas** que a própria plataforma cria quando você importa um
arquivo pela tela. Você não precisa montá-las à mão.

---

## 4. Onde o nome do arquivo importa — e onde não importa

| Módulo | Onde procura | O nome do arquivo importa? |
|---|---|---|
| **Conciliação de Impostos** (razão) | `RAZAO\` | **Sim.** O nome diz o tributo |
| **PGDAS-D** → Varrer pasta | `FISCAL\IMPOSTOS\SIMPLES NACIONAL\` (recursivo) | Não. Decide pelo conteúdo do PDF |
| **Auditoria de Obrigações Acessórias** | pasta fiscal (recursivo, tudo) | Não. Lê o cabeçalho do arquivo |
| **SPED-Fiscal** → Varrer pasta | pasta fiscal (recursivo, `.txt`) | Não. Reconhece pelo registro `\|0000\|` |
| **GIAM** → Varrer pasta | `pastaGiam`, ou a fiscal | Não. Filtra pela inscrição estadual dentro do arquivo |
| **Balanço · Balancete · Conciliação ECD · Razão/Contrapartida** | `SPED-ECD\<ANO>\<ANO>.txt` | **Sim** — mas é a plataforma que grava ali |
| **IRPJ/CSLL** | `SPED-ECF\<ANO>\` | Idem |

**Regra prática:** só a pasta `RAZAO` depende de você nomear direito. No resto, a
plataforma abre o arquivo e descobre o que ele é.

---

## 5. A pasta RAZAO em detalhe

Um PDF por tributo, extraído do Domínio (razão da conta "a recolher").

Reconhecimento (`src/lib/razao/tributos.ts`):

- acento, caixa e extensão não importam — `RAZÃO ICMS.pdf` = `razao_icms.pdf`;
- nome colado funciona — `RazaoINSS.pdf`;
- **nome ambíguo é recusado** — `Razao PIS e COFINS.pdf` não entra em nenhum dos
  dois; separe em dois arquivos;
- **mais de um arquivo por tributo é aceito** — `Razao ICMS.pdf` e
  `Razao ICMS DIFAL.pdf` viram duas contas, exibidas separadamente;
- subpasta por tributo também vale (`RAZAO\ICMS\razao.pdf`).

Cada empresa põe **só os razões que tem**. Ausência não é pendência.

Para empresa do **Simples**, não coloque `Razao Pis`, `Razao Cofins`, `Razao
Irpj` nem `Razao Csll`: esses tributos estão dentro do DAS e a tela já os marca
como "dentro do DAS".

---

## 6. A pasta do Simples Nacional em detalhe

`FISCAL\IMPOSTOS\SIMPLES NACIONAL\<ANO>\`

Dois documentos diferentes convivem aqui, e a plataforma separa pelo conteúdo:

| Documento | Como costuma vir | Vira o quê |
|---|---|---|
| **Guia do DAS** | `PGDASD-DAS-12.2025.pdf`, `PGD-DAS-03.2026_TR.pdf` | Valor cobrado, vencimento, composição por código |
| **Comprovante de Arrecadação** | `PAGAMENTO 2025.pdf` (o ano inteiro num PDF) | Pagamento efetivo, com data de arrecadação e banco |

O comprovante é o documento mais valioso dos dois: é ele que prova o pagamento,
e traz também os DARF da folha (INSS dos segurados, IRRF).

---

## 7. Dois campos de pasta no cadastro — e a diferença entre eles

| Campo | Para quê | Situação |
|---|---|---|
| **Pasta do cliente** (`pastaLocal`) | A pasta na fonte única. Usada pela Conciliação de Impostos, razão, PGDAS-D e pelas cópias padronizadas | **É o que vale daqui pra frente** |
| **Pasta de arquivos fiscais** (`pastaFiscal`) | Caminho legado (Z:\, servidor do escritório) varrido pelos módulos antigos: obrigações acessórias, SPED-Fiscal, GIAM | Continua funcionando; some quando os módulos antigos migrarem |
| **Pasta da GIAM** (`pastaGiam`) | Pasta compartilhada onde o Domínio salva a GIAM de todos os clientes juntos | Específica; filtra pela IE dentro do arquivo |

Preencher os três não faz mal. O ideal é que `pastaLocal` aponte para a pasta do
cliente dentro de `C:\PlataformaContabil` e que os arquivos do servidor tenham
sido **copiados** para lá.

---

## 8. O que a plataforma faz e não faz com seus arquivos

**Faz:**
- lê o arquivo, extrai os valores e **descarta o conteúdo** — só dados no banco;
- cria a pasta `RAZAO` quando você salva o cadastro;
- grava cópia padronizada do que ela mesma baixou (SERPRO, e-CAC) ou do que você
  subiu pela tela.

**Não faz:**
- não move, não renomeia e não apaga arquivo seu;
- não escreve em servidor de terceiro (Z:\, ReceitanetBX, Domínio) — opera
  sempre na cópia local;
- não guarda o PDF nem o SPED: o binário morre no fim da leitura.

---

## 9. Passo a passo para preparar um cliente novo

1. Criar a pasta do cliente em `C:\PlataformaContabil\` (nome livre — use o
   apelido da equipe, se preferir).
2. Copiar para dentro dela a árvore `FISCAL\` do servidor.
3. No cadastro do cliente → *Pasta do cliente (fonte única)* → escolher a pasta →
   **Salvar**. A pasta `RAZAO` nasce nesse momento.
4. Exportar do Domínio o razão de cada tributo que a empresa tem e salvar em
   `RAZAO\` com o nome do tributo.
5. Rodar, na tela do PGDAS-D, **Varrer pasta do cliente** (custo zero).
6. Rodar a sincronização do e-CAC (Auditoria Tributária).
7. Abrir a **Conciliação de Impostos**.

---

## 10. Quando algo não aparece

| Sintoma | Causa provável | O que fazer |
|---|---|---|
| "Pasta ainda não criada" no cadastro | `pastaLocal` não apontada | Escolher a pasta na lista e salvar |
| Varredura do Simples acha 0 PDFs | Os PDFs não estão em `FISCAL\IMPOSTOS\SIMPLES NACIONAL` | Mover para lá, ou me avisar para varrer outra subpasta |
| Tributo com "sem arquivo" na conciliação | Razão fora de `RAZAO`, ou nome não identifica o tributo | Conferir a seção 5 |
| Arquivo na pasta `RAZAO` listado como "não identificável" | Nome ambíguo ou sem o tributo | Renomear seguindo `Razao <TRIBUTO>` |
| Balanço/Balancete sem dados de um ano | O `SPED-ECD\<ANO>\<ANO>.txt` não existe | Importar o ECD pela tela do exercício |
| Obrigações Acessórias vazio | `pastaFiscal` não preenchida (módulo antigo ainda usa ela) | Preencher no cadastro |

---

## 11. Ponto em aberto

Hoje convivem **duas convenções**: a árvore do escritório (`FISCAL\...`), que a
equipe já usa e que os módulos novos leem, e a árvore padronizada
(`SPED-ECD\<ANO>\...`), que a plataforma cria para os módulos antigos. Não é
problema — cada módulo sabe onde procurar —, mas vale unificar quando os módulos
antigos forem migrados de `pastaFiscal` para `pastaLocal`.
