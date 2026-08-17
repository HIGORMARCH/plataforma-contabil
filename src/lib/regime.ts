/**
 * Regime tributário do cliente — helpers de classificação.
 *
 * `Cliente.regimeTributario` é texto livre ("Simples Nacional", "Lucro
 * Presumido", "Lucro Real", "MEI"), preenchido no cadastro ou vindo da consulta
 * de CNPJ. Não é enum: a comparação precisa ser tolerante.
 *
 * Por que importa no ICMS: empresa do Simples não tem apuração normal de ICMS
 * (está dentro do DAS). O que ela recolhe à parte, em guia estadual própria, é
 * a COMPLEMENTAÇÃO DE ALÍQUOTA e o DIFERENCIAL DE ALÍQUOTA das entradas. Por
 * isso a tela de confronto muda qual linha é a principal conforme o regime.
 */

const SIMPLES_LABELS = ["Simples Nacional", "SIMPLES", "Simples", "MEI"];

export function ehSimples(regime: string | null | undefined): boolean {
  if (!regime) return false;
  const r = regime.trim().toLowerCase();
  return SIMPLES_LABELS.some((l) => r.includes(l.toLowerCase()));
}
