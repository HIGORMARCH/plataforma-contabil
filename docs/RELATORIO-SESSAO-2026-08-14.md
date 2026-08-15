# Relatório da sessão — 14/08/2026

**Duração:** maratona — começou fim da tarde do dia 13, virou madrugada, continuou até fim da noite do dia 14.
**Foco:** Deploy MarchERP na Azure + resolver acesso Plataforma pelo notebook.

---

## 1. Ajustes finais no Balancete Comparado (13/08 tarde/noite)

- **Impressão condicional retrato/paisagem**: Sistema/ECD sozinhos em A4 retrato, Ambos em paisagem (`d0b3150`)
- **Fix bug do menu do topbar** que fechava rápido demais ao hover — delay 220ms + hover no dropdown (`6e45fd9`)
- **Print enxuto com papel timbrado** — cabeçalho fixo (logo escritório, razão, CRC, contato) + enunciado por escopo, só tabela do banco na página, resto oculto (`3d6cbd0`)

---

## 2. Deploy MarchERP na Azure — MVP em produção (14/08 madrugada)

### Preparação (commit `980f035` no MarchERP)
- `requirements.txt` corrigido: adicionadas `apscheduler`, `gunicorn`, `azure-storage-blob`, `azure-identity`
- `SECRET_KEY` do JWT externalizado pra env var (era hardcoded no repo)
- Dockerfile criado (não usado no fim — foi source Python nativo)

### Provisionamento Azure
Recursos em `rg-marcherp-prod` / Brazil South:
- **PostgreSQL Flexible Server** `marcherp-db-prod` (B2s, PG 16) + database `march_erp`
- **Storage** `stmarcherpprod` + container `anexos`
- **Key Vault** `kv-marcherp-prod` com 5 secrets (postgres, JWT, database-url, storage-connection, admin-march-password)
- **Log Analytics** + **Application Insights** `appi-marcherp`
- **App Service Plan Basic B2 Linux** + **Web App** `marcherp-app` com Managed Identity + acesso KV
- **Env vars** com Key Vault references

### Blocker resolvido — quota App Service
Subscription nova tinha **quota 0** pra qualquer SKU App Service (F1, D1, B1, B2) em todo Brasil e várias US. Auto-atendimento rejeitou. Ticket suporte Microsoft `2608140040000141` (Severity C, English) aprovado em minutos.

### Deploy do código — 5 tentativas
- v1: `ModuleNotFoundError: 'app'` (startup command errado)
- v2: `cd: can't cd to /home/site/wwwroot/backend` (path absoluto errado)
- v3: `cd: can't cd to backend` (PROJECT=backend fez Oryx sumir com `backend/`)
- v4: mesmo erro — descobri que **PowerShell `Compress-Archive` grava paths com `\` (Windows), Linux vê como arquivo único**
- **v5 (funcionou)**: zip refeito com `zipfile` do Python (forward slash), PROJECT removido, `requirements.txt` também na raiz do zip

### Migração de dados
- `pg_dump` do banco `march_erp` local (12 users, 115 clientes, 12069 tarefas, 40 templates) → arquivo custom-format 395KB
- `pg_restore` na Azure Database — contagens validadas 100%

### CNAME criado
- `marcherp.marchcontabilidade.com.br` → `marcherp-app.azurewebsites.net` no HostGator

### Pós-deploy imediato
- Senha `admin@march.com` trocada (era `march2026` hardcoded) — nova aleatória no KV como `admin-march-password`
- Fix `/health` — endpoint estava capturado pelo SPA fallback, movido pra antes (deploy v5 aplicado)
- Serviço NSSM `march-erp-backend` no VOECLOUD 220 parado + desabilitado (evita 2 instâncias)

---

## 3. Acessar Plataforma pelo notebook — via VOECLOUD (14/08 noite)

### Contexto descoberto
- **Banco Plataforma no VOECLOUD 220 estava VAZIO** (nunca teve seed nem dados)
- Higor logava do PC do escritório porque conectava em Postgres LOCAL, não no 220
- Do notebook via VPN → acessa Plataforma do 220 → banco vazio → login falha

### Bugs enfrentados
- Regex `[^@]+` pra extrair senha da DATABASE_URL **quebrava** (senha do postgres tem `@` interno) — fix: ancorar em `@127.0.0.1`
- Senha do postgres do 220 estava perdida — resetada via modo trust temporário no pg_hba.conf (script defensivo com try/catch + backup automático)
- Copy-Item PowerShell falhava por permissão SMB do PC do escritório → resolveu com Copy-Item via UNC do próprio Bash aqui (sessão SMB integrada)
- Escape de aspas duplas do PowerShell → sempre usar arquivo `.sql` temp
- Read-Host sem `-AsSecureString` expôs senha no terminal → passou a usar SecureString sempre

### Migração de dados PC do escritório → 220
- `pg_dump` do banco local (1 Escritorio, 4 Usuarios, 2 Clientes)
- Cópia via Copy-Item PowerShell pro `\\192.168.248.220\c$\Aplicacoes\dumps\`
- `pg_restore --clean --if-exists` no 220
- Contagens confirmadas: Escritorio=1, Usuario=4, Cliente=2

### Atualização do código no 220
- **24 commits locais NUNCA foram pushed pro GitHub** (das sessões anteriores) — Higor detectou. Push feito
- `git pull` no 220 + `npm install` + `prisma generate` (com serviço parado pra evitar EPERM) + `prisma migrate deploy` (11 migrations, nenhuma pendente) + `npm run build` + `Restart-Service`

### Ícone bonito no atalho
- Convertido PNG do logo pro `.ico` com fundo oliva March (paleta oficial)
- Higor aplicou no atalho da área de trabalho

---

## Custos Azure (estimativa mensal)

| Recurso | ~R$/mês |
|---|---|
| PostgreSQL B2s + storage 32GB | 220 |
| App Service Plan B2 Linux | 300 |
| Storage Account | 15 |
| Key Vault | 20 |
| Log Analytics + App Insights | 5 |
| **Total** | **~R$560/mês** |

---

## Estado final

- ✅ MarchERP na Azure em `marcherp-app.azurewebsites.net` — equipe pode usar amanhã
- ✅ Plataforma Contábil no notebook via VPN — código atualizado com todas as melhorias da sessão anterior + dados migrados do PC do escritório
- ✅ Atalho com ícone March no PC do Higor apontando pra Azure
- ⏳ Custom domain `marcherp.marchcontabilidade.com.br` — aguardando propagação DNS
- ⏳ SSL managed cert Azure — ativa quando custom domain propagar
- ⏳ CORS restringir + remover firewall temp `AllowHigorTemp2` do Postgres Azure

---

## Arquivos alterados/criados

**MarchERP:**
- `backend/requirements.txt` — deps completas
- `backend/app/core/security.py` — JWT_SECRET_KEY via env var
- `backend/app/main.py` — /health antes do SPA fallback
- `Dockerfile` + `.dockerignore`
- `frontend/public/march-icon-bg.ico` + preview PNG

**plataforma-contabil:**
- `docs/RELATORIO-SESSAO-2026-08-14.md` (este arquivo)
- 24 commits pushed pro GitHub finalmente

**Memórias (`.claude/projects/…/memory/`):**
- `project_hospedagem.md` — atualizada 2x
- `reference_azure_marcherp_deploy.md` — nova
- `reference_azure_deploy_quirks.md` — nova (9 armadilhas do Azure App Service)
- `feedback_nao_sugerir_anydesk.md` — nova (regra do Higor)
- `project_banco_plataforma_local_vs_220.md` — nova (arquitetura banco PC vs 220)

---

## Pendências (próxima sessão)

### Curto prazo — MarchERP
- **Custom domain** `marcherp.marchcontabilidade.com.br` — adicionar no App Service assim que DNS propagar
- **SSL managed cert** — automático com custom domain
- **CORS restringir** pro domínio final
- **Remover firewall temp `AllowHigorTemp2`** do Postgres Azure

### Fase 2 — automações (6 semanas — até 22/09)
- Semanas 2-3 (19/08 → 01/09): **Robô Onvio** (Container App Azure + Playwright) — prioridade máxima, tira trabalho manual do Higor
- Semana 4 (02 → 08/09): **Robô Domínio** (VOECLOUD 220 com pywinauto — cliente desktop)
- Semanas 5-6 (09 → 22/09): **Robô SERPRO** (Container App + cert A1)

### Descartado nesta sessão
- Cloudflare Tunnel Plataforma — Higor decidiu que VPN VOECLOUD basta pra ele solo

---

## Aprendizados salvos

- **Nunca sugerir AnyDesk** — Higor investiu pesado em infra profissional, merece propostas à altura
- **PowerShell `Compress-Archive` grava paths Windows-style com `\`** — não usar pra deploy em Linux; usar `zipfile` do Python
- **Regex `[^@]+`** pra parsear senha em DATABASE_URL quebra se senha tem `@` interno — ancorar em host
- **Read-Host sem `-AsSecureString`** expõe senha no terminal — sempre SecureString
- **Sempre alertar requisitos de senha** ao pedir uma nova (o Higor incluiu asteriscos achando que era formatação)
- **PROJECT env var** do Oryx faz o Azure sumir com a subpasta do projeto — usar com cuidado
- **Postgres do 220 tem senha com `@` interno** — parsing precisa ancorar em `@127.0.0.1`

---

**Sessão encerrada 22:50 hora Brasília.** MarchERP em produção na Azure, Plataforma Contábil acessível do notebook via VPN, código atualizado até o último commit. Próxima sessão: robô Onvio (semana 2-3 do cronograma).
