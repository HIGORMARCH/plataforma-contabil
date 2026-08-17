# Relatório da sessão — 16/08/2026 (Plataforma-Contábil)

**Duração:** manhã/tarde de sábado.
**Foco principal:** backup diário do banco da Plataforma + regra nova de organização de sessões.

---

## 1. Backup diário do banco (implementado)

**Motivação:** dados de cliente no Postgres do 220 (produção) sem cópia off-site além do backup incremental de arquivos que a VOECLOUD faz de `C:\Aplicacoes\`. Um `pg_dump` propriamente estruturado dá recuperação por competência.

### Solução arquitetada

Duas rotinas independentes, cada uma no lugar apropriado — **não é 1 script único**:

| Banco | Onde roda | Destino | Task Scheduler |
|---|---|---|---|
| Plataforma (220) | **Dentro do próprio 220** | `C:\Aplicacoes\backups-postgres\plataforma_YYYY-MM-DD_HH-mm.dump` | `March - Backup diario Plataforma (local)` — diária 20:30 |

**Por que dentro do 220:**
- `pg_dump` em `127.0.0.1` = zero rede, seguro e rápido
- VOECLOUD já faz backup incremental de `C:\Aplicacoes\` → off-site automático
- Zero dependência de VPN do notebook nem PC do escritório ligado
- Senha vem do `.env` local (regex ancora em `@127.0.0.1` porque a senha tem `@` interno)

Retenção local: **3 dias** (limpeza automática dentro do próprio script).

### Teste manual realizado

`plataforma_2026-08-16_11-59.dump` — **224,5 KB**, exit 0. Confirmado. Task agendada, próximo run 20:30:30.

Arquivos criados no 220:
- `C:\Aplicacoes\scripts\backup-banco-local.ps1` — script de dump
- `C:\Aplicacoes\backups-postgres\` — pasta de destino
- `C:\Aplicacoes\backups-postgres\_logs\` — logs

---

## 2. Proteção contra dump vazando pro Git

`.gitignore` da Plataforma atualizado (commit `4e33c24`) — bloqueia:
- `*.dump`, `*.dump.gz`
- `/backups/`, `/dumps/`

Motivo: descobri uma pasta `backups/` untracked com dump de 09/08 (219 KB) que poderia vazar num `git add .` desatento.

---

## 3. Regra nova de organização de sessões (feedback do Higor)

**Regra:** uma sessão do Claude Code por aplicação. Não misturar MarchERP + Plataforma + robô Onvio + March Cofre na mesma conversa.

**Por quê:** eu (Claude) esbarrei num vexame ao propor arquitetura do robô Onvio nesta sessão — misturei contexto MarchERP e esqueci que o MarchERP tinha ido pra Azure no dia anterior. Higor precisou me redirecionar.

**Impacto:**
- Salvo como memória global em `feedback_uma_sessao_por_aplicacao.md`
- Trabalho do robô Onvio + limpeza do 220 SAIRAM desta sessão — cada um vai pra sessão dedicada

---

## 4. Estado da Plataforma-Contábil hoje (16/08 fim de dia)

- ✅ Rodando no VOECLOUD 220 via NSSM
- ✅ Banco Postgres 220 com dados reais migrados do PC (feito 14/08)
- ✅ Backup diário do banco funcionando
- ✅ Notebook via VPN VOECLOUD → acesso ok
- ✅ Código atualizado até commit `4e33c24`

### Nada de código-fonte da Plataforma foi tocado nesta sessão

Toda a atividade foi de infra/backup/organização.

---

## 5. Pendências (próximas sessões)

Nada urgente pra Plataforma pura. As pendências restantes moram nas sessões dedicadas dos outros produtos:

- **MarchERP:** ver `C:\Dev\MarchERP\docs\RELATORIO-SESSAO-2026-08-16.md`
- **Limpeza do 220:** sessão de infra dedicada — task #19

Se surgir algo pra Plataforma: reimportar o Balanço 2018 Casa São Paulo pra validar os fixes de 10/08 continua sendo a ação pendente do Higor (não fizemos hoje).

---

## Commits desta sessão

| Hash | Escopo |
|---|---|
| `4e33c24` | `chore(gitignore): bloquear /backups/, /dumps/ e *.dump` |

---

**Sessão encerrada** ~14:00 hora Brasília. Higor vai abrir sessões dedicadas pra MarchERP e Plataforma separadamente daqui em diante — sem mistura de contexto.

---
---

# Sessão 2 — 16/08/2026 (noite)

**Foco principal:** Simples Nacional na auditoria de ICMS, relatório de impostos a pagar e período de atendimento do cliente.

**Gatilho:** Higor cadastrou a LUPO QUIOSQUE (PALMAS QUIOSQUE COMERCIO DE ACESSORIOS E VESTUARIO LTDA, CNPJ 34.351.482/0001-46), primeira empresa do Simples na base, pra conferir PGDAS e DEFIS.

---

## 1. Diagnóstico — a auditoria de ICMS não enxergava o Simples

Consulta ao banco na LUPO QUIOSQUE:

| Medida | Valor |
|---|---|
| GIAM do Domínio | 84 |
| Espelhos do portal SEFAZ | 82 |
| SPED-Fiscal | 0 |
| Segmento E tipo `C` (complementação) | 78 linhas · R$ 70.901,51 |
| Segmento E tipo `D` (difal entradas) | 44 linhas · R$ 7.669,67 |
| Segmento E tipo `N` (normal) | **zero linhas** |

**A descoberta:** empresa do Simples não tem uma única linha de ICMS normal — está tudo no DAS. O que ela recolhe em guia estadual é complementação e difal. A tela destacava "ICMS a Recolher (Normal)", que era `0 × 0` nas 82 competências: verde "bate" significando nada. E o índice marcava as 84 competências como "sem par" por falta de SPED, que é o comportamento correto do Simples.

---

## 2. Entregue

### 2.1 Auditoria ciente do regime

- `src/lib/regime.ts` (novo) — `ehSimples()`, que estava duplicado em dois arquivos.
- Tela de competência: no Simples o destaque vai pra **Complementação de Alíquota** (tipo `C`); difal (`D`+`F`) ganhou linha própria. Difal e complementação nunca somam com a apuração normal nem entre si.
- Rótulos encurtados a pedido do Higor: "Crédito das Entradas (ICMS)" → **Crédito**; "Débito das Saídas (ICMS)" → **Débito**.
- Alerta de incoerência interna: se o A26 do Segmento A divergir da linha `D` do Segmento E, faixa âmbar mostra os dois valores. Importa fiel, aponta, não conserta.
- Índice: crachá "Simples", chip "N GIAM (Simples)"; GIAM sem SPED deixou de contar como pendência.

### 2.2 Relatório de Impostos a Pagar (novo módulo)

Rota `/painel/impostos-declarados` (menu Contábil), com link a partir da Conciliação Estadual.

- `src/lib/impostos/declarados.ts` — consolida GIAM (ICMS por tipo, com vencimento), SPED-Fiscal (só onde não há GIAM, pra não duplicar), DCTFWeb (uma linha por código de receita, preferindo `saldoAPagar`) e ECF (IRPJ/CSLL trimestral).
- **Decisão:** não existe total geral. O mesmo tributo pode ser declarado em duas fontes na mesma competência (DCTFWeb confessa o que a ECF apurou) e um número único mentiria. Há total por declaração + alerta de conflito.
- **Impressão pra conciliação bancária:** papel timbrado no padrão do balancete, coluna "Conferido" que só existe no papel, cabeçalho repetindo por página, crachás viram texto preto. Correção aplicada: `table-layout: fixed` + larguras por coluna — o `min-w-[900px]` da tela estourava o A4 e fazia sair barra de rolagem no papel.

### 2.3 Período de atendimento do cliente

**Motivação:** a plataforma acusava 07/2019 e 07/2026 da LUPO como lacuna. Nenhum era erro — 07/2019 é anterior à IE (obtida em 08/2019) e 07/2026 é posterior à saída do cliente. Sem registrar isso, o contador precisa lembrar de cabeça pra sempre.

- Quatro campos em `Cliente`: `atendimentoInicio`, `atendimentoFim`, `ieInicio`, `ieFim`. Data em vez de booleano porque `atendimentoFim` nulo já serve de flag "ativo" e ainda dá o recorte por competência.
- `src/lib/atendimento.ts` — `foraDoPeriodo()` pras telas e `recortarPeriodo()` pro guard dos robôs.
- Seção "Período de atendimento" no cadastro (novo + editar).
- **Guard nos três robôs:**

| Robô | Comportamento |
|---|---|
| SERPRO DCTFWeb | Recorta o range antes de enumerar. Se nada sobra, encerra **sem nenhuma chamada paga** |
| Portal Simples | Recorta os anos; grava no log o range efetivamente consultado |
| SEFAZ (GIAM) | Filtra mês a mês considerando também a vigência da IE; informa quais descartou |

- Índice da auditoria: chip "N fora do período" tracejado; essas competências saem da conta de "sem par".

### 2.4 Correção de bloqueio do build

`scripts/conferir-codigos-dctf-sped.ts` tinha `Set<"1"|"2">` recebendo `.has(string)`. Erro pré-existente que impedia qualquer `next build`. Corrigido.

---

## 3. Descoberta importante — PGDASD do SERPRO só devolve PDF

Pesquisa na doc oficial antes de codar o confronto PGDAS × GIAM:

| Serviço | Saída |
|---|---|
| CONSDECLARACAO13 | lista de declarações do ano |
| CONSULTIMADECREC14 | recibo + declaração, **PDF base64** |
| CONSDECREC15 | recibo, **PDF base64** |
| CONSEXTRATO16 | extrato do DAS, **PDF base64** |

**Nenhum serviço devolve valores em JSON.** Diferente da DCTFWeb, que tem `CONSXMLDECLARACAO38` retornando XML de verdade, o PGDASD não tem equivalente. Pra tirar receita bruta do PGDAS é obrigatório decodificar o base64 e parsear o PDF. Registrado na memória `reference_integra_contador_catalogo`.

Path da doc: usar `/pt/solucoes/integra-sn/pgdasd/` — o `/pt/sistemas/pgdasd/` devolve HTTP 500 intermitente.

---

## 4. Matriz de confronto do Simples (decisão do Higor)

|  | Federal | Estadual |
|---|---|---|
| **Mensal** | PGDAS-D | GIAM |
| **Anual** | DEFIS | DIF |

A conciliação de balanço do Simples (Domínio × DEFIS) continua valendo, mas é outra coisa: usa a DEFIS como substituta da ECD, não como par da DIF. Registrado em `.claude/decisoes.md`.

---

## 5. Estado do banco

- `prisma db push` aplicou as 4 colunas novas — **aditivas e nulas**, nenhum dado existente tocado.
- **Atenção:** o `.env` desta máquina aponta pra `localhost:5432`, não pro 220. A migration foi aplicada no Postgres local. **Quando for pro 220, precisa rodar `prisma db push` lá.**
- `prisma generate` exigiu derrubar o dev server (EPERM no `query_engine-windows.dll.node`).
- Backup manual não foi feito: exigiria abrir o `.env` pra ler a string de conexão com senha. Mudança é aditiva e o backup diário das 20:30 segue valendo.

---

## 6. Verificação

- `next build` completo: todas as rotas compilam, incluindo as duas novas.
- Typecheck: **zero erros** (era 1 pré-existente, corrigido).
- Testes: 61 passando.
- **Não houve verificação visual** — as telas exigem login e a sessão não preenche campo de senha.

---

## 7. O que ficou para a próxima

| # | Item | Depende de |
|---|---|---|
| 1 | Preencher os períodos da LUPO (IE 08/2019, atendimento até 06/2026) | Higor — pela UI |
| 2 | Conferir 02/2026 e 03/2026 da LUPO: têm GIAM no Domínio sem Espelho no portal | Higor |
| 3 | Coluna SEFAZ pra complementação/difal — hoje R$ 78 mil sem conferência contra o portal | Um Espelho da GIAM de empresa do Simples |
| 4 | Parser do PDF do PGDAS | Um PDF de declaração PGDAS-D |
| 5 | Conciliação Domínio × DEFIS (valores) | XML/recibo da DEFIS |
| 6 | Exportar XLSX do relatório de impostos | Decisão do Higor |
| 7 | `prisma db push` no 220 quando for deployar | Deploy |

---

**Sessão encerrada** ~22:40 hora Brasília.
