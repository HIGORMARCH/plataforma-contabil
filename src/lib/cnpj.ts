/**
 * Consulta de dados cadastrais pelo CNPJ (Cartão CNPJ da Receita Federal),
 * via API pública BrasilAPI, com fallback para a ReceitaWS.
 *
 * Retorna os campos já mapeados para o cadastro de cliente. A consulta é
 * apenas um AUXÍLIO ao cadastro — o contador confere e completa os dados
 * (inscrição estadual, regime tributário detalhado, etc.) antes de salvar.
 */

export interface DadosCNPJ {
  razaoSocial?: string;
  nomeFantasia?: string;
  cnpj?: string;
  cnaePrincipal?: string;
  naturezaJuridica?: string;
  municipio?: string;
  uf?: string;
  porte?: string;
  regimeTributario?: string;
  telefone?: string;
  email?: string;
  situacaoCadastral?: string;
}

export function soDigitos(cnpj: string): string {
  return (cnpj || "").replace(/\D/g, "");
}

export function formatarCNPJ(d: string): string {
  const x = soDigitos(d).padStart(14, "0").slice(0, 14);
  return `${x.slice(0, 2)}.${x.slice(2, 5)}.${x.slice(5, 8)}/${x.slice(8, 12)}-${x.slice(12, 14)}`;
}

function mapearPorte(p?: string): string | undefined {
  if (!p) return undefined;
  const s = p.toUpperCase();
  if (s.includes("PEQUENO")) return "EPP";
  if (s.includes("MICRO")) return "ME";
  if (s.includes("DEMAIS")) return "Demais";
  return undefined;
}

function formatarTelefone(t?: string): string | undefined {
  if (!t) return undefined;
  const d = soDigitos(t);
  if (d.length < 10) return t;
  const ddd = d.slice(0, 2);
  const resto = d.slice(2);
  return resto.length === 9
    ? `(${ddd}) ${resto.slice(0, 5)}-${resto.slice(5)}`
    : `(${ddd}) ${resto.slice(0, 4)}-${resto.slice(4)}`;
}

/** Consulta na BrasilAPI. */
async function viaBrasilAPI(cnpj: string): Promise<DadosCNPJ | null> {
  const r = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${cnpj}`, {
    headers: { accept: "application/json" },
  });
  if (!r.ok) return null;
  const d = (await r.json()) as Record<string, unknown>;
  const str = (k: string) => (d[k] == null ? undefined : String(d[k]).trim() || undefined);
  return {
    razaoSocial: str("razao_social"),
    nomeFantasia: str("nome_fantasia"),
    cnpj: formatarCNPJ(cnpj),
    cnaePrincipal: d["cnae_fiscal"]
      ? `${str("cnae_fiscal")} — ${str("cnae_fiscal_descricao") ?? ""}`.trim()
      : str("cnae_fiscal_descricao"),
    naturezaJuridica: str("natureza_juridica"),
    municipio: str("municipio"),
    uf: str("uf"),
    porte: mapearPorte(str("porte")),
    regimeTributario: d["opcao_pelo_mei"] ? "MEI" : d["opcao_pelo_simples"] ? "Simples Nacional" : undefined,
    telefone: formatarTelefone(str("ddd_telefone_1")),
    email: str("email"),
    situacaoCadastral: str("descricao_situacao_cadastral"),
  };
}

/** Fallback: ReceitaWS (limite de 3 consultas/min). */
async function viaReceitaWS(cnpj: string): Promise<DadosCNPJ | null> {
  const r = await fetch(`https://receitaws.com.br/v1/cnpj/${cnpj}`, {
    headers: { accept: "application/json" },
  });
  if (!r.ok) return null;
  const d = (await r.json()) as Record<string, unknown>;
  if (d["status"] === "ERROR") return null;
  const str = (k: string) => (d[k] == null ? undefined : String(d[k]).trim() || undefined);
  const atividade = Array.isArray(d["atividade_principal"]) ? (d["atividade_principal"] as Array<Record<string, string>>)[0] : undefined;
  return {
    razaoSocial: str("nome"),
    nomeFantasia: str("fantasia"),
    cnpj: formatarCNPJ(cnpj),
    cnaePrincipal: atividade ? `${atividade.code} — ${atividade.text}` : undefined,
    naturezaJuridica: str("natureza_juridica"),
    municipio: str("municipio"),
    uf: str("uf"),
    porte: mapearPorte(str("porte")),
    regimeTributario: undefined,
    telefone: formatarTelefone(str("telefone")),
    email: str("email"),
    situacaoCadastral: str("situacao"),
  };
}

export async function consultarCNPJ(
  cnpjEntrada: string,
): Promise<{ ok: true; dados: DadosCNPJ } | { ok: false; erro: string }> {
  const cnpj = soDigitos(cnpjEntrada);
  if (cnpj.length !== 14) return { ok: false, erro: "CNPJ deve ter 14 dígitos." };
  try {
    const dados = (await viaBrasilAPI(cnpj)) ?? (await viaReceitaWS(cnpj));
    if (!dados || !dados.razaoSocial) {
      return { ok: false, erro: "CNPJ não encontrado na base da Receita." };
    }
    return { ok: true, dados };
  } catch (e) {
    return { ok: false, erro: `Falha ao consultar a Receita: ${(e as Error).message}` };
  }
}
