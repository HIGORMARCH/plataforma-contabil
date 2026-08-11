# Pendências — Plataforma Contábil March

## Ações do dono (Higor) pendentes

- [ ] **Reimportar balanço 2018 Casa São Paulo** — `/painel/clientes/cmsgssy660001f6vg1x2m83q6/exercicios?ano=2018` → Extrair PDF → Salvar. Valida o fix do parser (Reservas de Capital) + fix de cache.

## Ideias não implementadas

- [ ] **Aviso automático "PDF novo, reimporte"** — quando `mtime(balanco.pdf) > exercicio.updatedAt`, faixa amarela na tela com botão de reimportação um clique. Ideia aceita, sem prazo.
- [ ] **Ferramenta de vinculação plano de contas** — revertida em 10/08/2026 por matching ruim (código sequencial casava conta errada). Higor quer retomar com abordagem diferente.
- [ ] **Módulo Conciliação Estadual GIAM × Razão** — decisão antes de codar: GIAM vs SPED-Fiscal (Decreto TO 7.103/2026: GIAM obrigatória até 12/2026 pro Regime Normal, migra pra SPED-Fiscal em 01/2026).

## Débitos técnicos

- [ ] Testes: 61 passando após revert (era 76 antes). Cobertura reduzida.
- [ ] Deploy no servidor VOECLOUD `192.168.248.220` aguardando VOECLOUD instalar runtime.
- [ ] Backup Postgres pra servidor MARCH `192.168.248.150` (`Z:\HIGOR\Dev\`) — identidade + credenciais SMB a confirmar.

## Roadmap distante (visão SaaS)

- [ ] Multi-tenant: hoje é instância única. Higor quer replicar comercialmente. Construir pensando em separação por escritório desde já (mesmo que v1 seja single).
- [ ] Agente `march-navigator` — subagente que conheça toda a plataforma pra sessões mais rápidas.
- [ ] Agente de segurança (pós-v1) — auditar acesso, alertar terceiros.

## Padrão de manutenção

Quando uma pendência for concluída, mover pro `docs/RELATORIO-SESSAO-<data>.md` da sessão e remover daqui. Não acumular histórico aqui — este arquivo é foto do estado atual.
