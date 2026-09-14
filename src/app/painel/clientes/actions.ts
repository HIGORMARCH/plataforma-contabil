"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireSessao, PAPEIS_INTERNOS } from "@/lib/auth";
import { cifrar } from "@/lib/crypto";

function campo(fd: FormData, nome: string): string | null {
  const v = fd.get(nome);
  const s = v == null ? "" : String(v).trim();
  return s === "" ? null : s;
}

/**
 * Campo de competência (`<input type="month">`, formato "AAAA-MM") → primeiro
 * dia do mês em UTC. Mesma convenção de `periodoApuracao` nas apurações, pra
 * comparar data com data sem susto de fuso.
 */
function campoCompetencia(fd: FormData, nome: string): Date | null {
  const s = campo(fd, nome);
  if (!s) return null;
  const m = /^(\d{4})-(\d{2})$/.exec(s);
  if (!m) return null;
  const ano = Number(m[1]);
  const mes = Number(m[2]);
  if (!ano || mes < 1 || mes > 12) return null;
  return new Date(Date.UTC(ano, mes - 1, 1));
}

export async function criarClienteAction(fd: FormData) {
  const sessao = await requireSessao();
  if (!PAPEIS_INTERNOS.includes(sessao.papel)) redirect("/painel");

  const razaoSocial = campo(fd, "razaoSocial");
  const cnpj = campo(fd, "cnpj");
  if (!razaoSocial || !cnpj) {
    redirect("/painel/clientes/novo?erro=1");
  }

  const metodoAcessoEcac = campo(fd, "metodoAcessoEcac") ?? "PROCURACAO_MARCH";
  const certificadoCaminho = metodoAcessoEcac === "CERTIFICADO_PROPRIO" ? campo(fd, "certificadoCaminho") : null;
  const senhaClara = metodoAcessoEcac === "CERTIFICADO_PROPRIO" ? campo(fd, "certificadoSenha") : null;
  const certificadoSenha = senhaClara ? cifrar(senhaClara) : null;

  const senhaSefazClara = campo(fd, "senhaSefaz");
  const senhaSefaz = senhaSefazClara ? cifrar(senhaSefazClara) : null;
  const pastaFiscal = campo(fd, "pastaFiscal");
  const pastaGiam = campo(fd, "pastaGiam");
  const pastaSpedEcd = campo(fd, "pastaSpedEcd");
  const pastaSpedEcf = campo(fd, "pastaSpedEcf");
  const pastaSpedContribuicoes = campo(fd, "pastaSpedContribuicoes");
  const pastaSpedFiscal = campo(fd, "pastaSpedFiscal");
  const pastaDominio = campo(fd, "pastaDominio");
  const pastaDominioEcd = campo(fd, "pastaDominioEcd");
  const pastaDominioEcf = campo(fd, "pastaDominioEcf");
  const pastaDominioContribuicoes = campo(fd, "pastaDominioContribuicoes");
  const pastaDominioFiscal = campo(fd, "pastaDominioFiscal");
  const pastaContabil = campo(fd, "pastaContabil");
  // Pasta REAL do cliente dentro de C:\PlataformaContabil, escolhida na lista
  // das que existem. Vazio = plataforma volta a compor o nome pela convenção.
  const pastaLocal = campo(fd, "pastaLocal");

  const cliente = await prisma.cliente.create({
    data: {
      razaoSocial: razaoSocial!,
      cnpj: cnpj!,
      nomeFantasia: campo(fd, "nomeFantasia"),
      inscricaoEstadual: campo(fd, "inscricaoEstadual"),
      inscricaoMunicipal: campo(fd, "inscricaoMunicipal"),
      cnaePrincipal: campo(fd, "cnaePrincipal"),
      regimeTributario: campo(fd, "regimeTributario"),
      porte: campo(fd, "porte"),
      naturezaJuridica: campo(fd, "naturezaJuridica"),
      municipio: campo(fd, "municipio"),
      uf: campo(fd, "uf"),
      setorAtividade: campo(fd, "setorAtividade"),
      responsavelLegal: campo(fd, "responsavelLegal"),
      contadorResponsavel: campo(fd, "contadorResponsavel"),
      crcContador: campo(fd, "crcContador"),
      email: campo(fd, "email"),
      telefone: campo(fd, "telefone"),
      atendimentoInicio: campoCompetencia(fd, "atendimentoInicio"),
      atendimentoFim: campoCompetencia(fd, "atendimentoFim"),
      ieInicio: campoCompetencia(fd, "ieInicio"),
      ieFim: campoCompetencia(fd, "ieFim"),
      metodoAcessoEcac,
      certificadoCaminho,
      certificadoSenha,
      senhaSefaz,
      pastaFiscal,
      pastaGiam,
      pastaSpedEcd,
      pastaSpedEcf,
      pastaSpedContribuicoes,
      pastaSpedFiscal,
      pastaDominio,
      pastaDominioEcd,
      pastaDominioEcf,
      pastaDominioContribuicoes,
      pastaDominioFiscal,
      pastaContabil,
      pastaLocal,
      escritorioId: sessao.escritorioId,
    },
  });

  // Sócios (QSA) — vem do BuscarCNPJ via hidden input. Formato: SocioReceita[].
  const qsaJson = campo(fd, "qsaJson");
  if (qsaJson) {
    try {
      const socios = JSON.parse(qsaJson) as Array<{
        nome: string;
        codigoQualificacao?: number;
        qualificacao?: string;
        cpfCnpjMascarado?: string;
        faixaEtaria?: string;
        dataEntradaSociedade?: string;
        nomeRepresentanteLegal?: string;
        cpfRepresentanteMascarado?: string;
        codigoQualificacaoRepresentante?: number;
      }>;
      if (Array.isArray(socios) && socios.length > 0) {
        await prisma.socio.createMany({
          data: socios
            .filter((s) => s.nome?.trim())
            .map((s) => ({
              clienteId: cliente.id,
              nome: s.nome.trim(),
              codigoQualificacao: s.codigoQualificacao ?? null,
              qualificacao: s.qualificacao ?? null,
              cpfCnpjMascarado: s.cpfCnpjMascarado ?? null,
              faixaEtaria: s.faixaEtaria ?? null,
              dataEntradaSociedade: s.dataEntradaSociedade ? new Date(s.dataEntradaSociedade) : null,
              nomeRepresentanteLegal: s.nomeRepresentanteLegal ?? null,
              cpfRepresentanteMascarado: s.cpfRepresentanteMascarado ?? null,
              codigoQualificacaoRepresentante: s.codigoQualificacaoRepresentante ?? null,
            })),
        });
      }
    } catch {
      // JSON mal-formado: ignora (nao trava a criacao do cliente)
    }
  }

  await prisma.logAcesso.create({
    data: { acao: "CLIENTE_CRIADO", detalhe: `${razaoSocial}`, usuarioId: sessao.userId },
  });

  revalidatePath("/painel");
  redirect(`/painel/clientes/${cliente.id}`);
}

export async function editarClienteAction(id: string, fd: FormData) {
  const sessao = await requireSessao();
  if (!PAPEIS_INTERNOS.includes(sessao.papel)) redirect("/painel");

  const razaoSocial = campo(fd, "razaoSocial");
  const cnpj = campo(fd, "cnpj");
  if (!razaoSocial || !cnpj) {
    redirect(`/painel/clientes/${id}/editar?erro=1`);
  }

  const clienteExistente = await prisma.cliente.findFirst({
    where: { id, escritorioId: sessao.escritorioId },
  });
  if (!clienteExistente) redirect("/painel/clientes");

  const metodoAcessoEcac = campo(fd, "metodoAcessoEcac") ?? "PROCURACAO_MARCH";
  const certificadoCaminho = metodoAcessoEcac === "CERTIFICADO_PROPRIO" ? campo(fd, "certificadoCaminho") : null;
  // Se veio senha nova, cifra. Se veio vazia, mantém a antiga.
  const senhaClara = metodoAcessoEcac === "CERTIFICADO_PROPRIO" ? campo(fd, "certificadoSenha") : null;
  const certificadoSenha = senhaClara
    ? cifrar(senhaClara)
    : metodoAcessoEcac === "CERTIFICADO_PROPRIO"
      ? clienteExistente.certificadoSenha
      : null;

  // Senha SEFAZ: se veio nova, cifra; se veio vazia, mantém a antiga.
  const senhaSefazClara = campo(fd, "senhaSefaz");
  const senhaSefaz = senhaSefazClara ? cifrar(senhaSefazClara) : clienteExistente.senhaSefaz;
  const pastaFiscal = campo(fd, "pastaFiscal");
  const pastaGiam = campo(fd, "pastaGiam");
  const pastaSpedEcd = campo(fd, "pastaSpedEcd");
  const pastaSpedEcf = campo(fd, "pastaSpedEcf");
  const pastaSpedContribuicoes = campo(fd, "pastaSpedContribuicoes");
  const pastaSpedFiscal = campo(fd, "pastaSpedFiscal");
  const pastaDominio = campo(fd, "pastaDominio");
  const pastaDominioEcd = campo(fd, "pastaDominioEcd");
  const pastaDominioEcf = campo(fd, "pastaDominioEcf");
  const pastaDominioContribuicoes = campo(fd, "pastaDominioContribuicoes");
  const pastaDominioFiscal = campo(fd, "pastaDominioFiscal");
  const pastaContabil = campo(fd, "pastaContabil");
  // Pasta REAL do cliente dentro de C:\PlataformaContabil, escolhida na lista
  // das que existem. Vazio = plataforma volta a compor o nome pela convenção.
  const pastaLocal = campo(fd, "pastaLocal");

  await prisma.cliente.update({
    where: { id },
    data: {
      razaoSocial: razaoSocial!,
      cnpj: cnpj!,
      nomeFantasia: campo(fd, "nomeFantasia"),
      inscricaoEstadual: campo(fd, "inscricaoEstadual"),
      inscricaoMunicipal: campo(fd, "inscricaoMunicipal"),
      cnaePrincipal: campo(fd, "cnaePrincipal"),
      regimeTributario: campo(fd, "regimeTributario"),
      porte: campo(fd, "porte"),
      naturezaJuridica: campo(fd, "naturezaJuridica"),
      municipio: campo(fd, "municipio"),
      uf: campo(fd, "uf"),
      setorAtividade: campo(fd, "setorAtividade"),
      responsavelLegal: campo(fd, "responsavelLegal"),
      contadorResponsavel: campo(fd, "contadorResponsavel"),
      crcContador: campo(fd, "crcContador"),
      email: campo(fd, "email"),
      telefone: campo(fd, "telefone"),
      atendimentoInicio: campoCompetencia(fd, "atendimentoInicio"),
      atendimentoFim: campoCompetencia(fd, "atendimentoFim"),
      ieInicio: campoCompetencia(fd, "ieInicio"),
      ieFim: campoCompetencia(fd, "ieFim"),
      metodoAcessoEcac,
      certificadoCaminho,
      certificadoSenha,
      senhaSefaz,
      pastaFiscal,
      pastaGiam,
      pastaSpedEcd,
      pastaSpedEcf,
      pastaSpedContribuicoes,
      pastaSpedFiscal,
      pastaDominio,
      pastaDominioEcd,
      pastaDominioEcf,
      pastaDominioContribuicoes,
      pastaDominioFiscal,
      pastaContabil,
      pastaLocal,
    },
  });

  // Não cria mais a pasta RAZAO ao salvar: na organização do Higor (13/09/2026)
  // os razões moram em <CLIENTE>\CONTABIL\<ANO>\, e uma RAZAO criada aqui
  // sujaria a pasta do cliente fora do modelo.

  await prisma.logAcesso.create({
    data: { acao: "CLIENTE_EDITADO", detalhe: `${razaoSocial}`, usuarioId: sessao.userId },
  });

  revalidatePath("/painel");
  redirect(`/painel/clientes/${id}`);
}

export async function excluirClienteAction(fd: FormData) {
  const sessao = await requireSessao();
  if (sessao.papel !== "ADMIN") redirect("/painel");
  const id = String(fd.get("id"));
  await prisma.cliente.delete({ where: { id } });
  await prisma.logAcesso.create({
    data: { acao: "CLIENTE_EXCLUIDO", detalhe: id, usuarioId: sessao.userId },
  });
  revalidatePath("/painel");
  redirect("/painel/clientes");
}
