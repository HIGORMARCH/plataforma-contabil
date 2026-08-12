/**
 * Razão / Contrapartida — ECD.
 *
 * Consulta lançamento a lançamento a partir da base do Domínio (ou do
 * SPED transmitido), SEM precisar abrir o PVA. Duas abas:
 *
 *  - "Por conta": razão da conta escolhida com contrapartida real
 *    (quando ECD tipo G) ou razão por dia (tipos R/B).
 *  - "Por lançamento": consulta um lançamento pelo número — mostra
 *    todas as pernas (n débitos × n créditos) com validação de partida
 *    dobrada. Só disponível em ECD tipo G.
 *
 * Portado da spec `Especificacao_Modulo_Razao_Contrapartida.md`.
 */
import { existsSync } from "node:fs";
import Link from "next/link";
import { notFound } from "next/navigation";
import path from "node:path";
import { requirePapel, PAPEIS_INTERNOS } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { caminhoArquivo, pastaCliente, type ClienteRef } from "@/lib/storage/filesystem";
import { parsePlanoContas, lerArquivoLatin1 } from "@/lib/ecd/balancete";
import {
  razaoConta,
  consultarLancamento,
  localizarContrapartida,
  statusEcd,
  type RazaoConta,
  type RazaoLancamento,
  type RazaoDiario,
  type LancamentoCompleto,
  type StatusEcd,
  type EntradaContrapartida,
} from "@/lib/ecd/razao";
import { moeda } from "@/lib/accounting/format";
import { SeletorConta } from "./_components/SeletorConta";
import { ConsultaLancamento } from "./_components/ConsultaLancamento";

function formatarData(ddmmaaaa: string): string {
  if (!ddmmaaaa || ddmmaaaa.length !== 8) return ddmmaaaa || "";
  return `${ddmmaaaa.slice(0, 2)}/${ddmmaaaa.slice(2, 4)}/${ddmmaaaa.slice(4, 8)}`;
}

function formatarCnpj(cnpj: string): string {
  const d = cnpj.replace(/\D/g, "");
  if (d.length !== 14) return cnpj;
  return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
}

function detectarAnos(clienteRef: ClienteRef): number[] {
  const { existsSync, readdirSync } = require("node:fs") as typeof import("node:fs");
  const anos = new Set<number>();
  for (const t of ["SPED-ECD-DOMINIO", "SPED-ECD"] as const) {
    const raiz = path.join(pastaCliente(clienteRef), t);
    if (!existsSync(raiz)) continue;
    try {
      for (const nome of readdirSync(raiz)) {
        const num = Number(nome);
        if (num >= 2000 && num <= 2100) {
          const p = caminhoArquivo(clienteRef, t, num, null, "txt");
          if (existsSync(p)) anos.add(num);
        }
      }
    } catch {
      /* ignora */
    }
  }
  return [...anos].sort((a, b) => b - a);
}

export default async function RazaoContrapartidaPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{
    ano?: string;
    aba?: string;
    conta?: string;
    numero?: string;
  }>;
}) {
  const sessao = await requirePapel(PAPEIS_INTERNOS);
  const { id } = await params;
  const sp = await searchParams;

  const cliente = await prisma.cliente.findFirst({
    where: { id, escritorioId: sessao.escritorioId },
    select: { razaoSocial: true, cnpj: true, regimeTributario: true },
  });
  if (!cliente) notFound();

  const clienteRef: ClienteRef = {
    razaoSocial: cliente.razaoSocial,
    cnpj: cliente.cnpj,
  };

  const anosDisponiveis = detectarAnos(clienteRef);
  const ano = sp.ano
    ? Number(sp.ano)
    : anosDisponiveis[0] ?? new Date().getFullYear();
  // Fonte fixa: ECD Transmitida. O SPED do Domínio local o contador já
  // consulta no próprio Domínio — o valor da plataforma é operar sobre
  // o que foi de fato transmitido à Receita.
  const aba: "conta" | "lancamento" = sp.aba === "lancamento" ? "lancamento" : "conta";
  const contaCod = (sp.conta ?? "").trim();
  const numeroLancto = (sp.numero ?? "").trim();

  const arqPath = caminhoArquivo(clienteRef, "SPED-ECD", ano, null, "txt");
  const arqExiste = existsSync(arqPath);

  let status: StatusEcd | null = null;
  let razao: RazaoConta | null = null;
  let descricaoConta = "";
  let lancto: LancamentoCompleto | null = null;
  let ausenteLancto = false;
  let erro: string | null = null;
  // Mapa `${data}|${lado}` → EntradaContrapartida (só em modo DIÁRIO — infere
  // a contrapartida provável casando débito × crédito do mesmo dia/valor).
  const contrapartidas = new Map<string, EntradaContrapartida>();

  if (arqExiste) {
    try {
      status = statusEcd(arqPath);
      if (aba === "conta" && contaCod) {
        razao = razaoConta(arqPath, contaCod);
        const plano = parsePlanoContas(lerArquivoLatin1(arqPath));
        descricaoConta = plano.get(contaCod)?.descricao ?? contaCod;
        // Se modo DIÁRIO, calcula contrapartidas prováveis
        if (razao.tipoRazao === "DIARIO") {
          const cps = localizarContrapartida(arqPath, contaCod);
          for (const c of cps) contrapartidas.set(`${c.data}|${c.lado}`, c);
        }
      } else if (aba === "lancamento" && numeroLancto) {
        lancto = consultarLancamento(arqPath, numeroLancto);
        if (!lancto) ausenteLancto = true;
      }
    } catch (e) {
      erro = (e as Error).message;
    }
  }

  return (
    <div className="mx-auto max-w-7xl px-6 py-8 lg:px-10 lg:py-12">
      <div className="mb-8">
        <Link
          href={`/painel/clientes/${id}`}
          className="text-xs text-[var(--ink-soft)] transition hover:text-[var(--brand-deep)]"
        >
          ← {cliente.razaoSocial}
        </Link>

        <div className="eyebrow mt-4">
          <span>Contábil</span>
          <span className="eyebrow-sep">§</span>
          <span>Razão / Contrapartida</span>
          {ano && (
            <>
              <span className="eyebrow-sep">§</span>
              <span>Exercício {ano}</span>
            </>
          )}
        </div>

        <h1 className="display mt-3 text-[2.6rem] lg:text-[3rem]">
          Razão <span className="italic text-[var(--brand-2)]">/</span> Contrapartida
        </h1>

        <p className="mt-3 max-w-[62ch] text-[0.92rem] leading-relaxed text-[var(--ink-soft)]">
          Análise contábil lançamento a lançamento a partir da ECD — sem
          precisar abrir o PVA. Cada conta traz o extrato com saldo acumulado
          e a contrapartida de cada movimento. Consulte também um lançamento
          pelo número pra ver todas as pernas (débitos × créditos).
        </p>

        <div className="rule-gold mt-6 w-40" />
      </div>

      <dl className="meta-strip mb-5">
        <div>
          <dt>Razão social</dt>
          <dd>{cliente.razaoSocial}</dd>
        </div>
        <div>
          <dt>CNPJ</dt>
          <dd>{formatarCnpj(cliente.cnpj)}</dd>
        </div>
        <div>
          <dt>Regime</dt>
          <dd>{cliente.regimeTributario ?? "—"}</dd>
        </div>
        {status && (
          <div>
            <dt>Tipo de escrituração</dt>
            <dd>
              <SeloTipoEsc tipo={status.tipoEscrituracao} descricao={status.tipoDescricao} />
            </dd>
          </div>
        )}
      </dl>

      {/* Seletor de ano */}
      {anosDisponiveis.length > 0 && (
        <div className="mb-6 flex flex-wrap items-center gap-x-3 gap-y-2">
          <span className="eyebrow mr-1">Exercício</span>
          <div className="flex flex-wrap gap-1.5">
            {anosDisponiveis.map((a) => (
              <Link
                key={a}
                href={`/painel/clientes/${id}/razao-contrapartida?ano=${a}&aba=${aba}`}
                className="chip-year"
                data-active={a === ano}
              >
                {a}
              </Link>
            ))}
          </div>
        </div>
      )}

      {!arqExiste && (
        <div className="notice mb-4" data-tone="warn">
          Arquivo SPED-ECD Transmitido não encontrado pra ano <b>{ano}</b>.
          <br />
          Esperado em <code>{arqPath}</code>. Envie pela tela de{" "}
          <Link
            href={`/painel/clientes/${id}/balancete-comparado?ano=${ano}`}
            className="underline decoration-[var(--brand-2)] decoration-2 underline-offset-2"
          >
            Balancete
          </Link>
          .
        </div>
      )}

      {erro && (
        <div className="notice mb-4" data-tone="err">
          {erro}
        </div>
      )}

      {status && (
        <BannerCapacidade status={status} />
      )}

      {status && (
        <>
          <TabsAba clienteId={id} ano={ano} abaAtual={aba} />

          {aba === "conta" ? (
            <>
              <SeletorConta
                clienteId={id}
                ano={ano}
                contaAtual={contaCod}
              />
              {razao && contaCod && (
                <RazaoCard
                  descricao={descricaoConta}
                  codigo={contaCod}
                  razao={razao}
                  contrapartidas={contrapartidas}
                />
              )}
            </>
          ) : (
            <>
              <ConsultaLancamento
                clienteId={id}
                ano={ano}
                numeroAtual={numeroLancto}
                suportado={status.suportaConsultaPorLancamento}
              />
              {lancto && <LancamentoCard lancto={lancto} />}
              {ausenteLancto && (
                <div className="notice" data-tone="warn">
                  Lançamento <b>{numeroLancto}</b> não encontrado no arquivo.
                </div>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Componentes de apresentação
// ---------------------------------------------------------------------------

function SeloTipoEsc({
  tipo,
  descricao,
}: {
  tipo: "G" | "R" | "B" | null;
  descricao: string;
}) {
  const cls =
    tipo === "G"
      ? "st-badge st-ok"
      : tipo === "R" || tipo === "B"
        ? "st-badge st-so-dom"
        : "st-badge";
  return (
    <span className={cls}>
      {tipo ?? "?"} · {descricao}
    </span>
  );
}

function BannerCapacidade({ status }: { status: StatusEcd }) {
  const tone = status.suportaRazaoCompleto ? "warn" : "warn";
  const bg = status.suportaRazaoCompleto ? "" : "warn";
  return (
    <div
      className={`notice mb-4`}
      data-tone={status.suportaRazaoCompleto ? undefined : "warn"}
      style={
        status.suportaRazaoCompleto
          ? { background: "#e8f0e5", borderColor: "#cadfc6" }
          : undefined
      }
    >
      {status.mensagem}
    </div>
  );
}

function TabsAba({
  clienteId,
  ano,
  abaAtual,
}: {
  clienteId: string;
  ano: number;
  abaAtual: "conta" | "lancamento";
}) {
  const base = `/painel/clientes/${clienteId}/razao-contrapartida?ano=${ano}`;
  return (
    <div className="mb-4 flex gap-1 border-b border-[var(--rule)]">
      <TabItem href={`${base}&aba=conta`} active={abaAtual === "conta"}>
        Por conta
      </TabItem>
      <TabItem href={`${base}&aba=lancamento`} active={abaAtual === "lancamento"}>
        Por lançamento
      </TabItem>
    </div>
  );
}

function TabItem({
  href,
  active,
  children,
}: {
  href: string;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className={`px-4 py-2 text-sm font-medium transition border-b-2 -mb-px ${
        active
          ? "border-[var(--brand-darker)] text-[var(--brand-darker)]"
          : "border-transparent text-[var(--ink-soft)] hover:text-[var(--brand-deep)]"
      }`}
    >
      {children}
    </Link>
  );
}

function RazaoCard({
  descricao,
  codigo,
  razao,
  contrapartidas,
}: {
  descricao: string;
  codigo: string;
  razao: RazaoConta;
  contrapartidas: Map<string, EntradaContrapartida>;
}) {
  return (
    <section className="rounded border border-[var(--rule)] bg-white overflow-hidden">
      <header className="px-4 py-3 bg-[var(--brand-2-soft)] border-b border-[var(--brand-2-line)]">
        <div className="text-xs font-mono uppercase tracking-widest text-[var(--ink-soft)]">
          Conta #{codigo}
        </div>
        <div className="mt-1 flex items-baseline justify-between gap-3 flex-wrap">
          <div className="font-serif text-lg text-[var(--brand-darker)]">
            {descricao}
          </div>
          <div className="font-mono text-[11px] text-[var(--brand-deep)] tabular-nums">
            Modo: <b>{razao.tipoRazao === "LANCAMENTO" ? "Lançamento" : "Diário"}</b>
            {" · "}Deb: <b>{moeda(razao.totalDebito)}</b>
            {" · "}Cred: <b>{moeda(razao.totalCredito)}</b>
            {" · "}SF: <b>{moeda(razao.saldoFinal)}</b>
          </div>
        </div>
      </header>

      {razao.entradas.length === 0 ? (
        <div className="p-4 text-xs text-[var(--ink-soft)]">
          Nenhum movimento nesta conta no exercício.
        </div>
      ) : (
        <div className="overflow-x-auto max-h-[70vh] overflow-y-auto">
          {razao.tipoRazao === "LANCAMENTO" ? (
            <TabelaLancamento entradas={razao.entradas as RazaoLancamento[]} />
          ) : (
            <TabelaDiario
              entradas={razao.entradas as RazaoDiario[]}
              contrapartidas={contrapartidas}
            />
          )}
        </div>
      )}
    </section>
  );
}

function TabelaLancamento({ entradas }: { entradas: RazaoLancamento[] }) {
  return (
    <table className="w-full text-[11px]">
      <thead className="bg-[var(--brand-darker)] text-[var(--brand-2)] font-mono uppercase tracking-widest text-[10px]">
        <tr>
          <th className="px-2 py-2 text-left">Data</th>
          <th className="px-2 py-2 text-left">Nº</th>
          <th className="px-2 py-2 text-left">Histórico / Contrapartida</th>
          <th className="px-2 py-2 text-right">Débito</th>
          <th className="px-2 py-2 text-right">Crédito</th>
          <th className="px-2 py-2 text-right">Saldo</th>
        </tr>
      </thead>
      <tbody>
        {entradas.map((e, i) => (
          <tr key={i} className="border-b border-[#efece3] hover:bg-[#fbf9f4]">
            <td className="px-2 py-1.5 font-mono">{formatarData(e.data)}</td>
            <td className="px-2 py-1.5 font-mono text-[var(--ink-soft)]">{e.numero}</td>
            <td className="px-2 py-1.5">
              <div className="text-[var(--ink)] leading-tight">{e.historico}</div>
              {e.contrapartida.length > 0 && (
                <div className="mt-0.5 text-[10px] text-[var(--ink-soft)]">
                  →{" "}
                  {e.contrapartida
                    .map((c) => `${c.codigo} ${c.descricao}`)
                    .join(" · ")}
                </div>
              )}
            </td>
            <td className="px-2 py-1.5 text-right font-mono tabular-nums">
              {e.dc === "D" ? moeda(e.valor) : ""}
            </td>
            <td className="px-2 py-1.5 text-right font-mono tabular-nums">
              {e.dc === "C" ? moeda(e.valor) : ""}
            </td>
            <td className="px-2 py-1.5 text-right font-mono tabular-nums text-[var(--brand-deep)]">
              {moeda(e.saldo)}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function TabelaDiario({
  entradas,
  contrapartidas,
}: {
  entradas: RazaoDiario[];
  contrapartidas: Map<string, EntradaContrapartida>;
}) {
  return (
    <table className="w-full text-[11px]">
      <thead className="bg-[var(--brand-darker)] text-[var(--brand-2)] font-mono uppercase tracking-widest text-[10px]">
        <tr>
          <th className="px-2 py-2 text-left">Data</th>
          <th className="px-2 py-2 text-right">Débito</th>
          <th className="px-2 py-2 text-right">Crédito</th>
          <th className="px-2 py-2 text-left">Contrapartida provável</th>
          <th className="px-2 py-2 text-right">Saldo</th>
        </tr>
      </thead>
      <tbody>
        {entradas.map((e, i) => {
          const cpDeb = contrapartidas.get(`${e.data}|D`);
          const cpCred = contrapartidas.get(`${e.data}|C`);
          return (
            <tr key={i} className="border-b border-[#efece3] hover:bg-[#fbf9f4]">
              <td className="px-2 py-1.5 font-mono align-top">{formatarData(e.data)}</td>
              <td className="px-2 py-1.5 text-right font-mono tabular-nums align-top">
                {e.debito > 0 ? moeda(e.debito) : ""}
              </td>
              <td className="px-2 py-1.5 text-right font-mono tabular-nums align-top">
                {e.credito > 0 ? moeda(e.credito) : ""}
              </td>
              <td className="px-2 py-1.5 align-top text-[10.5px]">
                <CpBloco titulo="D →" cp={cpDeb} />
                <CpBloco titulo="C ←" cp={cpCred} />
              </td>
              <td className="px-2 py-1.5 text-right font-mono tabular-nums text-[var(--brand-deep)] align-top">
                {moeda(e.saldo)}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function CpBloco({ titulo, cp }: { titulo: string; cp: EntradaContrapartida | undefined }) {
  if (!cp) return null;
  if (cp.candidatos.length === 0) {
    return (
      <div className="flex items-baseline gap-2 leading-tight text-[var(--ink-soft)]">
        <span className="font-mono text-[9px] w-6">{titulo}</span>
        <span className="italic">contrapartida não localizada</span>
      </div>
    );
  }
  return (
    <div className="flex items-baseline gap-2 leading-tight">
      <span className="font-mono text-[9px] w-6 text-[var(--ink-soft)]">{titulo}</span>
      <div>
        {cp.candidatos.map((c, i) => (
          <div key={i} className="text-[var(--ink)]">
            <span className="font-mono text-[10px] text-[var(--brand-2-mute)] mr-1">
              #{c.codigo}
            </span>
            {c.descricao}
            {cp.candidatos.length > 1 && i === 0 && (
              <span className="ml-1 text-[9px] text-[var(--ink-soft)]">
                (+{cp.candidatos.length - 1} outro{cp.candidatos.length > 2 ? "s" : ""})
              </span>
            )}
            {i === 0 && cp.status === "exata" && (
              <span className="ml-1 text-[9px] text-emerald-700">✓ exata</span>
            )}
          </div>
        )).slice(0, 1)}
      </div>
    </div>
  );
}

function LancamentoCard({ lancto }: { lancto: LancamentoCompleto }) {
  return (
    <section className="rounded border border-[var(--rule)] bg-white overflow-hidden">
      <header className="px-4 py-3 bg-[var(--brand-2-soft)] border-b border-[var(--brand-2-line)]">
        <div className="text-xs font-mono uppercase tracking-widest text-[var(--ink-soft)]">
          Lançamento #{lancto.numero} · {formatarData(lancto.data)}
        </div>
        <div className="mt-1 flex items-baseline justify-between gap-3 flex-wrap">
          <div className="font-serif text-lg text-[var(--brand-darker)]">
            Valor total: {moeda(lancto.valor)}
          </div>
          <span
            className={`st-badge ${lancto.balanceado ? "st-ok" : "st-diverge"}`}
          >
            {lancto.balanceado ? "Balanceado" : "Desbalanceado"}
          </span>
        </div>
      </header>
      <div className="grid grid-cols-1 gap-0 md:grid-cols-2 divide-x divide-[var(--rule)]">
        <PartidasBloco titulo="Débitos" cor="var(--danger)" partidas={lancto.debitos} />
        <PartidasBloco titulo="Créditos" cor="#2c4a7a" partidas={lancto.creditos} />
      </div>
    </section>
  );
}

function PartidasBloco({
  titulo,
  cor,
  partidas,
}: {
  titulo: string;
  cor: string;
  partidas: LancamentoCompleto["debitos"];
}) {
  const total = partidas.reduce((s, x) => s + x.valor, 0);
  return (
    <div>
      <div
        className="px-4 py-2 font-mono uppercase text-[10px] tracking-widest"
        style={{ color: cor, borderBottom: "1px solid var(--rule)" }}
      >
        {titulo} · {partidas.length} · {moeda(total)}
      </div>
      {partidas.length === 0 ? (
        <div className="p-4 text-xs text-[var(--ink-soft)]">Nenhuma partida.</div>
      ) : (
        <ul>
          {partidas.map((p, i) => (
            <li
              key={i}
              className="px-4 py-2 border-b border-[#efece3] flex justify-between gap-3 items-baseline text-[12px]"
            >
              <div>
                <span className="font-mono text-[11px] text-[var(--ink-soft)] mr-2">
                  {p.codigo}
                </span>
                <span className="text-[var(--ink)]">{p.descricao}</span>
                {p.historico && (
                  <div className="text-[10px] text-[var(--ink-soft)] mt-0.5">
                    {p.historico}
                  </div>
                )}
              </div>
              <div className="font-mono tabular-nums text-[var(--brand-deep)] whitespace-nowrap">
                {moeda(p.valor)}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
