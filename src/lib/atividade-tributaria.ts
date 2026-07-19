/**
 * Deduz a atividade tributária (varejo / atacado / fabricante / importador)
 * a partir do CNAE principal da empresa.
 *
 * Essa classificação define qual aba da Econet o sistema deve consultar
 * para descobrir a Natureza da Receita correta em NCMs monofásicos.
 *
 * Regra pragmática — o contador pode SEMPRE editar depois pra empresas mistas
 * ou casos atípicos. Isso é só o palpite inicial.
 *
 * Referência: seções da CNAE 2.3 mais frequentes no comércio/indústria brasileira.
 */

export type AtividadeTributaria = "varejo" | "atacado" | "fabricante" | "importador" | "servico";

/** Retorna só os dígitos de "4781-4/00" -> "478100" (código sem hífen/barra). */
function digitos(cnae: string): string {
  return (cnae || "").replace(/\D/g, "");
}

/** Devolve a Seção CNAE 2.3 (letra A-U) a partir dos 5 primeiros dígitos. */
function secaoCnae(codigo5: string): string {
  const div = Number(codigo5.slice(0, 2));
  if (div >= 1 && div <= 3) return "A"; // agropecuária
  if (div >= 5 && div <= 9) return "B"; // extrativa
  if (div >= 10 && div <= 33) return "C"; // indústria de transformação
  if (div === 35) return "D"; // eletricidade
  if (div >= 36 && div <= 39) return "E"; // água/esgoto
  if (div >= 41 && div <= 43) return "F"; // construção
  if (div >= 45 && div <= 47) return "G"; // comércio (autoveículos + atacado + varejo)
  if (div >= 49 && div <= 53) return "H"; // transporte
  if (div >= 55 && div <= 56) return "I"; // alojamento/alimentação
  if (div >= 58 && div <= 63) return "J"; // informação/comunicação
  if (div >= 64 && div <= 66) return "K"; // financeiro
  if (div >= 68 && div <= 68) return "L"; // imobiliária
  if (div >= 69 && div <= 75) return "M"; // profissionais
  if (div >= 77 && div <= 82) return "N"; // administrativas
  return "?";
}

/**
 * Mapeia CNAE principal -> atividade tributária.
 * @param cnaePrincipal — pode vir formatado ("4781-4/00") ou só dígitos ("478100").
 */
export function atividadeTributariaFromCnae(cnaePrincipal: string | null | undefined): AtividadeTributaria | null {
  if (!cnaePrincipal) return null;
  const d = digitos(cnaePrincipal);
  if (d.length < 5) return null;
  const div = Number(d.slice(0, 2));

  // Comércio VAREJISTA — Divisão 47 (Comércio varejista)
  if (div === 47) return "varejo";

  // Comércio ATACADISTA — Divisão 46
  if (div === 46) return "atacado";

  // Comércio de veículos (auto/moto) — Divisão 45 — trato como varejo/atacado misto
  // Se o subgrupo indicar oficina/manutenção, é serviço; se for revenda, varejo.
  if (div === 45) {
    const grupo = Number(d.slice(2, 3));
    if (grupo === 2) return "servico"; // manutenção
    return "varejo";
  }

  // Indústria de transformação — Divisão 10..33 = FABRICANTE
  if (div >= 10 && div <= 33) return "fabricante";

  // Extrativa — Divisão 5..9 = fabricante (produtor primário)
  if (div >= 5 && div <= 9) return "fabricante";

  // Agropecuária — 1..3 = fabricante
  if (div >= 1 && div <= 3) return "fabricante";

  // Demais setores tratados como serviço (não relevante pra tributação de mercadoria)
  return "servico";
}

/**
 * Legenda amigável pra UI.
 */
export const ROTULO_ATIVIDADE_TRIBUTARIA: Record<AtividadeTributaria, string> = {
  varejo: "Varejo",
  atacado: "Atacado",
  fabricante: "Indústria / Fabricante",
  importador: "Importador",
  servico: "Prestador de serviços",
};

/**
 * Retorna se a atividade compra pra revender (releva pra escolher aba da Econet).
 */
export function isRevendedor(a: AtividadeTributaria | null | undefined): boolean {
  return a === "varejo" || a === "atacado";
}
