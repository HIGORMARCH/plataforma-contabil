# Plataforma Contábil — Análise Financeira com IA

Plataforma web para escritórios de contabilidade brasileiros: importa demonstrativos
contábeis dos clientes (Balanço Patrimonial, Balancete e DRE), executa **validações
contábeis**, calcula **indicadores econômico-financeiros**, faz o **cruzamento ano a ano**
e gera um **relatório técnico em linguagem simples** (acessível ao cliente), com exportação
em **PDF de papel timbrado** do escritório.

> **Fase 1 (esta entrega):** análise de um cliente por vez com Balanço + DRE de múltiplos
> exercícios, cruzamento horizontal e relatório técnico. Banco SQLite local.

## Princípios de confiabilidade

- **Os números nunca são inventados pela IA.** Todo cálculo (totais, indicadores, variações)
  é feito por um **motor determinístico** em TypeScript, coberto por testes. A IA apenas
  **reescreve** o texto já calculado em linguagem clara — e está proibida, por prompt, de
  criar saldos, afirmar regularidade fiscal ou emitir parecer de auditoria.
- **Revisão humana obrigatória.** Nenhum relatório vai ao cliente sem aprovação do contador.
- **Bloqueio por inconsistência.** Se o balanço não fecha, o PL é negativo ou faltam contas
  essenciais, a conclusão é marcada como *inconclusiva* e a aprovação fica bloqueada até a
  correção (atende à exigência de não emitir conclusão sem dados confiáveis).

## Stack

- **Next.js 16** (App Router, Server Actions) + **React 19** + **TypeScript** + **Tailwind v4**
- **Prisma 6 + SQLite** (schema pronto para migrar a PostgreSQL trocando o `provider`)
- **@react-pdf/renderer** para o PDF com papel timbrado
- **jose** (sessão JWT em cookie httpOnly) + **bcryptjs**
- **xlsx** para importação CSV/Excel
- **vitest** para os testes do motor

## Como rodar

```bash
cd plataforma-contabil
npm install
npx prisma migrate dev      # cria o banco SQLite
npm run seed                # popula escritório, cliente exemplo e usuários
npm run dev                 # http://localhost:3000
```

### Usuários de demonstração

| Perfil    | E-mail                                  | Senha        |
|-----------|-----------------------------------------|--------------|
| Admin     | admin@marchcontabilidade.com.br         | admin123     |
| Contador  | contador@marchcontabilidade.com.br      | contador123  |
| Analista  | analista@marchcontabilidade.com.br      | analista123  |
| Cliente   | cliente@lojamodelo.com.br               | cliente123   |

### IA (opcional)

Sem chave, o texto é gerado pelo motor determinístico. Para ativar o refino por IA, defina
em `.env`:

```
ANTHROPIC_API_KEY="sua-chave"
ANTHROPIC_MODEL="claude-sonnet-4-6"
```

## Arquitetura

```
src/lib/accounting/      # MOTOR DETERMINÍSTICO (núcleo testado)
  types.ts               #   estrutura padronizada dos demonstrativos
  compute.ts             #   totais do balanço e resultados da DRE
  indicators.ts          #   todos os indicadores (liquidez, endividamento, rentabilidade...)
  validation.ts          #   validações contábeis + regra de bloqueio
  comparison.ts          #   cruzamento ano a ano (análise horizontal)
  analyze.ts             #   orquestra e classifica a situação geral
  narrative.ts           #   relatório em LINGUAGEM SIMPLES (determinístico)
  sample.ts              #   exemplo realista (usado em testes e seed)
src/lib/ai/provider.ts   # camada de IA pluggable (Anthropic) + fallback
src/lib/import.ts        # mapeamento de contas e leitura de planilhas
src/lib/pdf/             # geração do PDF com papel timbrado
src/lib/service.ts       # ponte banco <-> motor
src/app/                 # interface (login, painel, clientes, relatórios, configurações)
```

## Indicadores calculados

Liquidez (corrente, seca, imediata, geral); Endividamento geral, composição do endividamento,
participação de capital de terceiros, imobilização do PL; Margens (bruta, operacional, líquida),
ROA, ROE, giro do ativo; Prazos médios de recebimento/pagamento; Necessidade de Capital de Giro,
Saldo de Tesouraria; EBITDA. Cada indicador traz fórmula, valor, classificação
(saudável/atenção/crítico/inconclusivo), interpretação e recomendação.

## Extração automática de PDF

Na tela de demonstrativos, é possível enviar o **PDF** do Balanço/DRE. A plataforma:

1. extrai o texto com `pdfjs-dist` (reconstruindo linhas por posição);
2. mapeia as contas para as chaves canônicas por **heurística determinística**
   (`src/lib/extract/heuristic.ts`), com rastreio de seção (circulante × não circulante)
   e o **trecho de origem** de cada valor;
3. se houver `ANTHROPIC_API_KEY`, complementa o mapeamento com IA (que apenas **lê** o
   documento — não inventa números);
4. **pré-preenche o formulário** com os campos destacados para conferência do contador.
   Nada é salvo sem revisão e confirmação humana.

## Fluxo operacional

Cadastrar cliente → lançar/importar/extrair de PDF os demonstrativos por ano → o sistema valida e calcula →
gerar relatório (IA + motor) → contador revisa, edita a conclusão e aprova → liberar ao
cliente → cliente acessa e baixa o PDF.

## Conformidade

A plataforma deixa explícito em cada relatório que a análise depende da qualidade dos
documentos, que a IA é ferramenta auxiliar e que a responsabilidade técnica é do contador.
Há registro de logs de acesso/alteração (base para LGPD). Referências normativas:
Lei 6.404/76, NBC TG 1000/1001/1002, CPC, legislação tributária — observadas no enquadramento
das contas e na linguagem dos relatórios.

## Roadmap (fase 2)

PostgreSQL multiempresa em nuvem; 2FA; criptografia de arquivos em repouso; OCR para PDFs
escaneados (imagem); DFC e DMPL; notas explicativas; cadastro completo de usuários e permissões
granulares; aceite de termos e política de privacidade; backup automático.
