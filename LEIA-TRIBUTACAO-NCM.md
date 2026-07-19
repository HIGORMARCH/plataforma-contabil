# Módulo Tributação NCM — como ativar

Este módulo automatiza a criação do TXT de configuração de NCM que o Domínio importa
via leiaute "Autmais - Importação NCM Com Tributação".

## 1. Ativação inicial (uma vez só)

O schema Prisma já foi atualizado (novos modelos: `ConfiguracaoNcm`, `NcmBase`,
`VigenciaNcm`, `NcmVigencia`, `CacheEconet`). Falta:

### 1.1. Regerar o Prisma Client

O Prisma Client precisa ser regerado pra ter os tipos dos novos modelos.
Como o dev server segura o DLL do query engine, faça o passo a passo:

```powershell
# Numa janela nova do PowerShell (ou pare o dev server no terminal atual):
cd C:\Dev\plataforma-contabil
Get-Process node -ErrorAction SilentlyContinue | Stop-Process -Force  # para o server
npx prisma generate                                                    # regera o cliente
npm run seed:tributacao-ncm                                            # popula 54 configs + NCMs base
npm run dev                                                            # sobe o server novamente
```

Se preferir NÃO derrubar todos os `node.exe` (pode ter outros projetos abertos), abra o
Task Manager, ache o processo Node.js do plataforma-contabil e mate manualmente antes de
rodar `prisma generate`.

### 1.2. Verificação

Ao subir o server e abrir `http://localhost:3000/painel/tributacao-ncm`, você deve ver:

- **54 configurações na base** (as do arquivo pai Autmais)
- **3.089 NCMs classificados** (idem)
- **Aviso de base semente carregada** desaparece

## 2. Fluxo de uso

1. Cadastra cliente em `/painel/clientes/novo` — o CNPJ automaticamente puxa CNAE e
   deduz a atividade tributária (varejo/atacado/fabricante). Você pode editar.
2. Vai em `/painel/tributacao-ncm/<cliente>` → clica em `+ Criar vigência`
3. Na tela da vigência, sobe a planilha do Domínio (RELAÇÃO DE PRODUTOS.xls)
4. Sistema:
   - Extrai NCMs únicos (deduplica automático)
   - Cruza com a base local — associa os conhecidos direto à configuração
   - Mostra a lista de NCMs faltantes (que precisam Econet — próxima fase)
5. Clica em `Baixar TXT` → download no formato correto do Domínio

## 3. Estado atual

| Fase | O que faz | Status |
|---|---|---|
| 1 | Schema + cadastro cliente + CNPJ (reusa) | ✅ Escrito |
| 1.1 | Seed 54 configs Autmais + NCMs base | ⏳ Pendente (rodar comando) |
| 2 | Upload Excel + parser + associação com base | ✅ Escrito |
| 3 | Consulta automática Econet pros faltantes | ⏳ Não implementado |
| 4 | Detecção da aba correta pela atividade | ⏳ Não implementado |
| 5 | Geração TXT + download | ✅ Escrito |

**Pra ficar funcional hoje (sem Econet)**: rode o passo 1.1 acima e teste com uma
planilha cujos NCMs estejam todos na base seed. A geração de TXT dos conhecidos já
funciona.

**Pra ficar completo**: integrar o scraper Econet Python (já pronto em
`C:\Users\higor\AppData\Local\Temp\claude\...\scratchpad\econet-batch-v3.py`) via
subprocess ou porta pra TypeScript.

## 4. Arquivos criados

```
prisma/
  schema.prisma                     (+ 5 modelos novos)
  seed-tributacao-ncm.ts            (semente das 54 configs)

src/lib/
  atividade-tributaria.ts           (CNAE → varejo/atacado/fabricante)
  parse-estoque-dominio.ts          (parser Excel do Domínio)
  gerar-txt-dominio.ts              (serializador TXT formato 9 col ;)

src/app/painel/tributacao-ncm/
  page.tsx                          (lista clientes com resumo)
  [clienteId]/page.tsx              (detalhes + criar vigência)
  [clienteId]/_NovaVigenciaForm.tsx
  [clienteId]/vigencia/[vigenciaId]/page.tsx  (editor da vigência)
  [clienteId]/vigencia/[vigenciaId]/_EditorVigencia.tsx

src/app/api/tributacao-ncm/
  vigencias/route.ts                (POST cria vigência)
  vigencias/[id]/upload-estoque/route.ts   (POST upload Excel)
  vigencias/[id]/exportar-txt/route.ts     (GET download TXT)
```
