# NCMs removidos e restaurados em 19/08/2026

Registro de um erro meu (Claude) e da correção. Mantido para que a conclusão
errada não se repita.

## O que aconteceu

Removi 69 registros da `NcmBase` (origem `econet_cache`) por concluir que eram
resultado do bug do `Content-Type`. **Estava errado.** Os 69 foram restaurados
no mesmo dia; a base voltou a 3.388 registros.

## Por que a conclusão estava errada

Meu raciocínio foi: "69 NCMs seguidos, todos classificados como Tributação
Normal, gravados um por segundo — é a assinatura do bug". Duas coisas derrubam
isso:

**1. Os horários.** Os consertos vieram ANTES da gravação:

| Horário (18/08/2026) | Evento |
|---|---|
| 16:57:33 | commit `bbadab3` — "página não veio" deixa de virar "normal" |
| 17:19:17 | commit `5938faf` — conserto do `Content-Type` |
| 17:24:31 | gravação dos 69 registros |

Com os dois consertos aplicados, "normal" só é gravado quando a página VEIO,
com as abas de tributação presentes, e nenhuma delas é de regime especial.
Página ausente passa a devolver erro, não classificação.

**2. A natureza da base da Autmais.** Essa é a parte que eu não sabia:

> A tabela da Autmais é **estática** e lista apenas os **regimes especiais** —
> monofásico, alíquota zero, isenta, substituição. NCM tributado normalmente
> **não existe** naquela tabela.

Logo, todo NCM tributado que confirmamos na Econet é registro novo, que só pode
vir de fora da semente. "Não está na Autmais" não é sinal de erro: é o motivo
de a nossa base ser maior que a deles e crescer com o uso. Nas palavras do
Higor: se fosse pra ter uma base igual à da Autmais, não precisaria de nós.

## Lição

Antes de tratar dado como corrompido, comparar o horário da gravação com o
horário do conserto — e entender o que a fonte de referência cobre e o que ela
não cobre. Uniformidade de resultado não é, por si só, evidência de falha.

## Verificação após a restauração

| | |
|---|---|
| `NcmBase` total | 3.388 |
| origem `seed_autmais` | 3.318 |
| origem `econet_cache` | 69 |
| origem `manual` | 1 |

Scripts: `scripts/_tmp-limpar-ncms-contaminados.ts` (a remoção) e
`scripts/_tmp-restaurar-ncms-tributados.ts` (a restauração). Ambos simulam por
padrão e só gravam com `--aplicar`.

## Nota sobre os dados restaurados

O campo `atualizadoEm` dos 69 traz a data da restauração (19/08), não a da
gravação original (18/08 17:24). O horário exato de cada linha não foi
preservado e reconstruir por estimativa seria inventar dado.

## Lista dos 69

```
19053100 21069030 34022000 34070010 35061090 38245000 39012029 39173240
39232990 39233000 40021911 40169200 40169300 42022210 42023100 42029900
42032100 56012190 56081100 58071000 61042200 61052000 61069000 61124900
61151019 61151099 61161000 61169300 62034900 62052000 62053000 62111100
62111200 62113200 62160000 62179000 63080000 64019200 64021900 64022000
64029990 64031900 64039990 64069020 64069090 65050011 65050029 65069100
73239300 82141000 83062100 83062900 84142000 85182200 85183000 85395200
87141000 90041000 90049090 92089000 95030099 95062900 95064000 95066900
95069000 95069100 95069900 96091000 96190000
```
