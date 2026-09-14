/**
 * Pastas do cliente, na organização definida pelo Higor em 13/09/2026:
 *
 *   C:\PlataformaContabil\<CLIENTE>\
 *     CONTABIL\<ANO>\          balanço, DRE e razões
 *     FISCAL\SPED\<TIPO>\      arquivos SPED TRANSMITIDOS  (ECD, ECF, EFD_CONTRIBUICOES, EFD_ICMS_IPI)
 *     FISCAL\DOMINIO\<TIPO>\   arquivos SPED do DOMÍNIO    (idem + Giam - Dominio)
 *
 * A escolha da pasta do cliente (select) vem como `children`, porque depende
 * da lista de pastas em disco, lida na página. Campo vazio mostra, como
 * sugestão, o caminho padrão dentro da pasta do cliente.
 */
import type { ReactNode } from "react";
import { NOMES_RAZAO_ESPERADOS } from "@/lib/razao/tributos";

type Campo = { nome: keyof PastasLocaisIniciais; rotulo: string; sub: string; uso?: string };

const TRANSMITIDOS: Campo[] = [
  { nome: "pastaSpedEcd", rotulo: "Pasta da ECD", sub: "ECD", uso: "Conciliação Domínio × ECD e Obrigações Acessórias" },
  { nome: "pastaSpedEcf", rotulo: "Pasta da ECF", sub: "ECF", uso: "IRPJ/CSLL e Obrigações Acessórias" },
  { nome: "pastaSpedContribuicoes", rotulo: "Pasta da EFD-Contribuições", sub: "EFD_CONTRIBUICOES", uso: "PIS/COFINS e Obrigações Acessórias" },
  { nome: "pastaSpedFiscal", rotulo: "Pasta da EFD ICMS/IPI", sub: "EFD_ICMS_IPI", uso: "SPED-Fiscal × GIAM do Domínio × GIAM do portal" },
];

const DOMINIO: Campo[] = [
  { nome: "pastaDominioEcd", rotulo: "Pasta da ECD", sub: "ECD" },
  { nome: "pastaDominioEcf", rotulo: "Pasta da ECF", sub: "ECF" },
  { nome: "pastaDominioContribuicoes", rotulo: "Pasta da EFD-Contribuições", sub: "EFD_CONTRIBUICOES" },
  { nome: "pastaDominioFiscal", rotulo: "Pasta da EFD ICMS/IPI", sub: "EFD_ICMS_IPI" },
];

export type PastasLocaisIniciais = Partial<
  Record<
    | "pastaContabil"
    | "pastaFiscal"
    | "pastaGiam"
    | "pastaDominio"
    | "pastaSpedEcd"
    | "pastaSpedEcf"
    | "pastaSpedContribuicoes"
    | "pastaSpedFiscal"
    | "pastaDominioEcd"
    | "pastaDominioEcf"
    | "pastaDominioContribuicoes"
    | "pastaDominioFiscal",
    string | null
  >
>;

function CampoPasta({
  nome,
  rotulo,
  sugestao,
  valor,
  ajuda,
  destaque = false,
}: {
  nome: string;
  rotulo: string;
  sugestao: string;
  valor: string | null | undefined;
  ajuda?: string;
  destaque?: boolean;
}) {
  return (
    <div className={destaque ? "md:col-span-2" : undefined}>
      <label className={`label ${destaque ? "font-bold" : ""}`} htmlFor={nome}>
        {rotulo}
      </label>
      <input
        id={nome}
        name={nome}
        className="input font-mono text-xs"
        defaultValue={valor ?? ""}
        placeholder={sugestao}
      />
      {ajuda && <p className="mt-1 text-[11px] text-slate-500">{ajuda}</p>}
    </div>
  );
}

function Grupo({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <div>
      <h3 className="mb-3 border-b border-slate-200 pb-1 text-sm font-bold uppercase tracking-wide text-slate-700">
        {titulo}
      </h3>
      {children}
    </div>
  );
}

function Subgrupo({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <div className="rounded-lg border border-slate-200 p-4">
      <h4 className="mb-3 text-xs font-bold uppercase tracking-wide text-slate-500">{titulo}</h4>
      <div className="grid gap-4 md:grid-cols-2">{children}</div>
    </div>
  );
}

export function PastasLocaisFields({
  pastaDoCliente,
  iniciais = {},
  children,
}: {
  /** Pasta do cliente em C:\PlataformaContabil — base das sugestões. */
  pastaDoCliente?: string;
  iniciais?: PastasLocaisIniciais;
  /** Escolha da pasta do cliente (select), montada pela página. */
  children?: ReactNode;
}) {
  const cliente = pastaDoCliente ?? "C:\\PlataformaContabil\\<CLIENTE>";
  const fiscal = `${cliente}\\FISCAL`;

  return (
    <section className="card p-5">
      <h2 className="mb-1 text-sm font-bold uppercase tracking-wide text-slate-500">Pastas do cliente</h2>
      <p className="mb-5 text-xs text-slate-500">
        Onde ficam os arquivos deste cliente dentro de <code className="font-mono">C:\PlataformaContabil</code>. A
        plataforma só lê — <strong>nunca copia nem armazena o arquivo</strong>.
      </p>

      <div className="space-y-6">
        {children && <Grupo titulo="Pasta do cliente">{children}</Grupo>}

        <Grupo titulo="Contábil">
          <div className="grid gap-4 md:grid-cols-2">
            <CampoPasta
              nome="pastaContabil"
              rotulo="Pasta contábil"
              sugestao={`${cliente}\\CONTABIL`}
              valor={iniciais.pastaContabil}
              ajuda="Uma pasta por ano (CONTABIL\2019, CONTABIL\2020...) com o Balanço, a DRE e os razões."
              destaque
            />
          </div>
          <p className="mt-2 text-[11px] text-slate-500">
            Razões em cada ano — o nome do arquivo diz o tributo:{" "}
            <span className="font-mono">{NOMES_RAZAO_ESPERADOS.join(" · ")}</span>
          </p>
        </Grupo>

        <Grupo titulo="Fiscal">
          <div className="space-y-4">
            <Subgrupo titulo="Arquivos SPED transmitidos">
              <CampoPasta
                nome="pastaFiscal"
                rotulo="Arquivos SPED transmitidos"
                sugestao={`${fiscal}\\SPED`}
                valor={iniciais.pastaFiscal}
                ajuda="Usada quando a pasta do tipo abaixo está vazia."
                destaque
              />
              {TRANSMITIDOS.map((c) => (
                <CampoPasta
                  key={c.nome}
                  nome={c.nome}
                  rotulo={c.rotulo}
                  sugestao={`${fiscal}\\SPED\\${c.sub}`}
                  valor={iniciais[c.nome]}
                  ajuda={c.uso ? `Usada por: ${c.uso}.` : undefined}
                />
              ))}
            </Subgrupo>

            <Subgrupo titulo="Arquivos SPED do Domínio">
              <CampoPasta
                nome="pastaDominio"
                rotulo="Arquivos SPED do Domínio"
                sugestao={`${fiscal}\\DOMINIO`}
                valor={iniciais.pastaDominio}
                destaque
              />
              {DOMINIO.map((c) => (
                <CampoPasta
                  key={c.nome}
                  nome={c.nome}
                  rotulo={c.rotulo}
                  sugestao={`${fiscal}\\DOMINIO\\${c.sub}`}
                  valor={iniciais[c.nome]}
                />
              ))}
              <CampoPasta
                nome="pastaGiam"
                rotulo="Pasta da GIAM do Domínio"
                sugestao={`${fiscal}\\DOMINIO\\Giam - Dominio`}
                valor={iniciais.pastaGiam}
                ajuda="A varredura filtra pela Inscrição Estadual dentro do arquivo — pega só os deste cliente."
                destaque
              />
            </Subgrupo>
          </div>
        </Grupo>
      </div>
    </section>
  );
}
