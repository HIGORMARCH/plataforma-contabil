/**
 * REVISÃO CRÍTICA ANTI-VIÉS (contraditório técnico).
 *
 * Recebe a conclusão escrita pelo CONTADOR e a confronta com os dados objetivos
 * calculados pelo motor. O objetivo é combater o VIÉS DE CONFIRMAÇÃO: apontar
 * divergências entre o que o contador concluiu e o que os números mostram,
 * riscos que ele deixou de mencionar e afirmações sem respaldo — além de fazer
 * perguntas que desafiam o raciocínio.
 *
 * NÃO reescreve a conclusão. É um parecer crítico para o contador ler e decidir;
 * a responsabilidade permanece dele.
 */

import type { ResultadoAnalise } from "../accounting/analyze";
import { ROTULO_SITUACAO } from "../accounting/analyze";

export interface ObservacaoCritica {
  tipo: "divergencia" | "omissao" | "excesso";
  texto: string;
}

export interface RevisaoCritica {
  alinhamento: "alinhado" | "atencao" | "divergente";
  resumo: string;
  observacoes: ObservacaoCritica[];
  perguntas: string[];
  textoIA?: string;
  origem: "ia" | "deterministico";
  observacaoIA?: string;
}

function norm(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

const POSITIVOS = [
  "favoravel", "saudavel", "tranquil", "boa situacao", "solida", "solido", "positiv",
  "confortavel", "estavel", "equilibrad", "regular", "satisfatori", "otim", "excelente", "forte",
];
const NEGATIVOS = [
  "critic", "grave", "risco", "fragil", "fraqueza", "preocup", "insolv", "prejuizo",
  "negativ", "deficit", "alerta", "descapitaliz", "endivid", "passivo a descoberto", "atencao",
];

function tom(texto: string): "positivo" | "negativo" | "neutro" {
  const t = norm(texto);
  let p = 0, n = 0;
  for (const w of POSITIVOS) if (t.includes(w)) p++;
  for (const w of NEGATIVOS) if (t.includes(w)) n++;
  if (p > n + 1) return "positivo";
  if (n > p) return "negativo";
  return "neutro";
}

/** Riscos presentes nos dados e as palavras que indicariam que a conclusão os tratou. */
function riscosPresentes(analise: ResultadoAnalise): { rotulo: string; termos: string[] }[] {
  const riscos: { rotulo: string; termos: string[] }[] = [];

  const inconsistencias = [
    ...analise.exercicios.flatMap((e) => e.inconsistencias),
    ...analise.inconsistenciasVariacao,
  ].filter((i) => i.severidade !== "info");
  const codigos = new Set(inconsistencias.map((i) => i.codigo));
  if (codigos.has("PL_NEGATIVO"))
    riscos.push({ rotulo: "Patrimônio Líquido negativo (passivo a descoberto)", termos: ["patrimonio", "passivo a descoberto", "prejuizos acumulados", "negativo", "descapitaliz"] });
  if (codigos.has("BP_NAO_FECHA") || codigos.has("BP_INCOMPLETO"))
    riscos.push({ rotulo: "Inconsistência no fechamento do Balanço", termos: ["balanco", "fecha", "inconsist", "divergenc"] });

  const criticos = analise.indicadoresRecentes.filter((i) => i.classificacao === "critico");
  const temLiquidez = criticos.some((i) => i.categoria === "liquidez");
  const temEndiv = criticos.some((i) => i.categoria === "endividamento");
  const temRent = criticos.some((i) => i.categoria === "rentabilidade");
  if (temLiquidez)
    riscos.push({ rotulo: "Liquidez crítica (capacidade de pagar contas de curto prazo)", termos: ["liquidez", "caixa", "capital de giro", "curto prazo", "pagar"] });
  if (temEndiv)
    riscos.push({ rotulo: "Endividamento crítico", termos: ["endivid", "divida", "terceiros", "alavanc"] });
  if (temRent)
    riscos.push({ rotulo: "Rentabilidade/resultado crítico", termos: ["margem", "prejuizo", "rentabil", "resultado negativo", "lucro"] });

  return riscos;
}

const AFIRMACOES_SEM_BASE: { termo: string; alerta: string }[] = [
  { termo: "regularidade fiscal", alerta: "afirmar regularidade fiscal exige documentos fiscais, fora do escopo desta análise" },
  { termo: "sem risco", alerta: "\"sem risco\" é uma afirmação absoluta difícil de sustentar" },
  { termo: "nenhum risco", alerta: "\"nenhum risco\" é uma afirmação absoluta difícil de sustentar" },
  { termo: "garantid", alerta: "garantias não podem ser asseguradas só pelos demonstrativos" },
  { termo: "totalmente seguro", alerta: "afirmação absoluta de segurança não se sustenta nos dados" },
  { termo: "100%", alerta: "certezas de 100% raramente se sustentam em análise contábil" },
  { termo: "conformidade legal plena", alerta: "conformidade legal plena exige validação jurídica/fiscal, fora do escopo" },
];

/** Parecer crítico determinístico, comparando a conclusão do contador com os dados. */
export function revisaoCriticaDeterministica(
  analise: ResultadoAnalise,
  conclusao: string[],
  comentario?: string,
): RevisaoCritica {
  const texto = [...conclusao, comentario ?? ""].join(" ");
  const textoNorm = norm(texto);
  const observacoes: ObservacaoCritica[] = [];

  const tomConcl = tom(texto);
  const sit = analise.situacao;

  // 1) Divergência de tom entre a conclusão e a situação apurada.
  if (tomConcl === "positivo" && (sit === "critica" || analise.resumo.critico >= 2)) {
    observacoes.push({
      tipo: "divergencia",
      texto: `Sua conclusão soa POSITIVA, mas os dados indicam "${ROTULO_SITUACAO[sit]}" (${analise.resumo.critico} indicador(es) crítico(s)). Vale checar se não há viés de confirmação — a impressão prévia pode estar pesando mais que os números.`,
    });
  }
  if (tomConcl === "negativo" && sit === "favoravel") {
    observacoes.push({
      tipo: "divergencia",
      texto: `Sua conclusão soa NEGATIVA, mas os indicadores apontam situação favorável. Confirme se a cautela tem respaldo nos dados ou se reflete uma percepção externa.`,
    });
  }
  if (tomConcl === "neutro" && sit === "critica") {
    observacoes.push({
      tipo: "divergencia",
      texto: `Os dados apontam situação CRÍTICA, mas a conclusão não transmite essa gravidade com clareza. Avalie se o tom reflete o risco real.`,
    });
  }

  // 2) Riscos presentes nos dados que a conclusão não menciona.
  for (const risco of riscosPresentes(analise)) {
    const mencionado = risco.termos.some((t) => textoNorm.includes(t));
    if (!mencionado) {
      observacoes.push({
        tipo: "omissao",
        texto: `Os dados evidenciam "${risco.rotulo}", mas a conclusão não parece abordar isso. Foi uma escolha consciente ou uma omissão?`,
      });
    }
  }

  // 3) Afirmações fortes/absolutas sem base nos demonstrativos.
  for (const a of AFIRMACOES_SEM_BASE) {
    if (textoNorm.includes(norm(a.termo))) {
      observacoes.push({
        tipo: "excesso",
        texto: `A conclusão contém "${a.termo}" — ${a.alerta}.`,
      });
    }
  }

  // 4) Perguntas que desafiam o raciocínio (anti-viés).
  const perguntas: string[] = [];
  const criticosNaoMencionados = analise.indicadoresRecentes
    .filter((i) => i.classificacao === "critico")
    .filter((i) => !norm(i.nome).split(" ").some((p) => p.length > 4 && textoNorm.includes(p)))
    .map((i) => i.nome);
  if (criticosNaoMencionados.length) {
    perguntas.push(
      `Os indicadores ${criticosNaoMencionados.slice(0, 3).join(", ")} estão críticos — sua conclusão reflete o que eles mostram?`,
    );
  }
  perguntas.push("Existe algum dado neste relatório que CONTRARIA a sua conclusão? Você o considerou explicitamente?");
  perguntas.push("Se você não tivesse nenhuma impressão prévia sobre esta empresa, chegaria à mesma conclusão só com estes números?");
  perguntas.push("Que evidência adicional faria você MUDAR de conclusão? Ela está disponível?");

  // Alinhamento geral.
  const divergencias = observacoes.filter((o) => o.tipo === "divergencia").length;
  const alinhamento: RevisaoCritica["alinhamento"] =
    divergencias > 0 ? "divergente" : observacoes.length > 0 ? "atencao" : "alinhado";

  const resumo =
    alinhamento === "alinhado"
      ? "Sua conclusão está coerente com os dados. Ainda assim, revise as perguntas para garantir que não há pontos cegos."
      : alinhamento === "atencao"
        ? "Há pontos que merecem atenção: riscos não mencionados ou afirmações a revisar. Veja abaixo."
        : "Atenção: foram detectadas divergências entre sua conclusão e os dados. Vale revisar para evitar viés de confirmação.";

  return { alinhamento, resumo, observacoes, perguntas, origem: "deterministico" };
}

/** Versão com IA (Anthropic) quando há chave; senão devolve a determinística. */
export async function gerarRevisaoCritica(
  analise: ResultadoAnalise,
  conclusao: string[],
  comentario?: string,
): Promise<RevisaoCritica> {
  const base = revisaoCriticaDeterministica(analise, conclusao, comentario);
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return { ...base, observacaoIA: "Parecer determinístico (defina ANTHROPIC_API_KEY para o raciocínio crítico por IA)." };
  }

  try {
    const indicadores = analise.indicadoresRecentes.map((i) => ({
      nome: i.nome,
      valor: i.valorFormatado,
      classificacao: i.classificacao,
    }));
    const payload = {
      situacaoApurada: analise.situacao,
      bloqueado: analise.bloqueado,
      indicadores,
      conclusaoDoContador: conclusao,
      comentarioDoContador: comentario ?? "",
    };
    const resp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({
        model: process.env.ANTHROPIC_MODEL || "claude-sonnet-4-6",
        max_tokens: 1200,
        system:
          "Você é um REVISOR TÉCNICO INDEPENDENTE e cético, contador sênior. Recebe os dados objetivos de uma análise contábil JÁ CALCULADA e a CONCLUSÃO escrita por outro contador. " +
          "Sua função é combater o VIÉS DE CONFIRMAÇÃO: questionar a conclusão, apontar onde ela diverge dos números, o que foi omitido e quais afirmações não têm respaldo. EXPLIQUE o porquê. " +
          "NUNCA reescreva a conclusão nem invente números. NÃO afirme regularidade fiscal. Seja direto, respeitoso e específico. Responda em português, em até 5 parágrafos curtos.",
        messages: [
          {
            role: "user",
            content:
              "Faça a revisão crítica (anti-viés) da conclusão do contador, com base apenas nestes dados:\n" +
              JSON.stringify(payload, null, 2),
          },
        ],
      }),
    });
    if (!resp.ok) return { ...base, observacaoIA: `IA indisponível (HTTP ${resp.status}); mantido o parecer determinístico.` };
    const data = (await resp.json()) as { content?: Array<{ type: string; text?: string }> };
    const textoIA = data.content?.find((c) => c.type === "text")?.text?.trim();
    if (!textoIA) return { ...base, observacaoIA: "IA não retornou texto; mantido o parecer determinístico." };
    return { ...base, textoIA, origem: "ia", observacaoIA: "Raciocínio crítico por IA. É um parecer auxiliar — a decisão e a responsabilidade são do contador." };
  } catch (e) {
    return { ...base, observacaoIA: `Erro na IA: ${(e as Error).message}. Mantido o parecer determinístico.` };
  }
}
