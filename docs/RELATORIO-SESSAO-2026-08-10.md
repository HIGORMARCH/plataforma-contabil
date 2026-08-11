# Relatório da Sessão — 10/08/2026

Sessão longa cobrindo 4 frentes distintas: auditoria dos agentes de terceiros da ASV/Bravy, configuração de acesso remoto ao PC do escritório, correção da conciliação Domínio × ECD (reverts + fix de parser) e ajuste do balanço 2018 da Casa São Paulo com o próprio contador na ponta reclassificando contas.

---

## 1. Diagnóstico inicial

Retomada da sessão do dia 09/08/2026 com working tree sujo: implementação da ferramenta de vinculação de plano de contas (schema Prisma novo, motor de sugestão automática, tela `/painel/clientes/[id]/plano-contas`, API, integração com conciliação) — feature pausada pelo Higor no fim da sessão anterior.

---

## 2. O que foi feito

### 2.1. Revert da ferramenta de vinculação de plano de contas

Higor decidiu remover a ferramenta ("não deu conta de produzir uma ferramenta confiável"). Removidos cirurgicamente:
- Schema Prisma (`ContaPlanoDominio`) — tabela dropada do banco via `prisma db push`.
- Arquivos: `importarPlanoDominio.ts`, `planoModeloDominio.ts` (816 contas), `sugerirVinculacaoRfb.ts` (+ testes), `exportarModeloDominio.ts`.
- APIs `/api/plano-contas/*`.
- Tela `/painel/clientes/[id]/plano-contas/`.
- Link do menu no cadastro do cliente.
- Integração com conciliação (`contasAnaliticasEcdComPlanoImportadoDoAno`).
- 3 scripts auxiliares de validação.

Preservado: `planoReferencialRfb.ts` — usado pela conciliação do commit anterior.

### 2.2. Auditoria dos 114 agentes de terceiros ASV Digital / Bravy

Análise programática dos 57 + 57 subagentes Claude Code adquiridos.

Achados-chave (relatório em `docs/Relatorio-Auditoria-Agentes-Terceiros-ASV-Bravy.docx`, entregue por SendUserFile):

- **4 menções ao vendor** em 114 prompts (fora COMO-INSTALAR), todas passivas.
- **2 URLs em curl**, ambas de APIs públicas do CNJ.
- **Zero telemetria**, zero callback, zero dependência de infraestrutura do vendor.
- **Todos declaram tools mínimos**: `Read, Grep, Bash, Edit, Write`.
- **Cláusula de licença**: "uso permitido para clientes ASV/Bravy — não redistribuir".

Recomendação: instalação seletiva; pacote contabilidade cobre lacunas da Plataforma (Folha/DP, IRPF-PF); pacote advocacia sem aplicabilidade direta na rotina March.

### 2.3. Acesso remoto ao PC do escritório

Configurado via script `C:\Users\higor\setup-acesso-remoto.ps1`:
- **OpenSSH Server** — serviço `sshd` automático, firewall porta 22.
- **Tailscale** (mesh privado) — login com conta Microsoft `higornoleto@marchcontabilidade.com.br`. Ambos PCs conectados (`higor` 100.67.52.16, `casa` 100.75.65.14).
- **AnyDesk** — ID PC trabalho: `1 658 885 488`. Higor definiu senha de acesso não supervisionado.
- **Energia** — suspender desabilitado (`powercfg /change standby-timeout-ac 0`).

SSH testado do PC de casa: ping OK, conexão SSH bloqueia porque usuário Windows do trabalho **não tem senha** (SSH não aceita login sem senha). AnyDesk cobre a necessidade imediata; SSH pendente até definir senha ou instalar chave pública.

### 2.4. Revert da aba "Contas divergentes" da conciliação

Higor mostrou bug crítico: analítica "(-) DEPRECIAÇÕES DE MÁQUINAS" (código Dom `1.2.30.700.3`, Ativo Não Circulante) sendo agrupada debaixo da sintética RFB "Mercadorias para Revenda" — matching por código sequencial casando conta errada por coincidência de numeração.

Reverted commit `abfe802` inteiro (commit `05dff79`). Removidos:
- Aba "Contas divergentes" na tela de conciliação (10 arquivos, 3.112 linhas)
- Módulos: `conciliarPorConta`, `conciliarPorSintetica`, `conciliarPorCodigoDominio`, `contasAnaliticas.ts`, `exportarConciliacaoExcel.ts`, `planoReferencialRfb.ts`.
- API `/api/conciliacao-ecd/exportar`.
- Componente `BotaoImprimir.tsx`.
- Adição do `codigoSequencial` em `classificacao.ts`.
- Extensões do parser SPED-ECD (blocos I050/I051/I155).

Tela voltou ao commit `3b7441f` (apenas aba "Totais e grupos").

### 2.5. Conciliação Domínio × ECD do balanço 2018 da Casa São Paulo

De-para entre PDF Domínio (`balanco.pdf` na pasta única) e PDF ECD (SPED Contábil visualizado do arquivo TXT). Higor foi corrigindo no Domínio conforme identificamos:

Reclassificações aplicadas por Higor no Domínio durante a sessão:
1. **R$ 100.259,90** — "Adiantamento p/ Aumento de Capital" saiu de `2.3.5 Lucros/Prejuízos Acumulados` e virou conta própria `2.3.2 RESERVAS DE CAPITAL`. Alinha com a ECD.
2. **R$ 28,30** — "Contribuição Sindical" saiu de `2.1.4 Obrigações Tributárias` e foi pra `2.1.5 Trabalhista/Previdenciária`. Alinha com a ECD.
3. **R$ 2.500,00** — "Honorários Contábeis" saiu de `2.1.6 Outras Obrigações` e foi pra `2.1.5 Trabalhista/Previdenciária`. Alinha com a ECD.

Balanço 2018 agora fecha nível 3 conta a conta entre Domínio × ECD.

### 2.6. Fix do parser + fix do cache

**Parser (`src/lib/extract/classificacao.ts`)**: reconhecer `2.3.2 RESERVAS DE CAPITAL` como sintética própria e subtrair do plug de Lucros Acumulados. Sem o fix, o parser incorporava as reservas dentro de `pl.lucrosAcumulados`, gerando divergência falsa contra a ECD depois da reclassificação.

**Cache (`src/app/painel/clientes/[id]/actions.ts`)**: `revalidatePath(path, "layout")` em vez de só a raiz. Reimportação de exercício agora invalida cache de conciliação/análise/pis-cofins/irpj-csll automaticamente.

Adicionado `pl.reservas` na comparação `conciliar()` em `conciliacaoEcd.ts`.

### 2.7. Layout hierárquico da conciliação

Reescrita da tabela achatada da conciliação para formato de balanço patrimonial:
- **Raiz** (ATIVO, PASSIVO + PL) em fundo escuro/branco
- **Subgrupo** (AC, ANC, PC, PNC, PL) em cinza claro
- **Contas nível 3** indentadas, com marcador ✗ vermelho quando divergem

DRE mantém formato tabela plana (não é hierárquica).

---

## 3. Descobertas técnicas importantes (memória do projeto)

Salvas na memória persistente pra referência futura:

1. **Reclassificação vs divergência** — termos distintos que Higor não quer misturar; "divergência" só quando saldos totais divergem, "reclassificação" quando subgrupo bate mas subconta muda.
2. **Análise de balanço até nível 3** — conciliações e comparativos param no nível 3 do plano de contas; descer nas analíticas gera lixo semântico.
3. **Regerar deleta cache** — reimportar exercício deve invalidar caches descendentes.
4. **March Cofre** — projeto interno em Next.js com Microsoft Graph pra e-mail M365; não é produto público.
5. **Acesso remoto Tailscale + AnyDesk** — stack configurada em 10/08.
6. **Agentes ASV/Bravy** — 114 subagentes limpos; sem callback ao vendor.

---

## 4. Ficou faltando

### 4.1. Ação pendente do Higor

- [ ] **Reimportar o balanço 2018 da Casa São Paulo** pela UI (`/painel/clientes/cmsgssy660001f6vg1x2m83q6/exercicios?ano=2018` → Extrair PDF → Salvar). Depois do fix do parser + fix do cache, o exercício no banco vai passar a refletir os saldos corretos (com Reservas separadas) e a tela de conciliação vai zerar todos os Δ do PL.

### 4.2. Ideias não implementadas nesta sessão

- **Aviso automático "PDF atualizado, reimporte"** — quando `mtime(balanco.pdf) > exercicio.updatedAt`, mostrar faixa amarela na tela com botão de reimportação com um clique. Higor concordou com a ideia mas não pediu implementação hoje.
- **`CLAUDE.md` por projeto + subagente `march-navigator`** — proposta discutida pra eu não perder contexto entre sessões dos diversos projetos do Higor (plataforma-contabil, march-cofre, march-portal, MarchERP). Aguardando autorização.
- **Ferramenta de vinculação plano de contas** — feature revertida. Higor sinalizou que gostaria de retomar em outro momento com abordagem diferente.

### 4.3. Onde retomar

**Prioridade 1**: reimportação do balanço 2018 (30 segundos de UI, valida os fixes de hoje).

**Prioridade 2**: outros clientes/anos que também tenham conta "Reservas de Capital" separada — o fix do parser cobre todos.

**Prioridade 3**: definir se quer o aviso automático de PDF-mais-novo-que-banco.

---

**Arquivos-chave modificados nesta sessão:**
- `src/app/painel/clientes/[id]/conciliacao-ecd/page.tsx` (layout hierárquico)
- `src/app/painel/clientes/[id]/actions.ts` (cache invalidation em `layout`)
- `src/lib/accounting/conciliacaoEcd.ts` (pl.reservas na comparação)
- `src/lib/extract/classificacao.ts` (parser reconhece Reservas de Capital)

**Arquivos entregues:**
- `docs/Relatorio-Auditoria-Agentes-Terceiros-ASV-Bravy.docx` (auditoria dos 114 agentes)

**Testes:** 61 passando (era 76 antes do revert), typecheck limpo.

**Commit de fechamento:** feito ao final da sessão. Ver `git log --oneline -3`.
