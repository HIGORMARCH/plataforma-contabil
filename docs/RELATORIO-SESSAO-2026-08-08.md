# Relatório da Sessão de Desenvolvimento — 07-08/08/2026

**Cliente de referência:** CASA SAO PAULO CALCADOS LTDA (CNPJ 37.417.896/0001-19)
**Plataforma:** March Contabilidade — Auditoria e Análise de Demonstrações
**Executor:** Claude (par de programação do Higor)

---

## 1. Diagnóstico inicial — Auditoria da Casa São Paulo

### 1.1 Balanço patrimonial (Domínio × ECD)
Extraímos, importamos e cruzamos os balanços de 2019 a 2023 do Domínio contra os SPED-ECD transmitidos à Receita.

| Ano | Situação encontrada |
|---|---|
| 2019 | Domínio e ECD idênticos. Zero divergência crítica. |
| 2020 | Divergências pequenas (~R$ 400-1.000 em fornecedores/receber). Reclassificação de R$ 100 mil PNC↔PL. |
| **2021** | **DIVERGÊNCIA GORDA — R$ 2,4 mi de ativo, R$ 2,4 mi de passivo circulante. Resultado difere em R$ 36,7 mil.** |
| 2022 | Divergências pequenas + o mesmo R$ 100k PNC↔PL. |
| 2023 | SPED-ECD ainda não transmitida. |

**Padrão sistemático detectado:** R$ 100.259,90 aparece em TODOS os anos como `PNC.outros` na ECD mas como `PL.lucrosAcumulados` no Domínio. Provavelmente uma conta de empréstimo de sócios que o Domínio reclassificou como parte do PL. Decisão contábil consistente mas divergente do que foi transmitido.

### 1.2 Balanço 2023 — 3 apontamentos críticos gerados pela plataforma
- **APURACAO_NAO_FECHADA** (crítico) — Resultado líquido = R$ 0,00 com receita bruta de R$ 7,3 mi → apuração do exercício não integralizada na origem.
- **ESTOQUE_CRESCE_CMV_CAI** (crítico) — Estoque cresceu 26% (R$ 8,7 mi → R$ 10,9 mi) enquanto CMV caiu 33% (R$ 5,7 mi → R$ 3,8 mi) → CMV não integralizado no exercício.
- **PL_NAO_EVOLUI** (atenção) — PL de 2023 difere em R$ 216 mil do esperado (PL 2022 + resultado 2023).

### 1.3 PIS/COFINS 2021 — DCTFWeb × SPED-Contribuições

Ao consultar a DCTFWeb real via Integra Contador SERPRO:

- **Jan-Abr/2021** → SERPRO respondeu "sem declaração". Explicação: nesse período era **DCTF antiga** (`.dec` via PGD DCTF Mensal), não DCTFWeb.
- **Mai-Dez/2021** → 8 declarações DCTFWeb transmitidas, TODAS `indZerada=1` (sem movimento).
- **SPED-Contribuições** → tem débitos reais (~R$ 5-9k PIS + R$ 22-40k COFINS por mês), todos compensados por créditos → saldo zero.

Confirmado no eCAC (Cópia de Arquivo de DCTF): a competência Jan/2021 aparece com débito PIS código 6912-01 = R$ 1,00 e crédito vinculado R$ 1,00 (padrão histórico "declaração sem movimento").

**Diagnóstico contábil:** a Casa São Paulo transmitiu a DCTFWeb como "sem movimento" (padrão 1/1/0 ou `indZerada=1`) apesar do SPED ter movimento real apurado. **É declaração inexata** (art. 32 Lei 9.430/96). O correto seria informar débito real + crédito real, mesmo que o saldo feche em zero.

---

## 2. O que ficou pronto na plataforma

### 2.1 Motor de validação contábil (5 novas regras)
Arquivo: `src/lib/accounting/validation.ts`

| Código | O que detecta | Severidade |
|---|---|---|
| `APURACAO_NAO_FECHADA` | Receita > R$ 100k com resultado zerado | Crítico |
| `ESTOQUE_CRESCE_CMV_CAI` | Estoque +>10% com CMV -%>10% entre anos | Crítico |
| `PL_NAO_EVOLUI` | Diferença >5% entre PL calculado e informado | Atenção |
| `MARGEM_BRUTA_ANOMALA` | Variação >20 pontos percentuais entre anos | Atenção |
| `SALDO_INVERTIDO` (expandida) | Ativo com saldo credor ou passivo com devedor | Atenção |

### 2.2 Conciliação Domínio × ECD (Lucro Real/Presumido)
- Parser SPED-ECD bloco J (`src/lib/ecd/parseSpedEcd.ts`) — J005/J100/J150
- Comparador (`src/lib/accounting/conciliacaoEcd.ts`)
- Tela dedicada (`/painel/clientes/[id]/conciliacao-ecd`) com quadro comparativo e destaque de divergências críticas
- Diferenciação LAIR × Lucro Líquido (novo campo `dre.resultadoAntesTributos`) + validação cruzada `LAIR_MENOS_TRIBUTOS`

### 2.3 Integra Contador REAL (SERPRO Integra Contador via API oficial)
- Substituído mock por chamada mTLS real
- Serviço: `CONSXMLDECLARACAO38` (retorna XML estruturado com débitos e créditos vinculados)
- Suporta os dois métodos de acesso: procuração da March e certificado próprio do cliente
- Categoria correta: `GERAL_MENSAL`

### 2.4 Painel PIS/COFINS reformulado
- Layout: cabeçalho em dois níveis, Débito + Crédito + Saldo (com indicador D/C) por trib, coluna Divergência
- Duas tabelas empilhadas: PIS em cima, COFINS embaixo
- Alertas de topo:
  - `⚠ SPED transmitido VAZIO`
  - `⚠ SPED apurou ZERO mas DCTFWeb confessou DÉBITO`
  - `ℹ SPED em zero com DCTFWeb NEGATIVA` (retificação/estorno)
  - `⚠ DCTFWeb INEXATA` (padrão 1/1/0 vs SPED com movimento)
- Aviso quando dados são MOCK (evita usar valores fictícios como base de auditoria)

### 2.5 Totalizadores em tempo real no formulário de exercício
No form de importação de balanço, subtotais por grupo + TOTAL DO ATIVO + TOTAL PASSIVO+PL + linha de CONFERÊNCIA (semáforo verde/vermelho). Atualiza enquanto o contador digita.

### 2.6 Storage local (arquitetura de fonte única)
Nova arquitetura: `C:\PlataformaContabil\<CLIENTE>\<TIPO>\<ANO>\<PERIODO>.<ext>`

- 105 arquivos da Casa São Paulo migrados pra pasta única
- Parsers refatorados pra ler somente de lá (ECD, SPED-Contribuições, DCTF antiga, Balanço PDF)
- Regra: plataforma **nunca** modifica arquivo no servidor de terceiro; opera exclusivamente na cópia local
- Card na home do cliente mostrando inventário por tipo de documento

---

## 3. Descobertas técnicas importantes (memória do projeto)

Todas salvas na memória persistente pra referência futura:

1. **Layout SPED-ECD bloco J** — armadilha do CAMPO 10 do J150 (valor do período está no CAMPO 10, não no CAMPO 8; SEMPRE pegar CAMPO 10).
2. **DCTF valor simbólico 1/1/0** — a DCTF antiga não aceitava transmissão zerada; o padrão R$1/R$1/R$0 é assinatura de "sem movimento" protocolar. Combinado com SPED com movimento = declaração inexata.
3. **Matriz DCTFWeb — estados × ações corretivas** — a plataforma não só detecta, sugere: FAZER declaração, RETIFICAR, TRANSMITIR pendente.
4. **Fonte única de arquivos em C:\PlataformaContabil** — plataforma opera SÓ na cópia local; nunca mexe em servidor de terceiro.
5. **Escala de uso** — plataforma pra suporte/auditoria do dono do escritório, não SaaS multi-tenant. Simplicidade > perfeição.

---

## 4. Ficou faltando

### 4.1 Ações contábeis pendentes na Casa São Paulo

Estas são AÇÕES QUE O HIGOR PRECISA EXECUTAR no Domínio e no eCAC (não é código):

**Balanço 2019**
- [ ] Verificar por que "Obrigações Trabalhistas" tem saldo devedor de R$ 200,03 (provável INSS a compensar mal classificado).

**Balanço 2023**
- [ ] Fechar a apuração do exercício no Domínio (resultado R$ 0 com receita R$ 7,3 mi é erro).
- [ ] Verificar lançamento que jogou "Tributos a Recuperar" pra credor (R$ 567 mil).
- [ ] Checar movimentação do PL: 216 mil não batem entre 2022 e 2023 (dividendo? aporte?).

**DCTFWeb 2021 (Mai-Dez)**
- [ ] Retificar 8 declarações que foram transmitidas como "sem movimento" (`indZerada=1`) enquanto o SPED-Contribuições tem apuração real.
- [ ] Investigar declarações "em andamento" que apareceram no SERPRO — provavelmente pendentes de transmissão.

**DCTF antiga 2021 (Jan-Abr)**
- [ ] Baixar os 4 `.dec` do eCAC → serviço "Cópia de Arquivo de DCTF" (id=3).
- [ ] Importar pela plataforma via "🗂️ Varrer .dec e importar" (parser existente popula automático).

**PL vs ECD (todos os anos)**
- [ ] Decidir se o R$ 100.259,90 que aparece como PNC.outros na ECD e PL.lucrosAcumulados no Domínio será reclassificado num dos dois sistemas pra unificar.

### 4.2 Features pendentes da plataforma (tasks abertas)

| # | Task | Bloqueio |
|---|------|----------|
| #3 | Conciliação Domínio × DEFIS (Simples Nacional) | Precisa cadastrar cliente Simples + ter XML de DEFIS pra usar de referência |
| #11 | Agente Ctrl+C/Ctrl+V (plus comercial) | Feature futura — plus cobrável na venda do produto pra outros escritórios |
| #12 | Robô .dec do eCAC (Fase 4 do storage) | Sessão específica: Higor logado no eCAC + autorização por iteração + tratamento de CAPTCHA. Já preparei o mapa técnico (iframe frmApp, cboExercicio, periodo 3001-3012), falta executar em sessão dedicada. |

### 4.3 Onde retomar na próxima sessão

**Prioridade 1** (rápido): terminar de ajustar a Casa São Paulo no Domínio conforme lista 4.1. A plataforma vai revalidar automaticamente depois.

**Prioridade 2**: Task #12 — sessão de download automatizado dos `.dec` do eCAC pra completar Jan-Abr/2021 no cruzamento SPED×DCTF.

**Prioridade 3**: Task #3 — quando tiver cliente Simples pra usar de piloto.

---

**Arquivos-chave modificados nesta sessão (não commitados ainda):**
- `src/lib/accounting/validation.ts`
- `src/lib/accounting/conciliacaoEcd.ts` (novo)
- `src/lib/ecd/parseSpedEcd.ts` (novo)
- `src/lib/serpro/client.ts` (`consultarDctfWeb`)
- `src/lib/serpro/dctfwebClient.ts` (mock → real + parser XML)
- `src/lib/serpro/dctfweb.ts` (isolamento por competência)
- `src/lib/storage/filesystem.ts` (novo — módulo storage local)
- `src/lib/sped-contribuicoes/varrerPasta.ts` (cópia pra pasta única)
- `src/lib/dctf-antiga/importarEVarrer.ts` (cópia pra pasta única)
- `src/app/api/extrair-pdf/route.ts` (salva PDF na pasta única)
- `src/app/painel/clientes/[id]/conciliacao-ecd/page.tsx` (nova tela)
- `src/app/painel/clientes/[id]/pis-cofins/page.tsx` (layout novo + alertas)
- `src/app/painel/clientes/[id]/exercicios/page.tsx` (totalizadores)
- `src/components/TotalizadoresBalanco.tsx` (novo)
- `src/components/CardPastaUnica.tsx` (novo)
- `src/components/ExtrairPDF.tsx` (aceita clienteId)
- `.env` (SERPRO_DCTFWEB_MODE=real)

**Testes:** 61 passando, 0 erros de tipagem.
