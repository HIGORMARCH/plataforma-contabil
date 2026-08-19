import { describe, it, expect } from "vitest";
import { diagnosticarPagina } from "./consulta-econet";

/**
 * Estes testes guardam a distinção que faltava em 17/07/2026, quando a sessão
 * da Econet venceu e 70 consultas voltaram "NCM não encontrado" — a mesma
 * mensagem de NCM que realmente não existe. Ninguém percebeu por um mês.
 *
 * O que precisa continuar valendo: tela de login NUNCA pode ser lida como
 * resposta legítima da busca.
 */
describe("diagnosticarPagina", () => {
  it("reconhece a tela de busca como sessão viva", () => {
    const html = `
      <form>
        <input type="hidden" name="form[tipo_busca]" value="ncm" />
        <input type="text" name="form[palavra_chave]" />
      </form>`;
    expect(diagnosticarPagina(html)).toBe("logado");
  });

  it("reconhece a tela de login pelo campo de senha", () => {
    const html = `
      <form action="/login">
        <input type="text" name="usuario" />
        <input type="password" name="senha" />
      </form>`;
    expect(diagnosticarPagina(html)).toBe("login");
  });

  it("continua 'logado' quando a página interna tem área de assinante no topo", () => {
    // Falso positivo que a heurística precisa evitar: um <input type=password>
    // no cabeçalho não significa que fomos deslogados, desde que o formulário
    // de busca esteja na página.
    const html = `
      <div id="topo"><input type="password" name="senha_assinante" /></div>
      <form><input type="hidden" name="form[tipo_busca]" value="ncm" /></form>`;
    expect(diagnosticarPagina(html)).toBe("logado");
  });

  it("marca como desconhecido a página que não é login nem busca", () => {
    // Manutenção do site, erro do PHP, redirecionamento novo — qualquer coisa
    // que não reconhecemos vira LAYOUT_MUDOU, nunca uma classificação.
    expect(diagnosticarPagina("<html><body><h1>Em manutenção</h1></body></html>")).toBe(
      "desconhecido",
    );
  });

  it("aceita aspas simples e maiúsculas nos atributos", () => {
    expect(diagnosticarPagina(`<INPUT TYPE='PASSWORD' NAME='x'>`)).toBe("login");
    expect(diagnosticarPagina(`<input name='form[palavra_chave]'>`)).toBe("logado");
  });
});
