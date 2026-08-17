# Pendências — Plataforma Contábil March

## Ações do dono (Higor) pendentes

- [ ] **Reimportar balanço 2018 Casa São Paulo** — `/painel/clientes/cmsgssy660001f6vg1x2m83q6/exercicios?ano=2018` → Extrair PDF → Salvar. Valida o fix do parser (Reservas de Capital) + fix de cache.
- [ ] **Preencher período de atendimento da LUPO QUIOSQUE** — Editar cadastro: IE a partir de 08/2019, atendimento até 06/2026. Faz 07/2019 e 07/2026 virarem "fora do período" em vez de divergência.
- [ ] **Conferir 02/2026 e 03/2026 da LUPO QUIOSQUE** — têm GIAM no Domínio e não têm Espelho no portal SEFAZ, e estão DENTRO do período atendido. Ou o robô não sincronizou, ou não foram transmitidas.
- [ ] **Validar impressão do relatório de Impostos a Pagar** — Ctrl+P na LUPO (84 competências) pra conferir quebra de página. Nenhuma tela desta sessão foi verificada visualmente (login bloqueia a sessão do Claude).

## Ideias não implementadas

- [ ] **Aviso automático "PDF novo, reimporte"** — quando `mtime(balanco.pdf) > exercicio.updatedAt`, faixa amarela na tela com botão de reimportação um clique. Ideia aceita, sem prazo.
- [ ] **Ferramenta de vinculação plano de contas** — revertida em 10/08/2026 por matching ruim (código sequencial casava conta errada). Higor quer retomar com abordagem diferente.
- [ ] **Módulo Conciliação Estadual GIAM × Razão** — decisão antes de codar: GIAM vs SPED-Fiscal (Decreto TO 7.103/2026: GIAM obrigatória até 12/2026 pro Regime Normal, migra pra SPED-Fiscal em 01/2026).
- [ ] **Coluna SEFAZ pra difal / complementação de alíquota** — `GiamSefazApuracao` só grava `icmsARecolherNormal` (tipo N). Sem quebra por tipo, a integridade Domínio × SEFAZ do Simples não fecha: a linha principal dele (complementação) mostra "—" na coluna SEFAZ. Falta (a) ver um Espelho da GIAM de empresa do Simples pra saber o rótulo do campo no PDF, (b) campos `icmsComplementacao` / `icmsDifalEntradas` no schema, (c) extração no `sefazScraper`.
- [ ] **Parser do PDF do PGDAS-D** — layout já mapeado (memória `reference_layout_pgdasd_pdf`, validado com arquivo real 12/2023). PDF é texto puro, dá pra usar `pdf-parse` sem coordenadas. Extrair RPA (seção 2.1) pro confronto PGDAS × GIAM saídas, e a tabela de débito por tributo (seção 2.7) pro relatório de Impostos a Pagar. Fonte via SERPRO CONSULTIMADECREC14 (devolve o mesmo PDF em base64).
- [ ] **Conciliação Domínio × DEFIS (Simples)** — task #3 do relatório 08/08, ainda sem parser da DEFIS. Hoje o robô do Portal Simples só raspa a LISTA de transmitidas (data + recibo), não o conteúdo. Depende de ter o XML/recibo da DEFIS de um cliente real.

## Débitos técnicos

- [ ] Testes: 61 passando. Os módulos novos de 16/08 (`src/lib/regime.ts`, `src/lib/atendimento.ts`, `src/lib/impostos/declarados.ts`) entraram **sem teste** — `recortarPeriodo`/`foraDoPeriodo` merecem cobertura, são o guard que decide se robô bate ou não em portal pago.
- [ ] `prisma db push` no 220 quando for deployar — as 4 colunas de período de atendimento foram aplicadas só no Postgres local (o `.env` de dev aponta pra `localhost:5432`, não pro 220).
- [ ] Deploy no servidor VOECLOUD `192.168.248.220` aguardando VOECLOUD instalar runtime.
- [ ] Backup Postgres pra servidor MARCH `192.168.248.150` (`Z:\HIGOR\Dev\`) — identidade + credenciais SMB a confirmar.

## Roadmap distante (visão SaaS)

- [ ] Multi-tenant: hoje é instância única. Higor quer replicar comercialmente. Construir pensando em separação por escritório desde já (mesmo que v1 seja single).
- [ ] Agente `march-navigator` — subagente que conheça toda a plataforma pra sessões mais rápidas.
- [ ] Agente de segurança (pós-v1) — auditar acesso, alertar terceiros.

## Padrão de manutenção

Quando uma pendência for concluída, mover pro `docs/RELATORIO-SESSAO-<data>.md` da sessão e remover daqui. Não acumular histórico aqui — este arquivo é foto do estado atual.
