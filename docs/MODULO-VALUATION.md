# Módulo Valuation — Múltiplos de Mercado

Módulo da plataforma-contábil pra calcular o valor de uma empresa por **múltiplos de
mercado**, com **inputs manuais**. Saída: **dashboard interativo + PDF** (identidade March).

## Decisões (Higor, 02/07/2026)
- Vive **dentro da plataforma-contábil** (reaproveita base, IA e kit de relatórios).
- Método: **múltiplos de mercado** (EV/EBITDA, EV/Receita, P/L).
- Dados **adicionados manualmente** (não puxa de sistema).
- Saída: **dashboard ao vivo + PDF pro cliente**.

## Fonte dos dados (Higor 02/07 — foco em clientes do Simples Nacional)
A maioria dos clientes é **Simples Nacional** — não têm DRE com EBITDA pronto. Então:
1. **PDF da Declaração do Simples Nacional** (upload) → **extrair o faturamento/receita bruta**
   do período. Reusar `src/app/api/extrair-pdf`. (Confirmar qual doc: PGDAS-D mensal, extrato
   anual, ou DEFIS. Ideal: aceitar 12 meses de PGDAS ou o extrato anual → receita 12 meses.)
2. **% de lucratividade** (manual) → **lucro estimado = faturamento × %**. Substitui o
   EBITDA/lucro que o Simples não separa.
3. **Inventário do imobilizado** (manual) → lista de bens (descrição + valor) → **total do imobilizado**.

## Inputs manuais
**Dados da empresa** (cabeçalho/relatório): razão social, CNPJ, setor, data-base.
**Faturamento:** extraído do PDF do Simples (ou digitado se preferir).
**% de lucratividade:** manual → gera o **lucro estimado**.
**Inventário do imobilizado:** tabela manual (item + valor) → total.
**Dívida líquida** (opcional): Dívida − Caixa.

**Premissas — múltiplos** (digita; faixa min–max por múltiplo):
- Múltiplo sobre **lucro estimado** (tipo P/L, ex.: 3x a 5x pra PME)
- **EV/Receita** (ex.: 0,4x a 0,8x pra varejo pequeno)
- (opcional) sugerir faixa de referência por setor

## Fatores qualitativos → prêmio/deságio (Higor tem esses dados)
Ajustam o valor final pra cima/baixo (é o "goodwill"/intangível da empresa). Cada um vira uma
nota que soma num **prêmio/deságio total (% limitado, ex.: ±25%)** aplicado ao valor recomendado:
- **Tempo de mercado** (anos) — mais tempo = mais consolidada = prêmio.
- **Nº de funcionários** — porte/estrutura.
- **Carteira de clientes** — quantidade e recorrência = valor de relacionamento.
- (deixar o Higor ajustar o peso/prêmio; documentar tudo no PDF como premissas.)

## Defaults assumidos (Higor confirma/corrige)
- **Doc do Simples:** aceitar PGDAS-D (soma 12 meses) **e** extrato anual/DEFIS. Extração tenta os dois.
- **Imobilizado:** entra como **PISO** de valor (o valor não fica abaixo dos bens) — conservador,
  o mais comum pra PME. Configurável pra "somado" ou "método à parte" na tela.

## Cálculo
1. **Lucro estimado** = Faturamento (do PDF) × % de lucratividade.
2. Para cada múltiplo → **Equity Value**:
   - **Múltiplo sobre lucro:** Equity = múltiplo × Lucro estimado
   - **EV/Receita:** EV = múltiplo × Faturamento → Equity = EV − Dívida Líquida
3. Faixa min–max de cada múltiplo → **faixa de valor** [mínimo, máximo] por método.
4. **Valor recomendado** = mediana (ou média) dos pontos médios dos métodos.

### Como entra o imobilizado (DECISÃO A CONFIRMAR com o Higor)
O total do inventário do imobilizado pode entrar de 3 formas — definir qual (ou combinar):
- (a) **Piso de valor:** o valor da empresa não pode ser menor que o imobilizado líquido
  (garante que o valor ≥ o que ela tem em bens).
- (b) **Somado ao equity:** valor = (múltiplo × lucro) + imobilizado (útil quando o bem
  não gera o lucro, ex.: imóvel próprio à parte da operação).
- (c) **Método patrimonial de referência:** mostra o imobilizado como um método à parte
  na comparação (football field), sem misturar com os múltiplos.

Exibir sempre **EV** e **Equity** separados, e o valor por **quota/sócio** se informado.

## Dashboard (tela)
- Coluna esquerda: formulário de inputs (métricas + múltiplos com sliders min/max).
- Coluna direita: cards de resultado (EV, Equity, faixa) + gráfico **"football field"**
  (barra horizontal por método mostrando a faixa) recalculando **ao vivo**.
- Botão **"Gerar PDF"**.

## PDF (entrega ao cliente)
- Cabeçalho March (dourado/preto — puxar identidade da [[march-identidade-visual]]).
- Seções: dados da empresa · premissas (múltiplos usados) · resultado por método (tabela)
  · faixa de valor (gráfico) · **valor recomendado** · nota metodológica/disclaimer.
- **Reusar** `@react-pdf/renderer` e o padrão de `src/app/api/relatorios/[id]/pdf`.

## Onde encaixar no código (a confirmar na sessão da plataforma)
- Rota nova: `src/app/valuation` (página/dashboard) + `src/app/api/valuation/...`.
- Componente de cálculo puro (testável): `lib/valuation/multiplos.ts` — recebe inputs, devolve
  EV/Equity/faixa. Zod pra validar inputs.
- Persistir com Prisma se quiser salvar cenários (opcional no MVP).
- Reusar o gerador de PDF já existente.

## 🤖 Integração de IA (Higor 02/07 — "já com a IA integrada")
**Arquitetura de ouro: cálculo DETERMINÍSTICO + IA que só REDIGE.** A IA nunca inventa número —
o motor (`lib/valuation/multiplos.ts`) calcula tudo (receita, lucro, faixas, prêmio, cenários) e
passa os números prontos pra IA, que escreve a **análise em prosa profissional** em cima deles.
Reusar a **Claude API** que a plataforma já tem (mesma infra de `relatorios/[id]/revisao-critica`).

**O que a IA gera** (recebe JSON com os números + inputs qualitativos → devolve texto):
- Síntese executiva
- Leitura de ciclo (interpreta a trajetória: pico atípico, normalização, resiliência)
- Texto dos direcionadores de valor / moat (licenças, longevidade, carteira)
- **Cenário decisório** (vender agora vs. segurar) — a narrativa do custo de oportunidade
- Recomendação técnica

**Guard-rails:** a IA recebe os valores já calculados e é instruída a NÃO alterar números, só
interpretá-los; validar (zod) que o texto não contradiz os cálculos. Tom: parecer técnico-contábil,
sem emojis no PDF final, linguagem de consultoria.

**Saída visual = template PRONTO E PROVADO:** `docs/templates/parecer-valuation-REFERENCIA.html`
(o parecer da New Office, feito à mão, é o alvo exato do render). Reaproveitar esse HTML como
template: hero escuro + logo March dourada + Fraunces/Hanken + faixa de indicadores + gráfico SVG
da trajetória + tabela de múltiplos + quadro de cenários + recomendação. Gerar PDF (o @react-pdf
já existe, ou HTML→PDF headless como foi feito no protótipo).

**Fluxo do usuário:** upload PDF Simples → extrai faturamento (api/extrair-pdf) → preenche
lucratividade %, imobilizado, fatores qualitativos, múltiplos → **motor calcula** → **IA redige** →
preview do parecer → gera PDF March.

## MVP x evolução
- **MVP:** inputs → cálculo por múltiplos → dashboard + PDF, tudo em memória (sem salvar).
- **Depois:** salvar cenários (Prisma), benchmark de múltiplos por setor, comparar com
  DCF e valor patrimonial (Higor deixou esses de fora agora, mas cabe evoluir).
