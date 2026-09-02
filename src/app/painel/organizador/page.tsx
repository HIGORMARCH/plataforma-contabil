import { requirePapel, PAPEIS_INTERNOS } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { pastaRaiz } from "@/lib/storage/filesystem";
import { conferirApuracaoIcms } from "@/lib/organizador/conferirApuracaoIcms";
import { adicionarOrigemAction, alternarOrigemAction, removerOrigemAction } from "./actions";
import { ExecutarRoboButton } from "./_components/ExecutarRoboButton";

/**
 * Organizador de documentos — cadastro dos endereços e execução do robô.
 *
 * O robô lê os endereços cadastrados, identifica cada arquivo pelo CONTEÚDO
 * (nunca pelo nome) e arquiva na pasta do cliente com nome padronizado.
 */

const fmtDataHora = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

export default async function OrganizadorPage({
  searchParams,
}: {
  searchParams: Promise<{ erro?: string }>;
}) {
  const sessao = await requirePapel(PAPEIS_INTERNOS);
  const { erro } = await searchParams;

  const [origens, clientes, ultimos] = await Promise.all([
    prisma.origemArquivo.findMany({
      where: { escritorioId: sessao.escritorioId },
      include: { cliente: { select: { razaoSocial: true } } },
      orderBy: { criadoEm: "asc" },
    }),
    prisma.cliente.findMany({
      where: { escritorioId: sessao.escritorioId },
      select: { id: true, razaoSocial: true },
      orderBy: { razaoSocial: "asc" },
    }),
    prisma.arquivoOrganizado.findMany({
      where: { escritorioId: sessao.escritorioId },
      orderBy: { organizadoEm: "desc" },
      take: 10,
      include: { cliente: { select: { razaoSocial: true } } },
    }),
  ]);

  const totalArquivados = await prisma.arquivoOrganizado.count({
    where: { escritorioId: sessao.escritorioId, status: { in: ["ARQUIVADO", "JA_NO_LUGAR"] } },
  });

  // Leitura de disco, não do banco: a verdade sobre o que está arquivado é a
  // pasta. Se alguém apagar um PDF por fora, a conferência tem que acusar.
  const apuracoes = conferirApuracaoIcms();
  const comFalta = apuracoes.filter((a) => a.faltando.length > 0);

  return (
    <div className="mx-auto max-w-6xl px-6 py-8">
      <div className="mb-8">
        <div className="eyebrow">
          <span>Administração</span>
          <span className="eyebrow-sep">§</span>
          <span>Módulo</span>
        </div>
        <h1 className="display mt-3 text-[2.4rem]">
          <span className="mr-3">🗂️</span>
          Organizador de documentos
        </h1>
        <p className="mt-3 max-w-[70ch] text-[0.92rem] leading-relaxed text-[var(--ink-soft)]">
          O robô varre os endereços cadastrados, descobre o que é cada arquivo{" "}
          <b>pelo conteúdo</b> — não pelo nome — e arquiva na pasta do cliente, já renomeado no
          padrão. O que ele não reconhecer com certeza fica de fora, listado para conferência: um
          documento no lugar errado vira número errado na conciliação.
        </p>
        <div className="rule-gold mt-6 w-40" />
      </div>

      {erro && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">
          ⛔ {erro}
        </div>
      )}

      <section className="mb-6 rounded-xl border border-slate-200 bg-white p-5">
        <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-slate-500">
          Endereços onde procurar
        </h2>

        {origens.length === 0 ? (
          <p className="mb-4 text-sm text-slate-500">
            Nenhum endereço cadastrado ainda. Comece pela raiz da plataforma:{" "}
            <code className="font-mono text-xs">{pastaRaiz()}</code>
          </p>
        ) : (
          <div className="mb-4 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
                  <th className="px-3 py-2 text-left font-semibold">Nome</th>
                  <th className="px-3 text-left font-semibold">Caminho</th>
                  <th className="px-3 text-left font-semibold">Cliente fixo</th>
                  <th className="px-3 text-left font-semibold">Última varredura</th>
                  <th className="px-3 text-right font-semibold">Ações</th>
                </tr>
              </thead>
              <tbody>
                {origens.map((o) => (
                  <tr key={o.id} className="border-b border-slate-100">
                    <td className="px-3 py-2 text-left">
                      {o.nome}
                      {!o.ativo && (
                        <span className="ml-2 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] uppercase text-slate-500">
                          inativo
                        </span>
                      )}
                      {!o.recursivo && (
                        <span className="ml-2 text-[10px] text-slate-400">só o nível raiz</span>
                      )}
                    </td>
                    <td className="px-3 font-mono text-[11px] text-slate-600">{o.caminho}</td>
                    <td className="px-3 text-xs text-slate-500">
                      {o.cliente?.razaoSocial ?? "— (descobre pelo CNPJ)"}
                    </td>
                    <td className="px-3 text-xs text-slate-500">
                      {o.ultimaVarreduraEm ? fmtDataHora.format(o.ultimaVarreduraEm) : "nunca"}
                    </td>
                    <td className="px-3 text-right">
                      <form action={alternarOrigemAction.bind(null, o.id)} className="inline">
                        <button className="rounded border border-slate-300 px-2 py-0.5 text-xs text-slate-600 hover:bg-slate-50">
                          {o.ativo ? "desativar" : "ativar"}
                        </button>
                      </form>
                      <form action={removerOrigemAction.bind(null, o.id)} className="ml-1 inline">
                        <button className="rounded border border-red-200 px-2 py-0.5 text-xs text-red-700 hover:bg-red-50">
                          remover
                        </button>
                      </form>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <form action={adicionarOrigemAction} className="grid gap-3 border-t border-slate-100 pt-4 md:grid-cols-5">
          <div className="md:col-span-1">
            <label className="label" htmlFor="nome">
              Nome
            </label>
            <input id="nome" name="nome" className="input" placeholder="Servidor Z: — ativas" required />
          </div>
          <div className="md:col-span-2">
            <label className="label" htmlFor="caminho">
              Caminho da pasta
            </label>
            <input
              id="caminho"
              name="caminho"
              className="input font-mono text-xs"
              placeholder={pastaRaiz()}
              required
            />
          </div>
          <div>
            <label className="label" htmlFor="clienteId">
              Cliente fixo (opcional)
            </label>
            <select id="clienteId" name="clienteId" className="input">
              <option value="">Descobrir pelo CNPJ</option>
              {clientes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.razaoSocial}
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-end gap-2">
            <label className="flex items-center gap-1.5 text-xs text-slate-600">
              <input type="checkbox" name="recursivo" value="1" defaultChecked />
              subpastas
            </label>
            <button type="submit" className="btn btn-primary">
              Adicionar
            </button>
          </div>
        </form>
      </section>

      <section className="mb-6 rounded-xl border border-slate-200 bg-white p-5">
        <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-slate-500">
          Rodar o robô
        </h2>
        <ExecutarRoboButton temOrigem={origens.some((o) => o.ativo)} />
      </section>

      {apuracoes.length > 0 && (
        <section className="mb-6 rounded-xl border border-slate-200 bg-white p-5">
          <div className="mb-3 flex flex-wrap items-baseline justify-between gap-3">
            <h2 className="text-sm font-bold uppercase tracking-wide text-slate-500">
              Conferência da apuração do ICMS
            </h2>
            <span className="text-xs text-slate-500">
              {comFalta.length} de {apuracoes.length} competência(s) incompleta(s)
            </span>
          </div>
          <p className="mb-3 max-w-[80ch] text-xs leading-relaxed text-slate-600">
            Vale para quem apura em sistema próprio, fora do Domínio. Nesses sistemas{" "}
            <b>o fechamento do inventário do mês é o que libera a apuração do ICMS</b> — se ele não
            está na pasta, ou o fechamento não foi feito (e a apuração ao lado não vale), ou foi
            feito e ninguém guardou.
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
                  <th className="px-3 py-2 text-left font-semibold">Empresa</th>
                  <th className="px-3 text-left font-semibold">Competência</th>
                  <th className="px-3 text-left font-semibold">Falta</th>
                </tr>
              </thead>
              <tbody>
                {apuracoes.map((a) => (
                  <tr key={`${a.pasta}-${a.ano}-${a.mes}`} className="border-b border-slate-100">
                    <td className="px-3 py-2 text-left text-slate-700">{a.empresa}</td>
                    <td className="px-3 font-mono text-xs text-slate-600">
                      {String(a.mes).padStart(2, "0")}/{a.ano}
                    </td>
                    <td className="px-3 text-xs">
                      {a.faltando.length === 0 ? (
                        <span className="text-slate-400">— completa</span>
                      ) : (
                        a.faltando.map((f) => (
                          <span
                            key={f}
                            className="mr-1 inline-block rounded bg-red-50 px-1.5 py-0.5 text-[11px] font-semibold text-red-800"
                          >
                            {f}
                          </span>
                        ))
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {ultimos.length > 0 && (
        <section className="mb-6 rounded-xl border border-slate-200 bg-white p-5">
          <div className="mb-3 flex flex-wrap items-baseline justify-between gap-3">
            <h2 className="text-sm font-bold uppercase tracking-wide text-slate-500">
              Últimos arquivos organizados
            </h2>
            <span className="text-xs text-slate-500">
              {totalArquivados} arquivo(s) no índice
            </span>
          </div>
          <ul className="space-y-1 text-xs">
            {ultimos.map((a) => (
              <li key={a.id} className="flex flex-wrap gap-2 border-b border-slate-100 pb-1">
                <span className="font-mono text-slate-400">
                  {fmtDataHora.format(a.organizadoEm)}
                </span>
                <span className="font-semibold text-slate-700">{a.tipoDocumento}</span>
                <span className="text-slate-500">{a.cliente?.razaoSocial ?? "—"}</span>
                <span className="text-slate-400">{a.status}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-xs leading-relaxed text-slate-600">
        <p>
          <strong>O que ele nunca faz:</strong> não apaga, não sobrescreve e não escreve na origem
          quando ela é servidor de terceiro. Arquivo vindo de <b>dentro</b> de{" "}
          <code className="font-mono">{pastaRaiz()}</code> é <b>movido</b> (organizado no lugar);
          arquivo de fora é <b>copiado</b>, e o original fica onde está.
        </p>
        <p className="mt-2">
          <strong>Repetir é seguro:</strong> a identidade do arquivo é o conteúdo (SHA-256), então
          o mesmo documento não é arquivado duas vezes, mesmo com outro nome ou vindo por outro
          endereço.
        </p>
      </div>
    </div>
  );
}
