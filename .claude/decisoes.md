# Decisões Arquiteturais — Plataforma Contábil March

Registro de decisões que moldam o sistema. Formato: **Título** — data — motivo — consequência.

---

## Self-hosted, não SaaS multi-tenant (v1)

**Data:** 2026 (contínuo)
**Motivo:** perfil de uso é suporte/auditoria do dono do escritório, não plataforma multi-cliente. Simplicidade > perfeição. Instância por escritório.
**Consequência:** sem tabelas de tenancy, sem RLS, sem billing. Deploy é copiar pasta. Roadmap distante prevê separação por escritório se virar SaaS.

## Fonte única de arquivos em `C:\PlataformaContabil\`

**Data:** 2026 (contínuo)
**Motivo:** plataforma NUNCA modifica arquivo em servidor de terceiro (Z:\, ReceitanetBX, Domínio). Segurança + previsibilidade.
**Consequência:** todo fluxo de importação começa com cópia pra pasta local padronizada por cliente/tipo/ano.

## Parser importa FIEL, apontamentos ficam em alertas visíveis

**Data:** 2026-08
**Motivo:** parser que "conserta" ou "adivinha" mascara erro do documento original. Contador precisa ver o que o documento diz e decidir.
**Consequência:** parsers de PDF/SPED extraem exatamente o que está escrito. Validações levantam warnings, nunca mutam dados de entrada.

## Análise de balanço para no nível 3

**Data:** 2026-08-10
**Motivo:** Higor: "conciliações, comparativos e indicadores param no nível 3 (1.1.1, 2.1.4, 2.3.5); nunca descer nas analíticas". Descer gera lixo semântico e chama coincidência de "divergência".
**Consequência:** telas de conciliação e análise renderizam nível 3 como folha. Analíticas ficam disponíveis pra drill-down mas não pra comparação.

## Reclassificação ≠ Divergência

**Data:** 2026-08-10
**Motivo:** termos precisam ser distintos. Se subgrupo bate mas subconta muda = reclassificação (problema de plano de contas). Se saldo total diverge = divergência.
**Consequência:** motor de conciliação classifica os dois casos separadamente. UI diferencia visualmente.

## `revalidatePath(path, "layout")` em Server Actions de Exercicio/Cliente

**Data:** 2026-08-10
**Motivo:** reimportação de exercício deve invalidar cache de TODAS as telas descendentes (conciliação, análise, pis-cofins, irpj-csll), não só a raiz do cliente. Sem isso, contador vê valores antigos e não sabe.
**Consequência:** todo Server Action que mexa em Exercicio ou Cliente usa `layout` como segundo parâmetro. Padrão referência em `salvarExercicioManualAction`.

## Revert da ferramenta de vinculação plano de contas

**Data:** 2026-08-10
**Motivo:** matching por código sequencial casava analítica errada com sintética errada por coincidência de numeração (ex.: DEPRECIAÇÕES DE MÁQUINAS acabou em Mercadorias). Ferramenta não confiável.
**Consequência:** tabela `ContaPlanoDominio` dropada, arquivos removidos. Higor quer retomar com abordagem diferente no futuro.

## Revert da aba "Contas divergentes" da conciliação

**Data:** 2026-08-10
**Motivo:** mesmo bug de matching sequencial. "Este relatório não tem por que existir porque não traduz a realidade" (Higor).
**Consequência:** tela voltou a só "Totais e grupos". Conciliação por nível 3 foi reescrita em formato de balanço hierárquico.

## `pl.reservas` como sintética separada no parser

**Data:** 2026-08-10
**Motivo:** Casa São Paulo tinha `2.3.2 RESERVAS DE CAPITAL` que o parser incorporava em Lucros Acumulados. Gerava divergência falsa pós-reclassificação no Domínio.
**Consequência:** classificação de balanço reconhece "reservas de capital", "adiantamento p/futuro aumento" como sintética própria. PL calcula plug = grupo - capital - reservas.

## Layout hierárquico do balanço na conciliação

**Data:** 2026-08-10
**Motivo:** tabela plana de nível 3 misturava ATIVO/PASSIVO/PL na leitura. Higor pediu formato de balanço.
**Consequência:** raiz (ATIVO / PASSIVO+PL) fundo escuro; subgrupo (AC, ANC, PC, PNC, PL) fundo cinza; contas nível 3 indentadas. DRE mantém tabela plana.

## GIAM × SPED-Fiscal — decidir antes de codar v1 estadual

**Data:** 2026-08
**Motivo:** Decreto TO 7.103/2026 art. 384-E: GIAM obrigatória até 12/2026 pro Regime Normal, migra pra SPED-Fiscal em 01/2026. Não é corte seco. Codar GIAM tem prazo de vida curto.
**Consequência:** módulo estadual v1 aguarda decisão de escopo (GIAM histórica + SPED-Fiscal atual? Só SPED-Fiscal?).

## Não armazenar arquivos originais no banco

**Data:** 2026 (contínuo)
**Motivo:** SPED/PDF/HTML são inputs. Guardar binário no banco explode storage, complica backup, expõe conteúdo sensível.
**Consequência:** parser lê arquivo do disco (`C:\PlataformaContabil\...`), extrai valores, descarta arquivo do fluxo. Só dados normalizados no Postgres.

## Não abrir arquivos com senhas em texto puro

**Data:** 2026 (contínuo)
**Motivo:** feedback do dono. Planilhas/txt com credenciais nunca devem ser abertas por mim — mesmo "só pra estrutura".
**Consequência:** ao encontrar arquivo suspeito, pedir descrição verbal ao Higor. Não abrir com Read/Bash.

---

## Como usar este arquivo

- Adicionar entrada quando decisão for tomada. Nunca reescrever histórico.
- Se uma decisão for revertida, adicionar nova entrada apontando pra anterior.
- Ordenar da mais recente pra mais antiga.
