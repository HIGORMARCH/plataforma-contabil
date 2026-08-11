# Relatório da Sessão — 11/08/2026

Sessão dedicada à reorganização do sistema de memória do Claude Code pra atacar um problema crônico: eu me perdia entre projetos e esquecia contexto de sessão pra sessão.

---

## Diagnóstico

Higor diagnosticou o problema:

> "estou vendo vc se perder preciso criar um padrao pra cada ferramenta e que ela seja padrao"

Confirmei o defeito: memória atual estava com 30+ entradas de 5 projetos empilhadas num único `MEMORY.md` sem separação por sistema. Sem CLAUDE.md por projeto (só na plataforma-contabil) e sem subagentes especializados. Toda vez que ele mudava de projeto, eu perdia contexto.

---

## O que foi feito

### 1. Padrão único de `.claude/` por projeto

Estrutura fixa aplicada a **plataforma-contabil** e **MarchERP**. Sem variação. Mesmo formato pra qualquer sistema futuro.

Cada projeto tem `.claude/` com:

| Arquivo | Conteúdo |
|---|---|
| `memoria.md` | Briefing consolidado — leitura obrigatória no início |
| `arquitetura.md` | Stack, camadas, contratos, decisões técnicas |
| `escopo.md` | O que faz, o que NÃO faz |
| `pendencias.md` | Aberto, ideias, débitos |
| `decisoes.md` | ADR com data e motivo |
| `glossario.md` | Termos do domínio |
| `README.md` | Descrição do padrão (meta) |

### 2. `CLAUDE.md` por projeto aponta pra memória

- `C:\Dev\plataforma-contabil\CLAUDE.md` → `@AGENTS.md` + `@.claude/memoria.md`
- `C:\Dev\MarchERP\CLAUDE.md` → `@.claude/memoria.md` (novo)

Efeito: quando você abrir sessão em qualquer subdiretório desses projetos, memória carrega automática.

### 3. CLAUDE.md global com Trava 1

Adicionada seção obrigatória em `C:\Users\higor\.claude\CLAUDE.md`:

> **PRIMEIRA AÇÃO em qualquer sessão iniciada dentro de um projeto em `C:\Dev\`:**
> `Read C:\Dev\<projeto>\.claude\memoria.md`
> Sem exceção. Sem "achei que já sabia". Sem começar tool call antes.

Se o `.claude/memoria.md` não existir, eu peço autorização e crio no padrão.

### 4. Subagentes por sistema

Criados em `C:\Users\higor\.claude\agents\`:

- `plataforma-navigator.md` — para trabalhos na plataforma-contabil
- `marcherp-navigator.md` — para trabalhos no MarchERP

Cada um tem descrição explicando quando usar. Ao ser invocado, o subagente lê a memória do sistema dele antes de qualquer coisa.

### 5. Commits

- **plataforma-contabil** `77eb0c9` — pasta `.claude/` + CLAUDE.md atualizado
- **MarchERP** `8e0a44b` — pasta `.claude/` + CLAUDE.md novo

Ambos foram pro git — memória viaja com o código. Se um dia migrar pro servidor VOECLOUD, memória vai junto.

---

## Estrutura resultante

```
C:\Users\higor\.claude\
├── CLAUDE.md                          ← Trava 1 (regra de início)
├── agents\
│   ├── plataforma-navigator.md        ← subagente da plataforma
│   └── marcherp-navigator.md          ← subagente do MarchERP
└── projects\C--Dev-plataforma-contabil\memory\
    └── MEMORY.md                      ← auto-memória (mantida como backup)

C:\Dev\plataforma-contabil\
├── CLAUDE.md                          ← @AGENTS.md + @.claude/memoria.md
├── AGENTS.md                          ← inalterado
└── .claude\
    ├── README.md
    ├── memoria.md
    ├── arquitetura.md
    ├── escopo.md
    ├── pendencias.md
    ├── decisoes.md
    └── glossario.md

C:\Dev\MarchERP\
├── CLAUDE.md                          ← @.claude/memoria.md (novo)
└── .claude\
    ├── README.md
    ├── memoria.md
    ├── arquitetura.md
    ├── escopo.md
    ├── pendencias.md
    ├── decisoes.md
    └── glossario.md
```

---

## Como usar amanhã em diante

**Cenário 1 — trabalhar na plataforma-contabil:**
Abre sessão em `C:\Dev\plataforma-contabil` (ou qualquer subdiretório). Eu leio `.claude/memoria.md` como primeira ação. Já começo com contexto certo.

**Cenário 2 — trabalhar no MarchERP:**
Abre sessão em `C:\Dev\MarchERP`. Mesma coisa.

**Cenário 3 — invocar subagente:**
Você pode pedir "usa o plataforma-navigator pra ..." ou "usa o marcherp-navigator pra ...". Ele já carrega o contexto do sistema.

**Cenário 4 — projeto novo:**
Você cria pasta em `C:\Dev\<sistema-novo>`. Na primeira sessão eu vou avisar que `.claude/memoria.md` não existe e pedir autorização pra criar no padrão. Você aprova e copio a estrutura.

---

## Ficou faltando

### Ação pendente do Higor

- [ ] **Reimportar balanço 2018 Casa São Paulo** pela UI (tarefa carregada da sessão de 10/08). Valida fix do parser + fix de cache.

### Deixado como está

- Auto-memória em `~/.claude/projects/C--Dev-plataforma-contabil/memory/MEMORY.md` **foi mantida** — vira backup até você validar que a nova organização funciona. Nada foi apagado.
- Outros projetos do Higor (`march-cofre`, `march-portal-web`, `march-site`, `march-fiscal-bot`, `march-comissoes-produto-mvp`, `Jali-Assistente`, `MarchPortal`, `sgp-nfcom-integracao`, `agente-contabil-fechamento`, `agente-revisor-contratos`, `march-assistente`) NÃO ganharam `.claude/` ainda — replicar quando você trabalhar em cada um.

### Ideias descartadas na sessão

- **Salvar memória em `C:\.claude\`** — descartei por 3 motivos: (1) pasta na raiz do `C:\` exige admin (dor de cabeça); (2) path absoluto Windows quebra portabilidade (não funciona no PC de casa nem no VOECLOUD); (3) duas fontes de verdade com auto-memória nativa. Solução escolhida: `.claude/` dentro de cada projeto, no git.

---

## Onde retomar

**Prioridade 1:** reimportar balanço 2018 Casa São Paulo (30 segundos de UI, ainda pendente desde 10/08).

**Prioridade 2:** próxima vez que trabalhar em algum outro projeto do Higor (`march-cofre`, `Jali-Assistente`, etc.), eu vou pedir autorização pra criar `.claude/` no padrão. Você aprova e replicamos.

**Prioridade 3:** validar se a Trava 1 funcionou de verdade — na próxima sessão da plataforma ou do MarchERP, observar se eu leio `memoria.md` como primeira ação sem você pedir.

---

**Commits:** `77eb0c9` (plataforma-contabil), `8e0a44b` (MarchERP)
**CLAUDE.md global atualizado:** 11/08/2026
