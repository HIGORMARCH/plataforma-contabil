# Plataforma Contábil March — Briefing

**Diretório:** `C:\Dev\plataforma-contabil`
**Dono:** Higor Noleto — March Contabilidade (Palmas/TO)
**Stack curta:** Next.js 16, React 19, TypeScript, Prisma 6, PostgreSQL
**Perfil:** self-hosted por escritório (não SaaS multi-tenant). Poucos usuários por instância. Simplicidade > perfeição.

---

## O que é

Plataforma interna da March pra auditoria contábil, fiscal e conciliação de obrigações acessórias. Roda no PC do dono do escritório, atende à rotina de conferência que hoje é manual.

Instância única por escritório — pensada pra ser replicada comercialmente (Higor quer transformar em receita corrente pra outros escritórios), mas construção atual não paga custo de multi-tenant.

## Módulos principais

- **Cadastro de clientes** — CNPJ, regime tributário, exercícios, plano de contas
- **Conciliação Domínio × ECD** (Balanço Patrimonial + DRE por nível 3)
- **Auditoria de Obrigações Acessórias** (motor de dados fiscais)
- **Análise de Demonstrações** (indicadores contábeis)
- **DCTFWeb × SPED** (matriz de ações corretivas)
- **Conciliação Estadual GIAM × Razão** (v1: só ICMS próprio, sem ST)
- **Integra Contador** (integração RFB pra PGDASD/DCTFWEB/CAIXAPOSTAL/CCMEI)

## Fluxo de auditoria em cascata

Fiscal → Folha → Contábil. Contábil só sobe com fiscal fechado. Contábil bem feito descobre erros do fiscal e da folha.

Ver `arquitetura.md` seção "Fluxo em cascata".

## Regras invioláveis (feedback do dono)

1. **Não abrir arquivos com senhas em texto puro** — planilhas/txt com credenciais. Pedir descrição verbal.
2. **Não armazenar arquivos originais** — SPED/PDF/HTML são lidos, extraídos, descartados. Só dados no banco.
3. **Parser importa FIEL, aponta incoerência via alerta** — nunca "conserta" nem adivinha. Contador decide.
4. **Análise de balanço até nível 3** — nunca descer nas analíticas em conciliação/indicadores.
5. **Reclassificação ≠ divergência** — se subgrupo bate mas subconta muda = reclassificação. Só chamar divergência se saldo total diverge.
6. **Regerar deleta cache das descendentes** — `revalidatePath(path, "layout")`, não só raiz.
7. **Fonte única em `C:\PlataformaContabil\<CLIENTE>_<CNPJ>\<TIPO>\<ANO>\`** — plataforma NUNCA mexe em servidor de terceiro (Z:\, ReceitanetBX, Domínio). Sempre opera em cópia local.

## Checklist obrigatório de fechamento de sessão

Quando Higor sinalizar fim de sessão ("vamos fechar", "boa noite", equivalente), executar TUDO antes da despedida:
1. Executar checklist visível item por item (não pular)
2. Gerar `docs/RELATORIO-SESSAO-<YYYY-MM-DD>.md` (diagnóstico + o que ficou pronto + o que faltou)
3. Fazer commit (não precisa pedir — é implícito no fechamento)
4. Só depois mandar mensagem final "onde retomar"

Detalhe completo em `~/.claude/CLAUDE.md` global do Higor.

## Última sessão (13–14/09/2026)

Pastas do cliente no modelo do Higor, telas por ano e ECF completa.

- **Pastas:** `C:\PlataformaContabil\<NOME>` (sem CNPJ), `CONTABIL\<ANO>`, `FISCAL\SPED|DOMINIO\<TIPO>\<ANO>`, `FISCAL\DCTF\<ANO>`, `FISCAL\DCTFWEB\<ANO>`. Cadastro ganhou "Pastas do cliente"; as telas leem de lá.
- **Balanço/DRE do Domínio** importa fiel ao impresso; tela Ativo | Passivo | DRE com conferência do resultado no PL.
- **ECF:** Lucro Real, SPED transmitido × Domínio, retificadora vigente = última entrega.
- **IRPJ/CSLL, ICMS e PGDAS-D por ano.** Leitores de PDF da DCTF Mensal e do recibo DCTFWeb prontos (sem varredura ainda).
- **Regras novas:** só fazer o que o Higor manda; documento estranho → mostrar e perguntar; escopo 2019–2026; ver o que já existe (ReceitanetBX Serviço, march-cofre) antes de construir coleta.
- **Atenção:** schema aplicado só no local; deploy no 220 pendente (credenciais inválidas).

Ver `docs/RELATORIO-SESSAO-2026-09-14.md`.

## Sessão anterior (02/09/2026)

Organizador de documentos: quarentena de 953 para ZERO, e a pasta de cada
cliente reestruturada em três grupos.

- **Estrutura nova** — `DECLARAÇÕES` (o que foi declarado), `GUIAS` (o que foi
  pago), `RAZÃO` (o que a conciliação compara), `OUTROS` (o resto). Feita para
  o painel de obrigações varrer o disco. O mapa vive em `destino.ts` E em
  `pastaTipoAno` (storage/filesystem.ts) — os dois têm que concordar, senão a
  tela procura onde o robô não gravou.
- **25 tipos reconhecidos** (eram 15): GPS, GRF/FGTS, GFIP/SEFIP, DARE, DEFIS,
  livro fiscal, dossiê do e-CAC, apuração de ICMS/IPI, recibo `.REC`.
- **Erros corrigidos que já tinham arquivado errado:** 182 recibos com nome
  trocado, 46 SPED na empresa errada (o CNPJ vinha da transportadora citada no
  corpo), 18 documentos de folha com a competência lida da versão do programa.
- **Regra nova:** conteúdo diferente disputando o mesmo nome não some — vira
  ` -2` e uma nota em `OBSERVAÇÃO\_A CONFERIR.md` na pasta do cliente.
- **Achado que exige decisão:** duas GPS de 03/2019 da New Office com R$ 910,53
  e R$ 899,84 — guia recalculada, não cópia.

Ver `docs/RELATORIO-SESSAO-2026-09-02.md`.

## Sessão anterior (29/08/2026)

Conciliação de impostos: o razão contábil entrou na plataforma, e dois bugs que
mostravam número errado na tela foram corrigidos.

- **Conciliação de Impostos** (menu Contábil, era "Conciliação Estadual em construção") — nove tributos, razão × declarado × pago, por competência. A tela mostra números; divergência é botão à parte.
- **Razão do Domínio** — pasta `RAZAO` no cliente, um PDF por tributo, o NOME do arquivo é o de-para. Parser por coordenadas: 1.768 lançamentos nos 6 razões da LUPO, saldo corrido conferindo com o impresso em todos.
- **PGDAS-D via SERPRO** (CONSULTIMADECREC14) + guias do DAS + Comprovantes de Arrecadação da Receita lidos da pasta.
- **Bug grave corrigido:** a tela mostrava a RECEITA BRUTA como total do DAS (R$ 5,9 mi na LUPO). O certo são R$ 466.934,18. Agora os oito tributos mandam e o total impresso é só conferência.
- **Bug do e-CAC corrigido:** exigia o caminho legado do `.pfx` em disco quando o certificado já vive cifrado no banco — bloqueava os três clientes.
- **Achado:** contas "a recolher" com saldo devedor (Simples 36k, INSS 16k, FGTS 12k), com o mesmo pagamento lançado duas vezes.
- **Regra nova:** Simples não recolhe IRPJ/CSLL/PIS/COFINS à parte. Ver memória `reference_simples_tributos_dentro_do_das`.

Manual de condução em `MANUAL_CONCILIACAO_IMPOSTOS.md` (formato do MarchERP).
Ver `docs/RELATORIO-SESSAO-2026-08-29.md`.

## Sessão anterior (16/08/2026 — noite)

Primeira empresa do Simples na base (LUPO QUIOSQUE) revelou que a auditoria de ICMS não enxergava o regime:

- **Auditoria ciente do regime** — no Simples não existe ICMS normal (está no DAS); o destaque virou **Complementação de Alíquota** (tipo C do Segmento E), com difal em linha própria. `src/lib/regime.ts`.
- **Relatório de Impostos a Pagar** (novo módulo, menu Contábil) — consolida GIAM/SPED/DCTFWeb/ECF com total por declaração, sem total geral (o mesmo tributo aparece em duas fontes). Imprime com papel timbrado e coluna "Conferido" pra conciliação bancária.
- **Período de atendimento do cliente** — 4 campos novos em `Cliente`; guard nos 3 robôs (SERPRO, Portal Simples, SEFAZ) pra não consultar portal fora do período, e telas marcam "fora do período" em vez de lacuna.
- **Descoberta:** PGDASD do SERPRO só devolve PDF em base64, não tem JSON com valores. Mas o PDF é texto puro e já foi mapeado — ver memória `reference_layout_pgdasd_pdf`.
- **Atenção:** `.env` de dev aponta pra `localhost:5432`, não pro 220. A migration foi aplicada só no local.

Ver `docs/RELATORIO-SESSAO-2026-08-16.md` (seção "Sessão 2").

## Sessão anterior (16/08/2026 — manhã)

- **Backup diário do banco (Postgres do 220)** implementado — task local dentro do 220 rodando 20:30 diária, dump em `C:\Aplicacoes\backups-postgres\` (VOECLOUD replica off-site). Retenção 3 dias. Ver `docs/RELATORIO-SESSAO-2026-08-16.md`.
- `.gitignore` reforçado — bloqueia `/backups/`, `/dumps/`, `*.dump` (commit `4e33c24`).
- **Regra nova (feedback):** uma sessão do Claude por aplicação. Nada de misturar MarchERP + Plataforma + robô Onvio na mesma conversa. Ver `~/.claude/projects/.../feedback_uma_sessao_por_aplicacao.md`.

**Ação do Higor pendente (herança da 10/08):** reimportar 2018 Casa São Paulo pela UI pra validar os fixes de conciliação nível 3.

## Sessão anterior (10/08/2026)

- Revert da ferramenta de vinculação plano de contas (matching por código sequencial fazia conta errada bater)
- Revert da aba "Contas divergentes" da conciliação (mesmo motivo)
- Conciliação Domínio × ECD reescrita em formato hierárquico (raiz → subgrupo → nível 3)
- Fix parser: reconhece `2.3.2 RESERVAS DE CAPITAL` como sintética própria
- Fix cache: `revalidatePath(path, "layout")` invalida descendentes
- Balanço 2018 Casa São Paulo (CNPJ 37.417.896/0001-19) alinhado nível 3 após reclassificações no Domínio

## Onde buscar o resto

- `arquitetura.md` — camadas, contratos, stack detalhada
- `escopo.md` — o que faz / o que NÃO faz
- `pendencias.md` — o que ficou pra fazer + ideias pendentes
- `decisoes.md` — decisões arquiteturais com data e motivo
- `glossario.md` — termos do domínio contábil-fiscal
- `AGENTS.md` (raiz do projeto) — instruções técnicas do Next.js 16
- `docs/RELATORIO-SESSAO-*.md` — histórico detalhado por dia
