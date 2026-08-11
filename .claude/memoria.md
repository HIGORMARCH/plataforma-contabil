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

## Última sessão (10/08/2026)

- Revert da ferramenta de vinculação plano de contas (matching por código sequencial fazia conta errada bater)
- Revert da aba "Contas divergentes" da conciliação (mesmo motivo)
- Conciliação Domínio × ECD reescrita em formato hierárquico (raiz → subgrupo → nível 3)
- Fix parser: reconhece `2.3.2 RESERVAS DE CAPITAL` como sintética própria
- Fix cache: `revalidatePath(path, "layout")` invalida descendentes
- Balanço 2018 Casa São Paulo (CNPJ 37.417.896/0001-19) alinhado nível 3 após reclassificações no Domínio

**Ação do Higor pendente:** reimportar 2018 Casa São Paulo pela UI pra validar os fixes.

## Onde buscar o resto

- `arquitetura.md` — camadas, contratos, stack detalhada
- `escopo.md` — o que faz / o que NÃO faz
- `pendencias.md` — o que ficou pra fazer + ideias pendentes
- `decisoes.md` — decisões arquiteturais com data e motivo
- `glossario.md` — termos do domínio contábil-fiscal
- `AGENTS.md` (raiz do projeto) — instruções técnicas do Next.js 16
- `docs/RELATORIO-SESSAO-*.md` — histórico detalhado por dia
