# Aplicação do ICMS — Conciliação de Pagamentos de Impostos Estaduais

> **Leia este arquivo primeiro.** Passagem de bastão para a sessão dedicada.
> Preparado pela Jali em 20/07/2026 · Janela de trabalho do Higor: **09h–10h implementar · 11h–12h testar**

> ⚠️ **ESCOPO EVOLUIU em 20/07/2026 (tarde).** O que começou como "conciliação estadual do ICMS"
> virou uma **plataforma de Auditoria de Obrigações Acessórias** (menu FISCAL) que alimenta a
> Conciliação de Pagamentos (menu CONTÁBIL) e a Análise das Demonstrações Contábeis
> (menu AUDITORIA). **Ver seção 9 no fim deste arquivo** antes de codar.

---

## 1. Quem é o Higor (leia antes de escrever qualquer coisa a ele)

**Contador**, CRC/TO 002480/O-4, sócio da March Contabilidade (Palmas-TO). **Não é desenvolvedor.**

- Em assunto **contábil/fiscal**: falar técnico à vontade, ele domina (SPED, NBC TG, regimes).
- Em assunto **de software**: **linguagem simples**, sem jargão. Dizer **o que** a tela faz, não como foi programada.
- Ele valoriza: diagnóstico rápido → causa raiz → correção prática.
- Tem TDAH: usar listas e tabelas, retomar sempre com "onde paramos".

---

## 2. O que é esta aplicação

A **irmã estadual** da conciliação federal que já existe na plataforma.

| | Federal (já existe) | **Estadual (construir)** |
|---|---|---|
| Rota | `/painel/auditoria-tributaria` | `/painel/conciliacao-estadual` |
| Confronto | **Apurado × Pago** | **GIAM × Razão** |
| Origem | Domínio × e-CAC (SERPRO PAGTOWEB) | SEFAZ-TO × Domínio |
| Tributos | Federais + encargos trabalhistas | **ICMS** |

> ⚠️ **O ICMS NÃO vem pelo e-CAC.** O e-CAC só enxerga tributo federal. Não tentar reaproveitar aquele caminho.

### O confronto, nas palavras do Higor: **"GIAM × Razão"**
- **Lado A — GIAM:** o ICMS **declarado à SEFAZ**.
- **Lado B — Razão:** o ICMS **registrado na contabilidade** (razão da conta de ICMS, vindo do Domínio).

Divergência ⇒ ou a GIAM foi entregue errada, ou a contabilidade não reflete a apuração. Nos dois casos cabe providência.

**Cuidado de UX:** deixar explícito na tela que aqui é **declarado × contabilizado**, diferente da federal que é **apurado × pago**. São naturezas distintas — não confundir o usuário.

---

## 3. As fontes (SEFAZ-TO)

| Sistema | URL | O que traz |
|---|---|---|
| **GIAM** | https://giam.sefaz.to.gov.br/ | Guia de Informação e Apuração Mensal do ICMS. Entradas e saídas discriminadas por UF. Entrega até o **dia 9** do mês seguinte. **Layout versão 10.0** (07/03/2024), válido de 2009 em diante — layout e índices de atualização monetária baixáveis no próprio site. |
| **DIF** | via portal do contribuinte | Documento de Informações Fiscais — declaração **anual**. |
| Portal do Contribuinte | https://contribuinte.sefaz.to.gov.br/ | Pagamentos via **DARE**, comunicados e portarias. |

**Autenticação: Inscrição Estadual + SENHA** — **não é certificado digital** (diferente do e-CAC/SERPRO).
⇒ Implica guardar **senha por cliente**: tratar com o mesmo rigor dos certificados (cifrada no banco, nunca em repo, nunca em log). Ver `src/lib/cripto` (o padrão já usado para senha de certificado).

Suporte SEFAZ-TO: 0800 631144 · cde@sefaz.to.gov.br

**⚠️ O DARE estadual tem estrutura diferente do DARF** — não reaproveitar o parser do DARF sem conferir.

---

## 3.1 Base legal — prazo de vida da GIAM no Tocantins

**Decreto TO nº 7.103, de 13/02/2026** (altera o RICMS/TO — Decreto 2.912/2006), art. 384-E:

- **§3º, III, "c"** (redação nova): dispensa/troca da GIAM **a partir de 01/2026** — SPED-Fiscal EFD ICMS/IPI passa a ser fonte oficial para o grupo tratado no artigo.
- **§5º, IV** (redação nova): "são obrigadas a entregar a Guia de Informação e Apuração Mensal - GIAM, **até o período de referência: dezembro de 2026**."

**Leitura para o roadmap** (validada com o Higor em 20/07/2026 — a leitura dele, como contador, prevalece sobre a minha interpretação inicial do §5º IV):

| Regime | Competência | Fonte da apuração ICMS | Observação |
|---|---|---|---|
| **Simples Nacional** | Sempre | GIAM + Razão | SPED = *Desobrigado* |
| **Real/Presumido** | ≤ 12/2025 | GIAM + Razão | SPED = *Desobrigado* (histórico) |
| **Real/Presumido** | **≥ 01/2026** | **SPED-Fiscal + Razão** | **GIAM = Desobrigado** — não entrega mais |
| **MEI** | Sempre | Sem obrigação | Não aparece no módulo |

⇒ Regime Normal (Real/Presumido) foi **desobrigado da GIAM já em 01/2026** — não é ano de transição paralela como eu tinha lido do §5º IV do decreto. Aquele parágrafo deve tratar de outro grupo específico (a confirmar com Higor caso o texto integral do art. 384-E revele detalhes).

⇒ **A automação da GIAM continua justificada:** vale permanente pra Simples e pra todo o histórico ≤ 12/2025 de Real/Presumido.

⇒ **SPED-Fiscal (registro E110 = apuração do ICMS)** é a fonte oficial pra Real/Presumido a partir de 01/2026.

⇒ Roteamento por `regimeTributario` + competência é interno — a tela nunca mostra as 4 colunas de apuração ao mesmo tempo; uma delas sempre aparece como **"Desobrigado"** (palavra explícita, não vazio nem N/A).

**Outras alterações do decreto (fora do escopo desta aplicação, mas registradas):**
- **DEC — Domicílio Eletrônico do Contribuinte** (art. 519-A, §1º): canal oficial de notificações da SEFAZ-TO. Potencial fonte futura (TAREs, notificações, cobranças).
- Anexos X e XII: novos itens isentos e itens com ST (fármacos, equipamentos médicos) — **impactam a tela de Tributação NCM**, não a conciliação.
- Anexo XXI: exclusão de ST em itens 8.29–8.51 para saídas de industrial fabricante no TO.

---

## 3.2 Escopo expandido — Módulo Auditoria Fiscal ICMS

Decidido pelo Higor em 20/07/2026: a tela original "GIAM × Razão" evolui para um módulo mais amplo no grupo **FISCAL** do menu (ao lado de Tributação NCM), chamado **Auditoria Fiscal ICMS**.

**Matriz por competência com 4 colunas de valores + diagnóstico:**

| Coluna | O que traz | Fonte |
|---|---|---|
| SPED-Fiscal | Apuração declarada à RFB (registro E110) | Arquivo local do Domínio (ler) — v1 upload, v2 leitura automática |
| GIAM | Apuração declarada à SEFAZ-TO | Robô raspa `ConsGIAM.Asp` (task 1) |
| Razão (Domínio) | Apuração escriturada na contabilidade | PDF do razão da conta ICMS a recolher (task 5) |
| Pago (DARE) | Pagamento efetivado | v1: baixa no razão · v2: Portal do Contribuinte SEFAZ-TO |

**Diagnóstico automático das divergências:**
- SPED = GIAM ≠ Razão → apuração ok, contabilidade não reflete
- SPED ≠ GIAM → informado diferente aos dois fiscos (grave, RFB cruza automático)
- Apurado ≠ Pago → risco de autuação
- Pago ≠ Baixa Razão → pagamento sem lançamento (ou vice-versa)

**Regra de retroatividade (Higor em 20/07/2026):**

| Período | Como entra o dado |
|---|---|
| **≥ 01/2026** | Automação (robô GIAM, leitura SPED do Domínio, sync mensal) |
| **≤ 12/2025** | **Tudo manual** — upload sob demanda quando cliente pedir auditoria retroativa |

Motivo: automatizar 5+ anos de todos os clientes é caro e desnecessário — só roda quando alguém pedir.

---

## 3.3 Integra Contador — SERPRO (infra já existe)

A plataforma já usa SERPRO Integra Contador (`src/lib/serpro/client.ts` — mTLS + procurador + endpoint genérico `Consultar`). Hoje consome apenas `PAGTOWEB/PAGAMENTOS71` (pagamentos federais). Para adicionar qualquer serviço novo é só chamar `Consultar` com outro `idSistema`/`idServico`.

**Serviços aprovados por Higor em 20/07/2026** para consumo pela plataforma:

| Serviço | Uso | Prioridade | Task |
|---|---|---|---|
| **REGIMEAPURACAO** | Descobre regime tributário do CNPJ (evita erro no cadastro; alimenta roteamento SPED/GIAM/Desobrigado) | Alta | #9 |
| **PGDASD** | Declarações mensais Simples Nacional (complementa auditoria Simples) | Alta | #12 |
| **DCTFWEB** | Declaração DCTF Web da RFB (cruzamento com apuração) | Média | #13 |
| **CAIXAPOSTAL** | Mensagens e-CAC (notificações, autuações) | Baixa | #14 |
| **CCPJ/CCMEI** | Consultas cadastrais (razão social, situação) | Baixa | #15 |

⚠️ **Integra Contador é RFB (federal) — não cobre SEFAZ estadual.** DARE, GIAM e outras obrigações estaduais continuam via SEFAZ-TO.

⚠️ **SPED transmitido (Fiscal/Contribuições/ECF) NÃO é exposto pelo Integra Contador** — o arquivo original fica local no Domínio; ler de lá.

---

## 4. O que JÁ está feito (commits de 20/07/2026)

- **`a5e1c4c`** — Menu do painel reorganizado em grupos + rota nova criada.
  - `src/components/Sidebar.tsx` ganhou campo opcional `grupo` (título de seção).
  - `src/app/painel/layout.tsx` — estrutura definida pelo Higor:
    `Painel` · **CADASTROS** (Clientes) · **FISCAL** (Tributação NCM) · **CONTÁBIL** (Conciliação Federais/Trabalhistas + Conciliação Estaduais) · **AUDITORIA** (Análise das Demonstrações Contábeis *(era "Relatórios")* + Valuation) · **ADMINISTRAÇÃO**.
  - `src/app/painel/conciliacao-estadual/page.tsx` — **página existe, mas é só explicativa** ("em construção"). É ela que deve ser substituída pela tela real.
- **`7d0c801`** — `allowedDevOrigins` no `next.config.ts`: sem isso, abrir pelo IP da rede (`192.168.10.138:3000`) renderiza mas **os cliques não funcionam**. Já corrigido e validado pelo Higor.

---

## 5. ⛔ O QUE FALTA DECIDIR — perguntar ao Higor no início

Estas três respostas destravam a implementação. **Não inventar formato de arquivo — pedir um exemplo real.**

1. **A GIAM dá pra baixar?** Ao consultar uma GIAM entregue no site, o que dá pra salvar — PDF, recibo, arquivo de transmissão? **Pedir um arquivo de exemplo de um cliente qualquer** e construir a leitura em cima dele.
2. **Qual relatório do Domínio** traz o ICMS do lado contábil (razão da conta de ICMS — PDF ou TXT)? **Pedir exemplo.**
3. **Decisão contábil (é dele):** a GIAM tem débito das saídas, crédito das entradas, saldo a recolher, ICMS-ST. **Confrontar só o saldo a recolher do mês, ou linha a linha?**

---

## 5.1 REQUISITO — guarda das senhas de acesso à SEFAZ

Definido pelo Higor em 20/07/2026. **A senha é digitada no próprio sistema, uma vez, e depois ninguém mais a vê — nem ele.**

**No cadastro do cliente**, dois campos novos:
- `Inscrição Estadual`
- `Senha da SEFAZ`

**Regras (todas obrigatórias):**

1. **Digitada uma vez, no sistema.** Campo `type="password"` no cadastro do cliente.
2. **Gravada cifrada no banco** — usar o que **já existe**: `src/lib/crypto.ts` (`cifrar()` / `decifrar()`, AES-256-GCM, mesmo padrão já usado na senha do certificado digital). **Não criar solução nova.**
3. **Nunca é devolvida à tela.** Depois de salva, o campo mostra apenas `•••••• (cadastrada)` + botão **"Substituir senha"**. A API **nunca** retorna o valor — nem cifrado.
4. **Nunca aparece** em log, relatório, exportação, mensagem de erro ou tela de depuração.
5. **Só o sistema usa**, no momento de consultar a GIAM: decifra em memória, usa, descarta.
6. **Quem cadastra/altera:** apenas perfil **ADMIN**.
7. **`ENCRYPTION_KEY`** fica no `.env.local` (32+ caracteres). **Nunca no git.** Se for rotacionada, os valores antigos ficam ilegíveis — planejar re-cifragem antes.

**Carga inicial (se ele tiver planilha com as senhas):** fazer script que lê a planilha **do caminho local onde ela já está**, cifra e grava no banco — **sem imprimir o conteúdo em tela ou log**. Depois ele guarda ou apaga a planilha. **Nunca copiar a planilha para dentro da pasta do projeto.**

> ⚠️ **Nunca pedir ao Higor que digite senha no chat.** O que é digitado na conversa fica gravado em arquivo de texto no disco. Senha só entra pelo campo do sistema.

---

## 5.2 O DASHBOARD — desenho aprovado pelo Higor (20/07/2026)

Ele desenhou a tela-alvo: **"Dashboard de Reconciliação Contábil — Cruzamento SPED × GIAM × DOMÍNIO"**.

### As três fontes, lado a lado
| Coluna | O que é | Situação |
|---|---|---|
| **SPED** | declarado ao fisco federal (EFD ICMS/IPI) | ✅ parser pronto |
| **GIAM** | declarado ao Estado | ✅ parser pronto (Segmentos A, B, E, Z) |
| **DOMÍNIO** | **o razão contábil** — a escrituração | ❌ **falta ler. É o que trava o painel.** |

> ⚠️ Confirmar com o Higor de qual relatório do Domínio sai a coluna: razão da conta de ICMS, balancete, ou relatório de apuração.

### Estrutura da tela
- **Filtros no topo:** Período (de/até), Empresa, Competência. Carimbo de "última atualização".
- **Cartões (KPI):** Total Compras de cada uma das 3 fontes · Diferença máxima (com o par responsável) · % diferença média · Competências com diferença (ex.: "9 / 10").
- **Gráfico de linhas:** evolução mensal do Total Compras, uma linha por fonte.
- **Resumo do período** (tabela 3 colunas): Total Compras · Total Vendas · ICMS Créditos · ICMS Débitos · Saldo Apurado · ICMS a Recolher · Saldo Credor.
- **Cruzamento mensal** (tabela principal): por competência → valor das 3 fontes → **diferenças nos 3 pares** (SPED×GIAM, SPED×Domínio, Domínio×GIAM) → % diferença máxima → **status**.
- **Menu lateral:** Visão geral · Detalhamento · Diferenças · Configurações.
- **Botão Exportar relatório.**

### Semáforo (faixas definidas por ele)
| Status | Faixa |
|---|---|
| 🟢 OK | diferença < 5% |
| 🟡 ATENÇÃO | 5% a 15% |
| 🔴 ALERTA | > 15% |

Rodapé do desenho: *"valores negativos nas diferenças indicam que o primeiro sistema possui valor menor que o segundo"* — manter essa convenção.

### Onde isso se encaixa
Ver [[visao-auditoria-do-escritorio]]: este painel é a **Etapa 1** (obrigações acessórias). Falta ainda somar a **4ª fonte** — a GIAM oficial do **portal da SEFAZ** —, porque SPED e arquivo GIAM saem ambos do Domínio (ver [[giam-dominio-x-sefaz]]).

---

## 6. Como o modelo se encaixa

O campo `fonte` do `ApuracaoFiscal` foi projetado **agnóstico** justamente para isto — o ICMS entra como mais uma fonte, sem quebrar o layout **A × B × A−B** já validado na federal.

Referência de implementação (ler antes de codar): `src/app/painel/auditoria-tributaria/page.tsx` e `AuditoriaTributariaCliente.tsx` — a tela federal já resolve tabela plana → drill-down, filtros de competência/tributo e badges de status. **Seguir o mesmo padrão visual.**

---

## 7. Como rodar

O MarchPortal já mantém a plataforma no ar em **http://localhost:3000** (ou `http://192.168.10.138:3000` pela rede).
Subir manualmente: `C:\Dev\plataforma-contabil\iniciar-servidor.bat`
Login de desenvolvimento: `admin@marchcontabilidade.com.br` / `admin123` (exibido na tela de login).
Após mexer no `next.config.ts`, **reiniciar o servidor** — ele não recarrega essa configuração sozinho.

---

## 8. 🔒 Pendência de segurança encontrada (avisar o Higor)

`scripts/configurar-cert-palmas-hall.ts` tem a **senha do certificado digital da PALMAS HALL em texto puro**, e o arquivo está **versionado no git**. Contraria a regra permanente dele (*"segurança e organização são e serão sempre nossa meta"*). Corrigir: trocar por variável de ambiente e limpar do arquivo. Ele já foi avisado e ficou de decidir quando.

---

*Preparado pela Jali (sessão "Jali — Auxiliar March") em 20/07/2026.*

---

## 9. Evolução do escopo — Plataforma consolidada (20/07/2026, tarde)

Decisões arquiteturais do Higor em conversa da tarde. **Prevalece sobre as seções anteriores** onde houver conflito.

### 9.1 Menu final

**FISCAL** *(motor de dados — foco em declarações)*
- Tributação NCM *(já existe)*
- **Auditoria de Obrigações Acessórias** *(nome novo)* — cobre SPED-Fiscal, SPED-Contribuições, ECF, ECD, EFD-Reinf, DCTFWeb, PGDAS, GIAM, DIF, DEFIS. Rota: `/painel/auditoria-obrigacoes-acessorias` (redirect de `/painel/conciliacao-estadual`).

**CONTÁBIL** *(conciliação de caixa — foco em pagamentos)*
- Conciliação — Pagamentos Federais e Trabalhistas *(fica como está)*
- Conciliação — Pagamentos Estaduais *(fica como está — ICMS pago via DARE)*

**AUDITORIA** *(saída pro cliente)*
- Análise das Demonstrações Contábeis *(já existe — vira consumidora dos dois acima)*
- Valuation *(já existe)*

### 9.2 Fluxo de dados

```
Fontes brutas (arquivos SPED/GIAM/ECF/ECD/EFD-Reinf, Integra Contador, DARE, Domínio)
     │
     ▼
[FISCAL] Auditoria de Obrigações Acessórias  ─► motor único de dados
     │
     ├──► [CONTÁBIL] Conciliação de Pagamentos
     │        └── confronta apurado × pago × baixado no razão
     │
     └──► [AUDITORIA] Análise das Demonstrações Contábeis
              └── relatório final assinado pelo contador — consome tudo
```

**Regra:** cada dado é processado UMA vez pelo motor FISCAL e distribuído. Nem Conciliação de Pagamentos nem Análise Contábil recalculam — consomem.

### 9.3 Cinco checagens automáticas por obrigação × competência

1. **Entregou?** (arquivo existe / API confirma)
2. **Batem entre si?** (SPED × GIAM, SPED-Contrib × DCTFWeb, etc.)
3. **Bate com contabilidade?** (declarado × razão do Domínio)
4. **Bate com pagamento?** (declarado × pago)
5. **Foto histórica preservada?** (arquivo transmitido × razão de hoje — detecta alteração pós-transmissão)

### 9.4 Regras derivadas em 20/07/2026

- **GIAM não é raspagem — é leitura de arquivo.** O Higor gera o arquivo GIAM no Domínio, salva na pasta do cliente, a plataforma varre. Motivo: o arquivo é a **foto do momento da declaração**, comparável com o razão de hoje pra detectar alterações posteriores. Raspagem no portal só mostraria a versão vigente hoje, sem histórico. Tasks #1 e #4 (robô GIAM) **canceladas**.
- **Regra "não armazenar arquivos"** vale pra TODAS as fontes: lê, extrai valores, descarta o binário. Só dados + hash pra dedup no banco.
- **API do Domínio não expõe leitura** (só recebe NF-e de ERPs). Dados do Domínio entram por arquivo (PDF/Excel exportado) + varredura de pasta.
- **Integra Contador NÃO tem SPED** (nenhum dos 19 sistemas do catálogo). Serve pra DCTFWeb, PGDAS-D, DEFIS, CAIXAPOSTAL, SITFIS.
- **Retroativo (≤ 12/2025) é manual** — só processa quando alguém pede auditoria antiga. ≥ 01/2026 é automático (varredura mensal).

### 9.5 O que já está pronto (20/07/2026, tarde)

- Schema: `Cliente.pastaFiscal`, `Cliente.senhaSefaz` (cifrada), `SpedApuracao`, `SpedImportacao` (com hash SHA-256 pra dedup)
- Cadastro do cliente: campos IE + Senha SEFAZ + Pasta Fiscal, tudo funcionando
- Parser SPED-Fiscal EFD ICMS/IPI: registro E110 + C100 (compras/vendas)
- Varredura de pasta recursiva: filtra só arquivos com registro E110 (não pega SPED-Contrib/ECF/ECD por engano)
- Rota `POST /api/sped/varrer` + tela `/painel/clientes/[id]/sped`
- Validado com 10 SPEDs da PALMAS HALL 2022: bate 100% com GIAM (débito, ICMS a recolher, crédito consolidado) e ~90% com Domínio (compras/vendas — diferenças são notas complementares, refinar depois)

### 9.6 Fila de trabalho recomendada

1. **Parser arquivo GIAM 10.0** (task #18) — reaproveita 90% da infra do SPED, destrava confronto GIAM × SPED
2. **Parser Demonstrativo Domínio** (task #5) — Higor decide qual dos dois relatórios
3. **Renomear módulo** (task #19) — mover rota pra FISCAL
4. **Matriz consolidada** (task #7) — junta SPED + GIAM + Domínio + Pagamento na tela
5. Depois: **Integra Contador (DCTFWeb, PGDAS)**, **ECF/ECD/EFD-Reinf**, **DARE portal**

