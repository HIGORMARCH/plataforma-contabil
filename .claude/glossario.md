# Glossário — Plataforma Contábil March

Termos do domínio contábil-fiscal recorrentes na plataforma.

## Obrigações e declarações

- **ECD** — Escrituração Contábil Digital. Bloco J traz demonstrações (J005 = tipo, J100 = BP, J150 = DRE). Armadilha: J150 campo 8 vs campo 10.
- **ECF** — Escrituração Contábil Fiscal. Complementar à ECD.
- **SPED-Fiscal (EFD-ICMS/IPI)** — escrituração fiscal estadual. Substituirá GIAM em TO a partir de 01/2026 pro Regime Normal.
- **EFD-Contribuições** — escrituração de PIS/COFINS.
- **DCTF** — Declaração de Débitos e Créditos Tributários Federais (antiga). Valor simbólico 1/1/0 significava "sem movimento protocolar" (declaração exigia valor > 0).
- **DCTFWeb** — sucessora da DCTF. Módulos 4200 (folha) e mensal geral.
- **PGDASD** — apuração do Simples Nacional. Regime de apuração (caixa/competência) é do Simples, não do CNPJ.
- **DEFIS** — declaração anual do Simples. Substitui a ECD pra ME/EPP no cruzamento contábil.
- **GIAM** — Guia de Informação e Apuração Mensal do ICMS (TO). Layout 10.0 posicional. Fim programado pra 12/2026.
- **DAS** — Documento de Arrecadação do Simples.
- **CCMEI** — Certificado da Condição de Microempreendedor Individual.

## Contábeis

- **Balanço Patrimonial (BP)** — foto do patrimônio na data de encerramento.
- **DRE** — Demonstração do Resultado do Exercício.
- **AC / ANC** — Ativo Circulante / Ativo Não Circulante.
- **PC / PNC** — Passivo Circulante / Passivo Não Circulante.
- **PL** — Patrimônio Líquido.
- **Reservas de Capital (2.3.2)** — sintética própria no PL. Diferente de Lucros Acumulados. Ver `decisoes.md`.
- **Nível 3 do plano de contas** — profundidade máxima para conciliação/comparativos. Ex.: `1.1.1`, `2.1.4`, `2.3.5`.
- **Reclassificação** — subgrupo bate, subconta muda. NÃO é divergência.
- **Divergência** — saldos totais divergem. Problema real.
- **Analítica** — folha do plano de contas (nível 4+). Não usada em comparação.
- **Sintética** — conta agregadora (nível 3 ou acima).
- **Plug de PL** — valor calculado por diferença: `plug = grupo_PL - capital - reservas`. Vira Lucros ou Prejuízos Acumulados conforme sinal.

## Regimes tributários

- **Lucro Real** — apuração sobre lucro contábil ajustado. Cruza Domínio × ECD.
- **Lucro Presumido** — apuração sobre receita bruta com percentual. Cruza Domínio × ECD.
- **Simples Nacional (Anexos I-V)** — unificado. Cruza Domínio × DEFIS.
- **MEI** — Microempreendedor Individual. Sem cruzamento contábil na plataforma.

## Domínios técnicos

- **Domínio Sistemas** — software de escrituração contábil dos clientes March. PDF de balanço vem daí.
- **Onvio** — plataforma Thomson Reuters. Alguns clientes usam.
- **Integra Contador** — API pública da RFB. IDs: `idSistema` + `idServico`.
- **ReceitanetBX** — pasta local com XMLs de NFe. Fonte externa, NÃO editar.
- **Fonte única `C:\PlataformaContabil\<CLIENTE>_<CNPJ>\<TIPO>\<ANO>\`** — pasta padronizada onde arquivos ficam depois de copiados. Plataforma lê SÓ dali.

## Fluxo de auditoria

- **Cascata Fiscal → Folha → Contábil** — ordem de fechamento. Contábil só sobe com os outros dois fechados.
- **Motor de dados fiscais** — módulo de auditoria de obrigações que alimenta os outros módulos com base normalizada.
- **Matriz de ação DCTFWeb × SPED** — classifica cada CNPJ/competência em: FAZER, RETIFICAR, TRANSMITIR pendente, OK.

## Servidores e infra

- **Servidor MARCH `192.168.248.150`** — destino do dump Postgres em `Z:\HIGOR\Dev\`.
- **Servidor VOECLOUD `192.168.248.220`** — deploy futuro. Windows Server, admin local, 16GB RAM.
- **Tailscale** — VPN mesh pra acesso remoto entre PCs do Higor.
- **AnyDesk** — controle visual remoto. Backup do SSH.
