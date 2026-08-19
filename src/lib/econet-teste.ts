/**
 * Teste de sanidade da sessão da Econet — o "canário".
 *
 * A ideia: consultar um NCM cuja resposta a gente conhece de cor e comparar.
 * Se a resposta certa vier, a corrente inteira está viva (sessão + rede +
 * layout + parser). Se vier qualquer outra coisa, alguma coisa quebrou e a
 * tela diz o quê — em vez de a gente descobrir um mês depois, com dezenas de
 * NCMs gravados errado na base compartilhada.
 *
 * O canário é xampu (NCM 3305.10.00): monofásico clássico de PIS/COFINS
 * (Lei 10.147/2000). Serve bem justamente porque um resultado "normal" aqui é
 * sempre errado — enquanto num NCM qualquer "normal" costuma ser a resposta
 * certa (a semente Autmais só cobre regimes especiais; tributado normal não
 * está nela). Um canário que pudesse legitimamente ser "normal" não detectaria
 * nada.
 */

import { consultarNcmEconet } from "./consulta-econet";
import { carregarSessaoEconet } from "./econet-sessao";

/** NCM de resposta conhecida usado como canário. */
export const NCM_CANARIO = "33051000";
export const TIPO_ESPERADO_CANARIO = "monofasico";

export interface ResultadoTesteEconet {
  ok: boolean;
  /** Rótulo curto pra tela. */
  situacao:
    | "SESSAO_OK"
    | "SESSAO_AUSENTE"
    | "SESSAO_EXPIRADA"
    | "LAYOUT_MUDOU"
    | "ERRO_REDE"
    | "RESULTADO_INESPERADO";
  mensagem: string;
  /** O que fazer a respeito — texto pro contador, não pro dev. */
  acao: string;
  ncmTestado: string;
  tipoRecebido?: string;
  sessaoRenovadaEm?: Date | null;
}

export async function testarSessaoEconet(escritorioId: string): Promise<ResultadoTesteEconet> {
  const sessao = await carregarSessaoEconet(escritorioId);
  if (!sessao) {
    return {
      ok: false,
      situacao: "SESSAO_AUSENTE",
      mensagem: "Nenhuma sessão da Econet está guardada nesta instalação.",
      acao: "Clique em “Renovar sessão da Econet” e faça o login na janela que abrir.",
      ncmTestado: NCM_CANARIO,
    };
  }

  const r = await consultarNcmEconet(NCM_CANARIO, "varejo", sessao);

  if (r.diagnostico === "SESSAO_EXPIRADA") {
    return {
      ok: false,
      situacao: "SESSAO_EXPIRADA",
      mensagem: "A Econet devolveu a tela de login: a sessão guardada venceu.",
      acao: "Clique em “Renovar sessão da Econet”. Nada precisa ser corrigido no sistema.",
      ncmTestado: NCM_CANARIO,
      sessaoRenovadaEm: sessao.renovadaEm,
    };
  }

  if (r.diagnostico === "ERRO_REDE") {
    return {
      ok: false,
      situacao: "ERRO_REDE",
      mensagem: r.erro ?? "Não foi possível falar com a Econet.",
      acao: "Verifique a conexão com a internet e tente de novo.",
      ncmTestado: NCM_CANARIO,
      sessaoRenovadaEm: sessao.renovadaEm,
    };
  }

  if (r.diagnostico === "LAYOUT_MUDOU" || r.diagnostico === "NCM_INEXISTENTE") {
    // "NCM inexistente" no canário é impossível na prática: xampu existe. Se a
    // Econet disser que não existe, quem mudou foi ela, não o produto.
    return {
      ok: false,
      situacao: "LAYOUT_MUDOU",
      mensagem:
        r.diagnostico === "NCM_INEXISTENTE"
          ? `A Econet respondeu que o NCM ${NCM_CANARIO} (xampu) não existe — o que não é possível.`
          : (r.erro ?? "A Econet respondeu uma página inesperada."),
      acao:
        "A sessão está viva, mas o site mudou de formato. Isso precisa de ajuste no código — " +
        "avise o desenvolvedor antes de consultar NCMs em lote.",
      ncmTestado: NCM_CANARIO,
      sessaoRenovadaEm: sessao.renovadaEm,
    };
  }

  if (r.tipo !== TIPO_ESPERADO_CANARIO) {
    return {
      ok: false,
      situacao: "RESULTADO_INESPERADO",
      mensagem: `A consulta funcionou, mas classificou xampu como “${r.tipo}” em vez de monofásico.`,
      acao:
        "Ou a Econet mudou o conteúdo da página, ou a leitura das abas precisa de ajuste. " +
        "Confira um NCM na mão no site antes de confiar numa consulta em lote.",
      ncmTestado: NCM_CANARIO,
      tipoRecebido: r.tipo,
      sessaoRenovadaEm: sessao.renovadaEm,
    };
  }

  return {
    ok: true,
    situacao: "SESSAO_OK",
    mensagem: "Sessão viva: o NCM de teste (xampu) voltou como monofásico, que é o esperado.",
    acao: "Pode consultar NCMs normalmente.",
    ncmTestado: NCM_CANARIO,
    tipoRecebido: r.tipo,
    sessaoRenovadaEm: sessao.renovadaEm,
  };
}
