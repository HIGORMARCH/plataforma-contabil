# Padrão de memória do projeto

Estrutura fixa desta pasta. Não invente arquivos com outros nomes.

| Arquivo | Conteúdo |
|---|---|
| `memoria.md` | Briefing consolidado — leitura obrigatória no início de qualquer sessão |
| `arquitetura.md` | Stack, camadas, contratos entre módulos, decisões técnicas |
| `escopo.md` | O que o sistema faz. O que NÃO faz (fronteiras explícitas) |
| `pendencias.md` | Tarefas em aberto, ideias não implementadas, débitos técnicos |
| `decisoes.md` | Decisões arquiteturais com data e motivo (ADR) |
| `glossario.md` | Termos do domínio (ECD, DCTFWeb, DCTF, DEFIS, GIAM, SPED, etc.) |

## Regra de manutenção

- Fato novo relevante → atualizar o arquivo temático correspondente + refletir em `memoria.md` se afeta o briefing.
- Nunca criar arquivo fora dessa lista. Se sentir necessidade, é sinal de que o conteúdo cabe em um dos 6.
- `.claude/` está no git — memória viaja com o código.

## Regra de leitura

Início de sessão em qualquer subdiretório deste projeto = **primeira ação = `Read .claude/memoria.md`**.
