# Escopo — Plataforma Contábil March

## O que a plataforma FAZ

### Cadastro e contexto
- Cadastro de clientes com CNPJ, regime tributário, sócios, exercícios
- Cadastro de plano de contas (importado do Domínio, referencial RFB)

### Conciliação Domínio × ECD
- Balanço Patrimonial hierárquico (raiz → subgrupo → nível 3)
- DRE em tabela plana (não é hierárquica)
- Comparação Δ por conta nível 3 com marcador ✗ vermelho quando diverge
- Extrai valores do PDF Domínio e do SPED-ECD `.txt` (bloco J: J005, J100, J150)

### Conciliação por regime
- **Real/Presumido:** Domínio × ECD
- **Simples Nacional:** Domínio × DEFIS
- **MEI:** não se aplica

### DCTFWeb × SPED (matriz de ação)
- Detecta divergência entre movimento SPED e DCTFWeb transmitida
- Sugere ação corretiva: FAZER declaração / RETIFICAR / TRANSMITIR pendente
- Reconhece padrão "valor simbólico 1/1/0" da DCTF antiga como "sem movimento protocolar"

### Análise de demonstrações
- Indicadores contábeis por exercício (liquidez, endividamento, giro)
- Comparativo entre anos (até nível 3 apenas)
- Nunca desce nas analíticas

### Auditoria de obrigações acessórias (motor de dados fiscais)
- Módulos: DCTF, DCTFWeb, SPED-Fiscal, EFD-Contribuições, ECD, ECF, PGDASD, DEFIS
- Detecta declaração faltante, retificação necessária, incompatibilidades

### Conciliação estadual (v1)
- ICMS próprio: GIAM × Razão em 3 linhas por competência (crédito, débito, saldo a recolher)
- Layout GIAM 10.0 validado (posições fixas)
- Automação SEFAZ-TO pra captura histórica
- SEM ICMS-ST na v1

### Integra Contador (RFB)
- PGDASD (Simples): consulta e emite DAS
- DCTFWEB: consulta situação
- CAIXAPOSTAL: lê mensagens da caixa postal
- CCMEI: consulta MEI

## O que a plataforma NÃO FAZ

- **Não é ERP** — MarchERP resolve isso separado
- **Não emite nota fiscal**
- **Não gerencia folha** (folha é lida pra conciliação, mas cálculo é externo)
- **Não altera arquivo no servidor de terceiro** — opera SÓ em cópia local
- **Não guarda arquivos originais no banco** — extrai dados e descarta
- **Não é SaaS multi-tenant** — instância única por escritório, self-hosted
- **Não desce abaixo de nível 3** em análises (por regra do dono)
- **Não emite parecer contábil** — plataforma sinaliza, contador decide
- **Não conserta dados** — parser é fiel, alertas são visíveis, contador atua

## Fronteiras com outros sistemas do Higor

| Sistema | Escopo | Fronteira |
|---|---|---|
| **MarchERP** | ERP interno (financeiro, kanri, contratos) | Não misturar com contabilidade |
| **March Cofre** | Captura de e-mails/anexos via M365 Graph | Alimenta plataforma, não é ela |
| **march-portal-web** | HTMLs standalone client-side pra conferências | Ferramentas ad-hoc, Jali orquestra |
| **Jali** | Agente contábil (futuro) | Vai orquestrar plataforma + portal + cofre |
