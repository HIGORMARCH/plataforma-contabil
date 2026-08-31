# Robô organizador de pastas — especificação

> Escrito em 30/08/2026. Ainda **não implementado** — este documento é o
> contrato do que ele deve fazer.
> Manual da equipe correspondente: `MANUAL_PASTA_DO_CLIENTE.md`

O robô lê uma pasta de entrada, identifica cada arquivo **pelo conteúdo** e o
arquiva no lugar certo da pasta do cliente, seguindo o manual da equipe. Ele
existe para que o manual não precise ser obedecido à mão.

---

## 1. Princípio

**O robô arquiva; ele não decide o que é duvidoso.** Arquivo que ele não
identificar com certeza vai para uma pasta de quarentena com o motivo — nunca
para um palpite. Um documento no lugar errado é pior que um documento parado:
o errado entra em conciliação e vira número falso.

---

## 2. O que ele nunca faz

- **Não move o original.** Copia. Se o original estiver no servidor do
  escritório (Z:\), ele continua lá — a plataforma nunca escreve em servidor de
  terceiro.
- **Não sobrescreve.** Destino ocupado com conteúdo diferente vira conflito, com
  os dois arquivos preservados.
- **Não renomeia o que já está arquivado.**
- **Não apaga nada**, nem duplicata.
- **Não classifica por nome de arquivo** — exceto na pasta `RAZAO`, onde o nome
  é a única informação disponível (seção 5).

---

## 3. Como ele identifica cada documento

A régua é a mesma que a plataforma já usa (`src/lib/obrigacoes-acessorias/varredura.ts`
e os parsers de `src/lib/pgdasd/`). Assinaturas verificadas contra arquivos reais:

| Documento | Assinatura | Onde ler |
|---|---|---|
| **SPED-ECD** | `.txt` que começa com `\|0000\|LECD\|` | campo 3 = data inicial → ano |
| **SPED-ECF** | `.txt` que começa com `\|0000\|LECF\|` | campo 3 → ano |
| **SPED-Contribuições** | `.txt` com `\|0000\|` e algum de `\|M100\|`, `\|M200\|`, `\|M400\|`, `\|M600\|` | campo 6 → ano e mês |
| **SPED-Fiscal (ICMS)** | `.txt` com `\|0000\|` e blocos `\|C100\|`/`\|E110\|`, sem os marcadores M do Contribuições | campo de data do 0000 |
| **DCTF antiga** | `.dec` começando com `DCTFM` | `R10` + 14 dígitos + `AAAAMM` |
| **DCTFWeb** | `.xml` com namespace `serpro.gov.br/dctf` | `perApuracao` (MMAAAA) |
| **Guia do DAS** | PDF com "Documento de Arrecadação do Simples Nacional" e **sem** "Declaratório" | "Dezembro/2025" ou a competência das linhas |
| **Declaração PGDAS-D** | PDF com "Programa Gerador do Documento de Arrecadação do Simples Nacional - **Declaratório**" | "Período de Apuração: 01/12/2023 a 31/12/2023" |
| **Comprovante de Arrecadação** | PDF com "Comprovamos que consta nos sistemas da Receita Federal registro de arrecadação de DAS/DARF" | uma competência **por página** |
| **Razão do Domínio** | PDF com "RAZÃO", "Conta:" e a coluna "Saldo-Exercício" | "Período: 01/08/2019 - 31/07/2026" |
| **Espelho da GIAM** | PDF do portal da SEFAZ-TO | competência no corpo |
| **GIAM (arquivo do Domínio)** | `.txt` posicional layout 10.0 | inscrição estadual + competência em posição fixa |
| **Balanço / DRE do Domínio** | PDF com "BALANÇO PATRIMONIAL" ou "DEMONSTRAÇÃO DO RESULTADO" | ano no cabeçalho |

**Regra de desempate:** o PDF do Simples é o caso mais escorregadio — guia,
declaração e comprovante têm nomes de arquivo parecidos (`PGDASD-DAS-12.2025.pdf`,
`PAGAMENTO 2025.pdf`) e só o texto os separa. A ordem de teste é: comprovante →
declaração → guia. Nenhuma casou: quarentena.

---

## 4. Para onde vai cada um

| Documento | Destino |
|---|---|
| Guia do DAS · Declaração PGDAS-D · Comprovante de Arrecadação | `FISCAL\IMPOSTOS\SIMPLES NACIONAL\<ANO>\` |
| Espelho e arquivo da GIAM | `FISCAL\IMPOSTOS\GIAM\<ANO>\` |
| SPED-ECD, SPED-ECF, SPED-Fiscal, SPED-Contribuições, DCTF, DCTFWeb | `FISCAL\DECLARAÇÕES\<tipo>\` |
| Razão do Domínio | `RAZAO\` |
| Balanço / DRE do Domínio | `BALANCOS-DOMINIO\<ANO>\` |
| XML e zip de notas | `FISCAL\DOCUMENTOS FISCAIS\<ANO>\<MM.ANO>\` |
| Não identificado | `_A CLASSIFICAR\<data da varredura>\` |

O ano vem **do conteúdo**, nunca do nome do arquivo nem da data de modificação.

---

## 5. O caso especial do razão

O razão é o único documento cujo destino depende do nome, porque um PDF de razão
de ICMS e um de INSS são idênticos em estrutura — o que muda é a conta, e a conta
está no cabeçalho.

Duas opções para o robô, nesta ordem:

1. **Ler a conta no cabeçalho** (`Conta: 191 - 2.1.50.200.1 INSS A RECOLHER`) e
   deduzir o tributo pelo NOME DA CONTA. Mais confiável que o nome do arquivo.
2. Se o nome da conta não disser o tributo, usar o nome do arquivo (a régua de
   `src/lib/razao/tributos.ts`).

Nenhuma das duas resolveu: quarentena. **Nunca chutar** — razão no tributo errado
contamina a conciliação inteira.

> Quando o robô arquivar um razão, ele deve nomear o arquivo no padrão
> `Razao <TRIBUTO>.pdf`, para que a plataforma o reconheça mesmo se a conta mudar
> de nome depois.

---

## 6. De qual cliente é o arquivo

Antes de arquivar, o robô precisa saber de quem é o documento. Por ordem de
confiança:

1. **CNPJ dentro do arquivo** — está em praticamente todos (guia, comprovante,
   razão, SPED no registro 0000). É o identificador natural; casa com
   `Cliente.cnpj`.
2. **Inscrição estadual** — para a GIAM, que é o caso em que o Domínio salva
   todos os clientes na mesma pasta.
3. **Pasta de origem**, quando a entrada já é por cliente.

CNPJ que não existe na base: quarentena, com o CNPJ no motivo. Nunca criar
cliente sozinho.

---

## 7. Idempotência

O robô roda quantas vezes for preciso sem duplicar nada:

- calcula SHA-256 do conteúdo antes de copiar;
- se o destino já tem arquivo com o mesmo hash → **pula** (já arquivado);
- se tem arquivo diferente com o mesmo nome → **conflito**: grava o novo com
  sufixo e registra no relatório;
- mantém um índice `hash → destino` para detectar o mesmo documento chegando por
  dois caminhos.

---

## 8. O que ele devolve

Relatório por execução, com uma linha por arquivo:

| Campo | Exemplo |
|---|---|
| origem | `Z:\...\LUPO\PAGAMENTO 2025.pdf` |
| identificado como | Comprovante de Arrecadação · 26 documentos · 2025 |
| cliente | PALMAS QUIOSQUE (34.351.482/0001-46) |
| destino | `...\FISCAL\IMPOSTOS\SIMPLES NACIONAL\2025\` |
| status | arquivado · pulado (já existe) · conflito · quarentena |
| motivo | quando não foi arquivado |

Totais no fim: arquivados, pulados, em conflito, em quarentena. **A quarentena é
a métrica que importa** — ela é a lista de trabalho da equipe.

---

## 9. Onde ele roda

Duas modalidades, a segunda depende da primeira estar madura:

1. **Sob demanda, pela tela** — botão "Organizar pasta", como a varredura de
   hoje. O contador vê o relatório e confere.
2. **Agendado no servidor de automação** — mesma rotina do backup diário. Só
   depois que a taxa de quarentena estiver baixa e estável.

---

## 10. O que aproveitar do que já existe

| Já pronto | Onde |
|---|---|
| Identificação de SPED e DCTF por conteúdo | `src/lib/obrigacoes-acessorias/varredura.ts` |
| Leitura de guia, comprovante e declaração do Simples | `src/lib/pgdasd/` |
| Leitura do razão do Domínio (por coordenadas) | `src/lib/razao/parseRazaoPdf.ts` |
| De-para de tributo pelo nome | `src/lib/razao/tributos.ts` |
| Cópia idempotente com hash | `src/lib/storage/filesystem.ts` (`copiarDeOrigem`, `hashSha256`) |

Falta escrever: o classificador único que testa as assinaturas em ordem, o
resolvedor de cliente pelo CNPJ, a quarentena e o relatório.

---

## 11. Riscos conhecidos

| Risco | Mitigação |
|---|---|
| PDF digitalizado (imagem) não tem texto para identificar | Quarentena com motivo "sem texto"; OCR fica fora do escopo |
| Layout do Domínio muda e a assinatura para de casar | Falhar explicitamente e mandar pra quarentena — nunca arquivar no palpite |
| Dois clientes com o mesmo CNPJ na base (matriz/filial) | Resolver por CNPJ completo, 14 dígitos, nunca pela raiz de 8 |
| Arquivo enorme (SPED de GB) | Ler só o cabeçalho para identificar; hash em stream |
| Robô arquivando enquanto alguém mexe na pasta | Copiar para nome temporário e renomear ao final |
