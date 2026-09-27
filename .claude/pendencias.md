# Pendências — Plataforma Contábil March

## Ações do dono (Higor) pendentes

- [ ] **Conferir os saldos devedores da LUPO** — Simples R$ 36.351,31 · INSS R$ 15.951,18 · FGTS R$ 12.423,03. O relatório de divergências aponta o mesmo pagamento lançado duas vezes (um pelo extrato/PIX, outro pela rotina de impostos) como causa provável.
- [ ] **Apontar a pasta dos demais clientes** — só a LUPO tem `pastaLocal` preenchida. Sem isso a plataforma procura por um nome derivado da razão social, que não existe em disco.
- [ ] **Mapear o portal do eSocial comigo logado** — é a fonte que falta para FGTS (hoje sem nenhuma) e reforço de INSS/IRRF. O robô segue o trilho do Portal Simples (certificado do cliente).

- [ ] **Reimportar balanço 2018 Casa São Paulo** — `/painel/clientes/cmsgssy660001f6vg1x2m83q6/exercicios?ano=2018` → Extrair PDF → Salvar. Valida o fix do parser (Reservas de Capital) + fix de cache.
- [ ] **Preencher período de atendimento da LUPO QUIOSQUE** — Editar cadastro: IE a partir de 08/2019, atendimento até 06/2026. Faz 07/2019 e 07/2026 virarem "fora do período" em vez de divergência.
- [ ] **Conferir 02/2026 e 03/2026 da LUPO QUIOSQUE** — têm GIAM no Domínio e não têm Espelho no portal SEFAZ, e estão DENTRO do período atendido. Ou o robô não sincronizou, ou não foram transmitidas.
- [ ] **Validar impressão do relatório de Impostos a Pagar** — Ctrl+P na LUPO (84 competências) pra conferir quebra de página. Nenhuma tela desta sessão foi verificada visualmente (login bloqueia a sessão do Claude).

- [ ] **Corrigir credenciais do 220** (`.env.remote.used` inválido) para o deploy da sessão 13–14/09.

## Abertas em 14/09/2026

- [ ] **ReceitanetBX Serviço como fonte de DCTF/DCTFWeb/recibos** (2019–2026, todos os clientes) — ler `C:\Dev\march-cofre\docs\MANUAL-RECEITANETBX-SERVICO.md` antes de qualquer robô. Extensão do Chrome no e-CAC descartada para lote.
- [ ] **Varredura `FISCAL\DCTF` e `FISCAL\DCTFWEB` → `DctfWebDeclaracao`** usando `src/lib/dctf-pdf/`; nomes reais: `Impressão da Declaração - MMAAAA.pdf` (com/sem espaço) e `Recibo Declaracao MMAAAA.pdf`.
- [ ] **Deploy 220** — código + `prisma db push` (pastas do cliente, `pastaContabil`, `fonte` da ECF + unique novo, período de atendimento) + apagar exercício 2026 errado da Casa São Paulo lá.
- [x] ~~**`dctf-antiga/importarEVarrer.ts`** copia `.dec` para pasta com nome antigo (sem `pastaLocal`)~~ — resolvido em 19/09: `pastaLocal` virou campo obrigatório do `ClienteRef` e os 13 pontos que o omitiam foram corrigidos.
- [ ] **Conciliação de Impostos** lendo razões de `CONTABIL\<ANO>`.
- [ ] **Robô organizador + varredura do march-cofre** na estrutura nova (tarefa "March - Varredura Declaracoes Servidor" desabilitada) — sessões próprias.
- [ ] **Senha por pasta de cliente** — Higor define o que exige senha, quem cadastra e recuperação.

## Abertas em 27/09/2026 (Casa São Paulo — cliente-piloto)

- [ ] **`pastaContabil` da Casa São Paulo aponta para pasta que não existe** — está `...\CASA SAO PAULO CALCADOS LTDA\CONTABIL`; no modelo novo é `Dominio\Contabil` (ou a subpasta `Balancete`/`DRE`/`Razao`). Os outros 12 campos de pasta estão certos.
- [ ] **`Dominio\Fiscal\Giam` tem DCTF em PDF dentro, não GIAM** — 24 arquivos `Impressão da Declaração - MMAAAA.pdf` (2018 e 2019), com hash idêntico aos de `Declaraçoes\DCTF`. As GIAM do Domínio (`.r1`) não estão em nenhum lugar do `C:\PlataformaContabil`.
- [ ] **`Dominio\Contabil\ECD` vazia** — o Higor vai colocar. A ECD do Domínio de 2018 (`sped_balancetediario00180.txt`, 66 KB) está guardada em `_QUARENTENA\CASA SAO PAULO - duplicatas (19-09-2026)`.
- [ ] **Três DREs de 2019 com conteúdos diferentes** (`D. R. E. 2019.pdf`, ` -2`, ` -3`) sumiram na reorganização do Higor; anotado em `OBSERVAÇÃO\_A CONFERIR.md` do cliente.
- [ ] **EFD-Contribuições de 2019 só tem dezembro** — faltam 11 meses.
- [ ] **Código ainda grava no modelo de 13/09** (`CONTABIL\`, `FISCAL\SPED\`, `FISCAL\DOMINIO\`) — o modelo vigente é `Declaraçoes\<TIPO>\<ANO>` × `Dominio\Contabil|Fiscal\<TIPO>\<ANO>`. `destino.ts` (organizador) e `pastaTipoAno` (storage) precisam ser reapontados.
- [ ] **Migração dos outros clientes: PARADA por ordem do Higor** — Casa São Paulo é o piloto. Quando liberar, faltam 4 decisões que o modelo novo não cobre: onde ficam `RECIBOS` (44 clientes), `GUIAS` (2), `OUTROS` (18) e a GIAM em PDF (`ESPELHO-GIAM-MM.AAAA.pdf`, documento diferente do `.r1`).
- [ ] **Seis competências com GIAM quase vazia na SEFAZ** (07/2020, 05, 06, 08, 09 e 12/2024) — o SPED declara débito de R$ 114 mil a R$ 139 mil e a GIAM recepcionada traz R$ 1,7 mil a R$ 24 mil. É a causa do saldo credor de R$ 676 mil que a SEFAZ acumula e a escrituração não tem.
- [ ] **03/2024 com R$ 12,1 milhões de compras e R$ 12,3 milhões de vendas** — cerca de 21 vezes um mês normal, e SPED e GIAM declaram o mesmo valor. Não é divergência entre fiscos; falta o Higor dizer se investigamos a origem.
- [ ] **01/2019: saldo credor de R$ 8.093,89 só na GIAM da SEFAZ** — vem de 2018, que está fora do período de atendimento (começa 01/01/2019).
- [ ] **Relatório de divergências de ICMS não foi conferido na impressão** — Ctrl+P para validar quebra de página e o mapa do período em preto e branco.

## Ideias não implementadas

- [ ] **eSocial como fonte de pagamento** — FGTS não passa pelo e-CAC (é GRF / FGTS Digital). Decidido: entra na MESMA tela de Conciliação de Impostos, como mais uma fonte. Falta mapear o portal e escrever o robô. Higor sugeriu deixar acesso nativo no servidor de automação (certificado instalado lá) para o robô autenticar sem humano.
- [ ] **DARE estadual no confronto do ICMS** — o robô da SEFAZ já busca DARE; falta ligar na conciliação. Hoje o ICMS mostra o declarado na GIAM, com asterisco.
- [ ] **Anexo IV do Simples** — nele a CPP patronal sai do DAS e vira DARF próprio. `recolheSeparadamente` assume Anexo I–III.
- [ ] **Conta contábil no de-para do razão** — hoje o tributo vem do NOME do arquivo. Se um cliente tiver duas contas do mesmo tributo (a LUPO já tem: ICMS e ICMS DIFAL), as duas aparecem separadas, o que está certo, mas não há como marcar qual é a principal.

- [ ] **Aviso automático "PDF novo, reimporte"** — quando `mtime(balanco.pdf) > exercicio.updatedAt`, faixa amarela na tela com botão de reimportação um clique. Ideia aceita, sem prazo.
- [ ] **Ferramenta de vinculação plano de contas** — revertida em 10/08/2026 por matching ruim (código sequencial casava conta errada). Higor quer retomar com abordagem diferente.
- [ ] **Módulo Conciliação Estadual GIAM × Razão** — decisão antes de codar: GIAM vs SPED-Fiscal (Decreto TO 7.103/2026: GIAM obrigatória até 12/2026 pro Regime Normal, migra pra SPED-Fiscal em 01/2026).
- [ ] **Coluna SEFAZ pra difal / complementação de alíquota** — `GiamSefazApuracao` só grava `icmsARecolherNormal` (tipo N). Sem quebra por tipo, a integridade Domínio × SEFAZ do Simples não fecha: a linha principal dele (complementação) mostra "—" na coluna SEFAZ. Falta (a) ver um Espelho da GIAM de empresa do Simples pra saber o rótulo do campo no PDF, (b) campos `icmsComplementacao` / `icmsDifalEntradas` no schema, (c) extração no `sefazScraper`.
- [ ] **Parser do PDF do PGDAS-D** — layout já mapeado (memória `reference_layout_pgdasd_pdf`, validado com arquivo real 12/2023). PDF é texto puro, dá pra usar `pdf-parse` sem coordenadas. Extrair RPA (seção 2.1) pro confronto PGDAS × GIAM saídas, e a tabela de débito por tributo (seção 2.7) pro relatório de Impostos a Pagar. Fonte via SERPRO CONSULTIMADECREC14 (devolve o mesmo PDF em base64).
- [ ] **Conciliação Domínio × DEFIS (Simples)** — task #3 do relatório 08/08, ainda sem parser da DEFIS. Hoje o robô do Portal Simples só raspa a LISTA de transmitidas (data + recibo), não o conteúdo. Depende de ter o XML/recibo da DEFIS de um cliente real.

## Débitos técnicos

- [ ] `prisma db push` no 220 — tabelas novas `PgdasdDeclaracao`, `PgdasdSincronizacao`, `DasSimplesGuia` e campos `Cliente.pastaLocal` / `EcacPagamento.origem` aplicados só no Postgres local.
- [ ] Nenhuma das telas novas (PGDAS-D, Conciliação de Impostos) foi conferida visualmente pelo Higor — só por leitura de página.

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
