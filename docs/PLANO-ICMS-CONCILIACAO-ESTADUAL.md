# Aplicação do ICMS — Conciliação de Pagamentos de Impostos Estaduais

> **Leia este arquivo primeiro.** Passagem de bastão para a sessão dedicada.
> Preparado pela Jali em 20/07/2026 · Janela de trabalho do Higor: **09h–10h implementar · 11h–12h testar**

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
