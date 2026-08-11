# Arquitetura — Plataforma Contábil March

## Stack

- **Next.js 16** + React 19 (App Router)
- **TypeScript** estrito
- **Prisma 6** + PostgreSQL
- **Tailwind** pra UI
- Testes: Vitest
- Parsers: `pdf-parse`, `xlsx`, parsers manuais de SPED (`.txt` posicional)

**Importante:** este Next.js tem breaking changes vs versões anteriores. Ler `node_modules/next/dist/docs/` antes de escrever código. Ver `AGENTS.md` do projeto.

## Camadas

```
src/
  app/
    (public)/              rotas públicas (login)
    painel/                rotas autenticadas
      clientes/[id]/       cadastro do cliente
        page.tsx           overview
        exercicios/        anos contábeis
        conciliacao-ecd/   Balanço + DRE Domínio × ECD
        analise/           indicadores
        pis-cofins/
        irpj-csll/
        obrigacoes/        DCTF, DCTFWeb, SPED-Fiscal, ECF
    api/                   handlers de API
  lib/
    accounting/            motor de conciliação, cálculo de indicadores
    extract/               parsers (PDF Domínio, TXT SPED)
    graph/                 (não aqui — está no march-cofre)
    prisma/                cliente Prisma
```

## Contratos entre módulos

- **Extract → Accounting:** parser devolve `{ balanco, dre, plano }` normalizado; motor de accounting não conhece PDF/SPED.
- **Accounting → UI:** todo cálculo é server-side; UI só renderiza JSON.
- **UI → banco:** via Server Actions (`app/painel/**/actions.ts`). Nunca fetch de client component.
- **Cache:** `revalidatePath(path, "layout")` após qualquer mutação que afete descendentes.

## Fluxo de dados

```
Arquivo em C:\PlataformaContabil\   →  parser (extract/)
                                        ↓
                                    normalização
                                        ↓
                                    tabela Exercicio no Postgres
                                        ↓
                                    motor accounting (conciliação, análise)
                                        ↓
                                    UI (renderiza a partir do banco)
```

Arquivo original **nunca** é persistido no banco. Só os dados extraídos.

## Fluxo de auditoria em cascata

```
Fiscal (SPED-Fiscal, EFD-Contribuições, DCTFWeb)
   ↓ (fecha aqui antes de subir)
Folha (eSocial, DCTFWeb 4200, GPS)
   ↓ (fecha aqui antes de subir)
Contábil (ECD, ECF, DIRPF do sócio)
```

Bem feito, o contábil descobre erros do fiscal e da folha. Por isso a conciliação Domínio × ECD é motor central — se BP não fecha, algo em cima está errado.

## Fonte única de arquivos

`C:\PlataformaContabil\<CLIENTE>_<CNPJ>\<TIPO>\<ANO>\<arquivo>`

- `<TIPO>` = `BALANCO`, `SPED-ECD`, `SPED-FISCAL`, `EFD-CONTRIB`, `DCTFWEB`, `ECF`, `PGDASD`, etc.
- Plataforma NUNCA lê de `Z:\`, ReceitanetBX, servidor Domínio, servidor SEFAZ. Cópia local sempre.

## Postgres

- Dump diário automatizado com destino `Z:\HIGOR\Dev\` no servidor MARCH `192.168.248.150`.
- Backup local em `C:\Dev\plataforma-contabil\backups\` também.

## Deploy

- Hoje: rodando local no PC do escritório (`localhost:3000`).
- Amanhã: servidor VOECLOUD dedicado `192.168.248.220` — aguardando VOECLOUD instalar Node/Python/Chrome/NSSM.
- Acesso remoto pelo Higor: Tailscale + AnyDesk (não SSH — foi tentado e adiado).

## Integrações externas

- **Integra Contador** (RFB) — serviços aprovados: PGDASD, DCTFWEB, CAIXAPOSTAL, CCMEI. `REGIMEAPURACAO` do PGDASD é sobre caixa/competência do Simples — não é regime tributário do CNPJ.
- **SEFAZ-TO** — automação de raspagem do ConsGIAM.Asp pra puxar GIAM histórica (v1 do módulo estadual).
