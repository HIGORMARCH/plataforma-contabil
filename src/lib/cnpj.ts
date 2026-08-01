/**
 * Consulta de dados cadastrais pelo CNPJ (Cartão CNPJ da Receita Federal),
 * via API pública BrasilAPI, com fallback para a ReceitaWS.
 *
 * Retorna os campos já mapeados para o cadastro de cliente. A consulta é
 * apenas um AUXÍLIO ao cadastro — o contador confere e completa os dados
 * (inscrição estadual, regime tributário detalhado, etc.) antes de salvar.
 */

export interface SocioReceita {
  nome: string;
  codigoQualificacao?: number;
  qualificacao?: string;
  cpfCnpjMascarado?: string;
  faixaEtaria?: string;
  dataEntradaSociedade?: string; // ISO yyyy-mm-dd
  nomeRepresentanteLegal?: string;
  cpfRepresentanteMascarado?: string;
  codigoQualificacaoRepresentante?: number;
}

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
  /** Nome do responsável legal (Administrador / Sócio-Administrador / Titular),
   *  escolhido do QSA. Se não achar essa qualificação, cai no 1º sócio. */
  responsavelLegal?: string;
  /** Quadro Societário completo. Persistir na tabela Socio ao salvar. */
  socios?: SocioReceita[];
}

/** Normaliza QSA da BrasilAPI pra SocioReceita[]. */
function normalizarQsaBrasilAPI(qsa: unknown): SocioReceita[] {
  if (!Array.isArray(qsa)) return [];
  return (qsa as Array<Record<string, unknown>>)
    .map((r) => {
      const nome = String(r["nome_socio"] ?? "").trim();
      if (!nome) return null;
      const codigo = r["codigo_qualificacao_socio"];
      const codigoRep = r["codigo_qualificacao_representante_legal"];
      return {
        nome,
        codigoQualificacao: codigo != null ? Number(codigo) : undefined,
        qualificacao: (r["qualificacao_socio"] as string | undefined)?.trim(),
        cpfCnpjMascarado: (r["cnpj_cpf_do_socio"] as string | undefined)?.trim() || undefined,
        faixaEtaria: (r["faixa_etaria"] as string | undefined)?.trim() || undefined,
        dataEntradaSociedade: (r["data_entrada_sociedade"] as string | undefined) || undefined,
        nomeRepresentanteLegal: (r["nome_representante_legal"] as string | undefined)?.trim() || undefined,
        cpfRepresentanteMascarado: (r["cpf_representante_legal"] as string | undefined)?.trim() || undefined,
        codigoQualificacaoRepresentante: codigoRep != null ? Number(codigoRep) : undefined,
      } satisfies SocioReceita;
    })
    .filter(Boolean) as SocioReceita[];
}

/** Idem pra ReceitaWS (formato mais pobre). */
function normalizarQsaReceitaWS(qsa: unknown): SocioReceita[] {
  if (!Array.isArray(qsa)) return [];
  return (qsa as Array<{ nome?: string; qual?: string }>)
    .map((r) => {
      const nome = (r.nome ?? "").trim();
      if (!nome) return null;
      return { nome, qualificacao: r.qual?.trim() || undefined } satisfies SocioReceita;
    })
    .filter(Boolean) as SocioReceita[];
}

/** Escolhe o "responsável legal" mais provável a partir de SocioReceita[]. */
function escolherResponsavelDosSocios(socios: SocioReceita[]): string | undefined {
  if (socios.length === 0) return undefined;
  const codigosResp = new Set([5, 10, 16, 49, 65, 66]);
  const marcadores = /Administrador|Diretor|Presidente|Titular/i;
  const preferido = socios.find(
    (s) =>
      (s.codigoQualificacao !== undefined && codigosResp.has(s.codigoQualificacao)) ||
      (s.qualificacao && marcadores.test(s.qualificacao)),
  );
  return (preferido ?? socios[0]).nome;
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
  // Aceita só 10 (DDD + fixo 8 dígitos) ou 11 (DDD + celular 9 dígitos).
  // Algumas APIs (BrasilAPI, alguns registros) devolvem zeros de padding na cauda —
  // trunca pra o comprimento válido pra não gerar telefone falso.
  const total = d.length >= 11 ? 11 : 10;
  const norm = d.slice(0, total);
  const ddd = norm.slice(0, 2);
  const resto = norm.slice(2);
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
    ...(() => {
      const socios = normalizarQsaBrasilAPI(d["qsa"]);
      return { responsavelLegal: escolherResponsavelDosSocios(socios), socios };
    })(),
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
    ...(() => {
      const socios = normalizarQsaReceitaWS(d["qsa"]);
      return { responsavelLegal: escolherResponsavelDosSocios(socios), socios };
    })(),
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
