# Acompanhamento do fluxo ReceitanetBX pra automação futura

**Data:** 02/08/2026
**Cliente teste:** PALMAS HALL ACESSORIOS E COMPLEMENTOS LTDA (CNPJ 44.463.938/0001-13)
**Operador:** Higor
**Observador:** Claude (registrando pra depois automatizar com agente)

**Manual operacional oficial:** o Higor forneceu manual completo (23 seções) —
ver a mensagem dele em 02/08/2026 ~14h. Este arquivo REGISTRA o que ele fez na
prática e o que EU (Claude) precisei observar pra automatizar depois.

---

## Checkpoints que preciso observar (pra automatizar via config.json OU RPA)

### Bloco 1 — Instalação e ambiente (uma vez só, não precisa automatizar)
- [ ] Versão do ReceitanetBX instalada (ex.: 1.9.26 X64)
- [ ] Path onde ficou instalado (`C:\Program Files\Receitanetbx\...` ou outro)
- [ ] Java em uso (versão)
- [ ] Certificado A1 ou A3? Onde está?

### Bloco 2 — Estrutura de config e logs (CRUCIAL pra automação)
- [ ] **`config.json`** existe? Onde? Conteúdo (mascarando senhas)
- [ ] Pasta de logs (se houver)
- [ ] Pasta de download padrão
- [ ] Executável CLI? (ex.: `receitanetbx.exe --config config.json`)

### Bloco 3 — Fluxo interativo (o que precisa RPA, se config.json não cobrir)
- [ ] **Tela de seleção de certificado** — captura screenshot pra saber elementos
- [ ] **Tela de seleção de perfil** (próprio vs procurador) — screenshot
- [ ] **Tela nova solicitação** — quais campos, quais dropdowns
- [ ] **Tela pesquisa** — resultados como aparecem, colunas
- [ ] **Tela solicitar arquivo** — botões, confirmações
- [ ] **Tela acompanhamento** — como muda o status (solicitado → processamento → disponível)

### Bloco 4 — Arquivo baixado
- [ ] **Nome do arquivo** que a Receita retornou (padrão real, não o padronizado do manual)
- [ ] **Extensão** (.txt? .zip? .rec?)
- [ ] **Tamanho médio**
- [ ] **Encoding** (UTF-8, latin1, cp1252)
- [ ] Estrutura interna começa com `|0000|...`?

### Bloco 5 — Timing (pra saber timeouts na automação)
- [ ] Tempo do "solicitar" ao "disponível"
- [ ] Tempo do download em si

---

## Registro em tempo real (Higor executa, Claude observa)

_(Higor vai me chamando "olha aqui" quando chegar em cada tela importante. Eu tiro screenshot e registro abaixo.)_

### 1. Instalação
_(a registrar)_

### 2. Abertura + certificado
_(a registrar)_

### 3. Configuração pasta destino
_(a registrar)_

### 4. Nova solicitação — EFD-Contribuições
_(a registrar)_

### 5. Pesquisa
_(a registrar)_

### 6. Solicitação assinada
_(a registrar)_

### 7. Acompanhamento
_(a registrar)_

### 8. Download
_(a registrar)_

### 9. Arquivo baixado
_(a registrar)_

---

## Conclusão (a preencher depois)

### O que dá pra automatizar via `config.json` nativo?

_(a preencher depois de observar)_

### O que exige RPA (Sikuli/AutoIt/UI Automation)?

_(a preencher)_

### Plano de automação recomendado

_(a preencher)_
