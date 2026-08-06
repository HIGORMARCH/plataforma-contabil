/**
 * Tipos e helpers das obrigações acessórias federais suportadas na v1.
 *
 * Os literais são mantidos em String no banco (schema.prisma) pra permitir
 * evolução sem migration — mas o código sempre passa por este enum.
 */

export const TIPOS_OBRIGACAO = [
  "ECD",
  "ECF",
  "EFD_CONTRIBUICOES",
  "DCTF_ANTIGA",
  "DCTFWEB",
  "MIT",
  "PGDAS_D",
  "DEFIS",
] as const;

export type TipoObrigacao = (typeof TIPOS_OBRIGACAO)[number];

export const ROTULOS_OBRIGACAO: Record<TipoObrigacao, string> = {
  ECD: "ECD",
  ECF: "ECF",
  EFD_CONTRIBUICOES: "EFD-Contribuições",
  DCTF_ANTIGA: "DCTF (antiga)",
  DCTFWEB: "DCTFWeb",
  MIT: "MIT",
  PGDAS_D: "PGDAS-D",
  DEFIS: "DEFIS",
};

/** Frequência da obrigação — decide se a competência tem mês ou é só ano-base. */
export function frequencia(tipo: TipoObrigacao): "MENSAL" | "ANUAL" {
  return tipo === "ECD" || tipo === "ECF" || tipo === "DEFIS" ? "ANUAL" : "MENSAL";
}

/** Fonte da data de entrega (proxy da transmissão à Receita). */
export function fonteDataEntrega(
  tipo: TipoObrigacao,
): "ARQUIVO_DISCO" | "APURACAO_BANCO" | "MANUAL" {
  switch (tipo) {
    case "ECD":
    case "ECF":
    case "EFD_CONTRIBUICOES":
    case "DCTF_ANTIGA":
      return "ARQUIVO_DISCO"; // varremos a pasta, mtime = proxy
    case "DCTFWEB":
      return "APURACAO_BANCO"; // vem do SERPRO (dataRecepcao)
    case "MIT":
    case "PGDAS_D":
    case "DEFIS":
      return "MANUAL"; // v1 — depois vira robô ou SERPRO
  }
}

/**
 * Recorte que só se aplica a clientes do Simples Nacional.
 * Fora da v1 fazer histórico de regime — usa o regime atual do cadastro.
 */
export function ehExclusivaDoSimples(tipo: TipoObrigacao): boolean {
  return tipo === "PGDAS_D" || tipo === "DEFIS";
}

/**
 * Recorte que só se aplica a clientes NÃO-Simples (Lucro Real, Presumido,
 * Imune, Isento). ECD/ECF/EFD-Contribuições/DCTF são obrigatórios em regra
 * geral pra Lucro Real e Presumido (Simples usa PGDAS-D consolidado).
 * Regras têm exceções — na v1 exibimos a grade completa pro contador julgar.
 */
export function ehExclusivaNaoSimples(tipo: TipoObrigacao): boolean {
  return false; // v1: mostra tudo, contador decide
}

/**
 * Bloqueio por competência — obrigações que foram substituídas ou ainda não
 * existiam. Retorna true se aquela competência NÃO deve nem aparecer na grade.
 *
 *   - DCTF_ANTIGA: só até 12/2023 (a partir de 01/2024 virou DCTFWeb pra todos)
 *   - DCTFWEB: só a partir de 01/2024 pra tributos gerais. Antes disso só
 *     existia pra contribuições previdenciárias (eSocial+Reinf), fora do
 *     escopo da v1 — omitimos pra não confundir.
 *   - MIT: só a partir de 01/2024 (nasceu junto com a nova DCTFWeb).
 *   - Outras: sempre aplicáveis dentro do range escolhido.
 */
export function foraDaVigencia(
  tipo: TipoObrigacao,
  ano: number,
  mes: number | null,
): boolean {
  if (tipo === "DCTF_ANTIGA") {
    return ano >= 2024;
  }
  if (tipo === "DCTFWEB" || tipo === "MIT") {
    return ano < 2024;
  }
  // ano/mes ignorados pras demais — mantidos na assinatura pra futuras regras.
  void mes;
  return false;
}
