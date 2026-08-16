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
