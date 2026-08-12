# Relatório da sessão — 12/08/2026

**Duração:** sessão longa. Foco: nova estrutura Balanço / Balancete / Razão + Contrapartida a partir do SPED-ECD, com base na biblioteca `march_sped.py` entregue pelo agente contábil externo do Higor.

---

## Contexto

O Higor tem outro agente que produziu:
1. `march_sped.py` — biblioteca Python completa de análise de SPED-ECD/ECF/EFD-Contribuições
2. `modulo_razao_contrapartida.py` — camada de API pro módulo Razão/Contrapartida
3. Especificação markdown e vários XLSX de exemplo

Nesta sessão portamos boa parte pra TypeScript e criamos as telas correspondentes na plataforma.

---

## O que ficou pronto

### 1. Bug fix inicial (start da sessão)
- `next.config.ts`: `serverActions.bodySizeLimit: "100mb"` (SPED-ECF era rejeitado pelo limite padrão de 1MB)
- Trocar `pastaSugerida` do VarrerPastaEcfButton pra usar `pastaCliente(...)/SPED-ECF` (pasta única) no lugar de `Cliente.pastaFiscal` legado

### 2. Design editorial da tela Conciliação Domínio × ECD (antiga)
- Tokens de cor oficiais da March no `globals.css` (brand-deep, brand-2 dourado mostarda, cremes, paper)
- Fontes via `next/font/google`: Fraunces (display) + Instrument Sans (body) + JetBrains Mono (numeric)
- Classes editoriais: `.eyebrow`, `.display`, `.meta-strip`, `.rule-gold`, `.status-panel`, `.notice`, `.ledger`, `.errata`, `.reclass`, `.chip-year`
- Balancete Hierárquico visual (Ativo → AC → contas nível 3), sem emojis, tipografia forte

### 3. FASE 1 — Balancete Comparado Sistema × ECD (por conta analítica)
- **Parsers TS** portados: `parsePlanoContas`, `parseSaldosAnuais`, `ecdInfo`, `agregarSinteticas`, `estruturaHierarquica`
- **Comparador plano** `compararBalancetes` + `resumirComparacao` em `src/lib/accounting/balanceteComparado.ts`
- **Tela** `/painel/clientes/[id]/balancete-comparado` com upload dos 2 SPEDs, meta strip, seletor de exercício, painel de status, drill-down expansível
- **Server action** de upload validando CNPJ + detectando ano do registro 0000
- Nova subpasta padronizada `SPED-ECD-DOMINIO\<ANO>\<ANO>.txt` no `filesystem.ts`
- Toolbar com filtro (Só divergentes / Todas as contas) + botão Imprimir (CSS @media print A4 paisagem) + botão Exportar Excel (ExcelJS com destaque de células divergentes, congela painéis, autofilter)

### 4. FASE 1.5 — Estrutura hierárquica de balancete
- `compararBalancetesHierarquico`: DFS agregando sintéticas via COD_CTA_SUP
- **Componente client** `BalanceteHierarquico` com 2 modos (`balanco` só SF, `balancete` completo com SI/Deb/Cred/SF)
- Coluna Status com badge simplificado em 2 estados (**OK** azul suave / **Divergente** vermelho suave) — internamente ainda classifica 5 tipos (SO_DOMINIO, SO_ECD, SINAL_INVERTIDO)
- **Regra de divergência por grupo:**
  - Patrimoniais (01/02/03): só SF diverge = divergente (reclassificação ≠ divergência)
  - Resultado (04): Deb/Cred acumulado OU SF diverge (porque SF zera no encerramento)
- **Promoção do PL como raiz visual** quando plano usa nat 02 pra PL (detecção heurística por descrição "PATRIMÔNIO LÍQUIDO")
- Ajustes visuais protegendo raízes/subgrupos de perder identidade quando divergentes

### 5. FASE 4 + 4.5 — Razão / Contrapartida
- **Parsers TS** `razaoConta` (I200/I250 pra tipo G, I300/I310 pra tipo B/R), `consultarLancamento`, `localizarContrapartida`, `statusEcd`
- **Rota antiga** `/balancete-comparado/razao/[codigo]` — 2 razões lado a lado (Sistema × ECD) com destaque em vermelho pras linhas que só existem num lado
- **Rota nova standalone** `/painel/clientes/[id]/razao-contrapartida` (a definitiva):
  - Selo verde/mostarda do tipo de escrituração (G/R/B)
  - Fonte fixa = ECD Transmitida (o Domínio local o contador já consulta)
  - 2 abas: **Por conta** (razão com contrapartida real em modo G ou provável em modo B/R) e **Por lançamento** (consulta pelo número — mostra n débitos × n créditos com validação de partida dobrada)
  - Modo diário mostra coluna "Contrapartida provável" com resultado do `localizarContrapartida` (heurística casamento débito×crédito mesmo dia/valor)
- Casos de teste validados: CASA SAO PAULO 2018 (tipo G) mostra razão completo da CAIXA GERAL com 9142 lançamentos e contrapartida real; consulta do lançamento #67980 traz 3 débitos (ICMS + multa + juros) × 1 crédito (Caixa) balanceado

### 6. Refatoração de arquitetura de módulos
**Motivação do Higor:** os botões dos módulos ficaram todos apinhados na tela do cliente. Correto é ter módulos no SIDEBAR (Fiscal / Contábil / Auditoria) e cada módulo tem sua página-índice que lista clientes.

- Novo componente reutilizável `src/components/ModuloClienteIndex.tsx` — lista clientes do escritório em cards + leva pra `/painel/clientes/[id]/{modulo}`
- **7 novas páginas-índice** no sidebar:
  - Fiscal: `/painel/sped-fiscal`, `/painel/pis-cofins`, `/painel/irpj-csll`
  - Contábil: `/painel/conciliacao-ecd`, `/painel/balanco`, `/painel/balancete`, `/painel/razao-contrapartida`
- **Tela do cliente simplificada** — removidos os grupos de módulos; ficou só cadastro/situação/arquivos + ações específicas (Adicionar documentos, Ver análise, Gerar relatório) + link discreto "editar cadastro"
- Sidebar em `src/app/painel/layout.tsx` expandido com os 7 links novos

### 7. Duas telas separadas (Balanço vs Balancete)
- **Balanço Comparado** (`/balanco-comparado`, `/painel/balanco`): só patrimoniais, 4 colunas (SF Sistema, SF ECD, Δ, Status)
- **Balancete Comparado** (`/balancete-comparado`, `/painel/balancete`): todas as contas + Resultado, 11 colunas (4 dimensões × 2 lados + Δ SF + Status)
- Nomenclatura: trocado "Domínio" por "Sistema" nos rótulos visíveis (mais genérico)

### 8. Confirmação pendente do dia anterior
- Higor confirmou que a Casa São Paulo 2018 fechou nível 3 na Conciliação ECD antiga — pendência da última sessão resolvida

---

## Arquivos criados/alterados

**Bibliotecas (`src/lib/`):**
- `ecd/balancete.ts` — parsers I050/I150/I155, agregação sintéticas, hierarquia
- `ecd/razao.ts` — razão por lançamento/dia, consultar_lancamento, localizar_contrapartida, statusEcd
- `accounting/balanceteComparado.ts` — comparador plano + hierárquico, resumo, promoção PL, status
- `storage/filesystem.ts` — novo tipo `SPED-ECD-DOMINIO`

**Componentes (`src/components/`):**
- `ModuloClienteIndex.tsx` — novo, listagem reutilizável de clientes

**Rotas (`src/app/painel/`):**
- `layout.tsx` — sidebar expandido
- `sped-fiscal/`, `pis-cofins/`, `irpj-csll/`, `conciliacao-ecd/`, `balanco/`, `balancete/`, `razao-contrapartida/` — 7 páginas-índice novas
- `clientes/[id]/page.tsx` — simplificada, sem módulos
- `clientes/[id]/balanco-comparado/page.tsx` — novo
- `clientes/[id]/balancete-comparado/` — página + actions.ts + 3 componentes
- `clientes/[id]/balancete-comparado/razao/[codigo]/page.tsx` — rota antiga (razão comparado 2 lados)
- `clientes/[id]/razao-contrapartida/` — página + 2 componentes (nova, definitiva)

**Estilos:**
- `src/app/globals.css` — reescrito com paleta March + classes editoriais + tabelas hierárquicas + badges de status + CSS de impressão + estilos do balancete completo

**Config:**
- `src/app/layout.tsx` — fontes via next/font
- `next.config.ts` — bodySizeLimit 100mb pros Server Actions

---

## O que ficou faltando (tasks pending)

- **#2 FASE 2** — Divergências enriquecidas + quebra de código (Jaccard tokens ≥ 4 chars ≥ 0.5 pra identificar pares que se anulam entre 2 códigos, ex.: ADIDAS #529 e ADIDAS #997)
- **#5 FASE 5** — Matriz de Obrigações Acessórias + auditoria de consistência (matriz_obrigacoes + regime_efd_contrib + regime_ecf + auditar_consistencia_declaracoes do march_sped.py)
- **#8** — Trocar link "Ver razão comparado desta conta" no drill-down do Balancete pra apontar pra `/razao-contrapartida` (nova) em vez da rota antiga
- **#9** — Adicionar coluna Status no Excel export do Balancete
- **#10** — Excel export do Balancete precisa migrar pra `compararBalancetesHierarquico` (hierárquico) + incluir Resultado

---

## Aprendizados salvos como memória

- `project_arquitetura_modulos_sidebar.md` — módulos no sidebar, tela do cliente = só cadastro
- `reference_march_sped_biblioteca.md` — mapa completo das funções Python → TS
- `project_balanco_vs_balancete.md` — 2 telas com regras diferentes por natureza
- `project_razao_fonte_ecd_transmitida.md` — Razão só usa ECD, não Domínio local
- `reference_ecd_tipos_g_r_b.md` — tipos de escrituração e o que a plataforma consegue extrair de cada
- `project_paleta_march_oficial.md` — cores e fontes oficiais
- `project_promocao_pl_como_raiz.md` — heurística pra PL escondido dentro do Passivo
- `feedback_analise_balanco_ate_nivel_3.md` — atualizada esclarecendo que a regra vale só pra análise macro; Balancete novo desce até analíticas

---

## Onde retomar amanhã

**Primeira coisa:** validar visualmente o menu do sidebar novo + tela do cliente simplificada (o Higor não abriu a página do cliente depois da refatoração; só validou o Razão / Contrapartida no `/painel/clientes/[id]/razao-contrapartida`). Pode ter algum ajuste visual.

**Próximas fases naturais** (ordem sugerida):
1. **Task #8** — trocar link do drill-down (5 min)
2. **Task #10** — Excel do Balancete hierárquico + Resultado (30 min)
3. **Task #9** — coluna Status no Excel (10 min)
4. **FASE 2** — quebra de código + divergências enriquecidas (2-3h)
5. **FASE 5** — Matriz de Obrigações + auditoria de consistência (2-3h)

**Ou:** o Higor vai usar a ferramenta no escritório amanhã. Se aparecer bug/ajuste durante uso real, esses viram prioridade sobre as fases pendentes.

---

## Adendo (fim da sessão — depois do primeiro checkpoint)

Ainda saíram mais 3 commits depois do checkpoint inicial:

**`750856f`** — file picker automático + varredura de pasta
- Botão "Escolher/Substituir arquivo" abre o file picker do sistema (era só texto sem ação)
- Nova aba "Varrer pasta": aponta caminho local, plataforma lê todos .txt/.ecd/.sped e importa
- Bloco de status do arquivo carregado deixa de parecer input editável

**`2b603c5`** — fix agregação de sintéticas + cache
- Bug: quando plano do Sistema e ECD Transmitido têm hierarquias DIFERENTES (uma analítica que é filha de CLIENTES no Sistema mas de DUPLICATAS A RECEBER no ECD), agregação com plano unificado zerava a sintética no lado errado
- Fix: cada lado agrega com seu próprio plano; estrutura de exibição continua unificada
- `revalidatePath` reforçado pra invalidar cache de todas as telas ao substituir arquivo

**`679043a`** — tentativa de layout compacto (revertido depois)
- Colunas sticky, full-width, colunas compactadas — Higor não gostou visualmente

**`82c225a`** — REVERT do 679043a
- Voltou pra `max-w-6xl` e CSS original do balancete
- A tabela tem scroll horizontal natural

**`7c485a3`** — CSS de impressão como relatório contábil profissional
- Times New Roman, bordas cheias, sem cores (economiza tinta)
- Cabeçalho institucional centralizado, thead repete em cada página, page-break-inside: avoid nas linhas

**Status final da sessão:** Higor reportou "está horrível" mas não conseguiu apontar exatamente o problema. Foi dormir. Próxima sessão precisa começar perguntando OBJETIVAMENTE:
- Qual tela específica (Balanço/Balancete/Razão) está ruim
- Se é a tela web, a impressão, ou o Excel
- Print com anotação apontando o ponto

Sem essa info, evitar tentar consertar às cegas — dá churn (foi o que rolou nos últimos commits do dia).
