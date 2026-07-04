"use client";

import { useEffect, useState } from "react";
import { brl, type ValuationInput, type ValuationResult } from "@/lib/valuation/calc";

interface Pacote {
  input: ValuationInput;
  resultado: ValuationResult;
  parecer: string;
  geradoEm: string;
}

export default function DocumentoValuation() {
  const [p, setP] = useState<Pacote | null>(null);

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem("valuation:documento");
      if (raw) setP(JSON.parse(raw));
    } catch {}
  }, []);

  if (!p) {
    return (
      <div className="p-10 text-center text-sm text-neutral-500">
        Nenhum parecer carregado. Volte ao Valuation e clique em “Gerar parecer”.
      </div>
    );
  }

  const { input: i, resultado: r, parecer } = p;
  // separa o parecer em seções (linhas MAIÚSCULAS curtas = título)
  const blocos: { titulo?: string; corpo: string[] }[] = [];
  let atual: { titulo?: string; corpo: string[] } = { corpo: [] };
  for (const linha of parecer.split("\n")) {
    const l = linha.trim();
    if (!l) continue;
    const ehTitulo = l === l.toUpperCase() && l.length < 60 && /[A-ZÀ-Ý]/.test(l) && !/\d{3}/.test(l);
    if (ehTitulo && !l.startsWith("PARECER")) {
      if (atual.titulo || atual.corpo.length) blocos.push(atual);
      atual = { titulo: l, corpo: [] };
    } else if (!l.startsWith("PARECER")) {
      atual.corpo.push(l);
    }
  }
  if (atual.titulo || atual.corpo.length) blocos.push(atual);

  const lo = r.cenarios.pressao.min;
  const hi = r.cenarios.segurar.max;
  const pos = (v: number) => Math.max(2, Math.min(98, ((v - lo) / (hi - lo)) * 100));

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500;9..144,600;9..144,700&family=Hanken+Grotesk:wght@400;500;600;700&display=swap');
        .doc{--gold:#B8912E;--goldlt:#D9B968;--ink:#17130D;--paper:#F7F2E7;--cinza:#6b655a;--linha:#e0d8c6;
          font-family:'Hanken Grotesk',sans-serif;color:var(--ink);background:#fff;max-width:820px;margin:0 auto}
        .doc .serif{font-family:'Fraunces',Georgia,serif}
        .doc .hero{background:var(--ink);color:var(--paper);padding:34px 40px;position:relative;overflow:hidden}
        .doc .hero::after{content:"";position:absolute;right:-60px;top:-70px;width:320px;height:320px;border-radius:50%;background:radial-gradient(circle,rgba(184,145,46,.28),transparent 68%)}
        .doc .hero .top{display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid rgba(217,185,104,.3);padding-bottom:12px;position:relative;z-index:2}
        .doc .hero .k{font-size:10px;letter-spacing:3px;text-transform:uppercase;color:var(--goldlt)}
        .doc .hero h1{font-weight:600;font-size:28px;line-height:1.12;margin:20px 0 6px;position:relative;z-index:2}
        .doc .hero h1 em{font-style:italic;color:var(--goldlt)}
        .doc .hero .meta{margin-top:16px;display:flex;gap:28px;font-size:11px;color:#b7ae9c;position:relative;z-index:2}
        .doc .hero .meta b{display:block;color:var(--paper);font-size:12px;margin-top:2px}
        .doc .stats{display:grid;grid-template-columns:repeat(4,1fr);background:#2b261e;color:var(--paper)}
        .doc .stats .s{padding:13px 16px;border-right:1px solid rgba(255,255,255,.08)}
        .doc .stats .s .n{font-family:'Fraunces',serif;font-size:20px;font-weight:600;color:var(--goldlt)}
        .doc .stats .s .l{font-size:9px;letter-spacing:.5px;text-transform:uppercase;color:#a49c8a;margin-top:4px}
        .doc .body{padding:26px 40px 34px}
        .doc h2{font-family:'Fraunces',serif;font-size:16px;font-weight:600;margin:18px 0 6px;padding-left:10px;border-left:3px solid var(--gold)}
        .doc p{font-size:12.5px;line-height:1.6;margin-bottom:7px;color:#33302a}
        .doc .valbox{background:var(--ink);color:#fff;border-radius:10px;padding:18px 22px;margin:14px 0;text-align:center}
        .doc .valbox .l{font-size:10px;letter-spacing:2px;text-transform:uppercase;color:var(--goldlt)}
        .doc .valbox .v{font-family:'Fraunces',serif;font-size:30px;font-weight:600;margin-top:3px}
        table{width:100%;border-collapse:collapse;font-size:11.5px;margin:8px 0}
        .doc th,.doc td{padding:7px 9px;border-bottom:1px solid var(--linha);text-align:left}
        .doc td.n{text-align:right;font-variant-numeric:tabular-nums}
        .doc .scen>div{display:grid;grid-template-columns:1.3fr 2fr 1.3fr;align-items:center;border-bottom:1px solid var(--linha)}
        .doc .scen .c{text-align:right;font-family:'Fraunces',serif;font-weight:600}
        .doc .scen>div>span{padding:9px 12px;font-size:11.5px}
        .doc .bad{background:#faf1ee}.doc .bad .c{color:#a23b28}
        .doc .good{background:#eef5f0}.doc .good .c{color:#3C6E4F}
        .doc .field{position:relative;height:44px;margin:14px 0 4px}
        .doc .field .bar{position:absolute;inset-inline:0;top:16px;height:8px;border-radius:5px;background:linear-gradient(90deg,#e8b4a4,#e8d6a0,#a9d3ba)}
        .doc .field .mk{position:absolute;top:0;transform:translateX(-50%);text-align:center;font-size:11px;font-weight:700}
        .doc .field .mk .t{width:2px;height:20px;background:var(--ink);margin:2px auto 0}
        .doc .assin{margin-top:26px;text-align:center;font-size:12px}
        .doc .assin .l{width:250px;border-top:1px solid var(--ink);margin:0 auto 4px}
        .doc .disc{margin-top:16px;font-size:9.5px;color:var(--cinza);border-top:1px solid var(--linha);padding-top:9px;line-height:1.5}
        .noprint{position:fixed;top:16px;right:16px;z-index:50}
        .noprint button{background:#17130D;color:#D9B968;border:none;border-radius:8px;padding:10px 18px;font-size:13px;font-weight:600;cursor:pointer;box-shadow:0 4px 14px rgba(0,0,0,.2)}
        @media print{.noprint{display:none}@page{size:A4;margin:10mm}.doc{max-width:none}}
      `}</style>

      <div className="noprint">
        <button onClick={() => window.print()}>🖨️ Imprimir / Salvar PDF</button>
      </div>

      <div className="doc">
        <div className="hero">
          <div className="top">
            <img src="/march-logo-ouro.png" alt="MARCH" style={{ height: 38 }} />
            <span className="k">Parecer de Avaliação Econômica</span>
          </div>
          <h1 className="serif">
            {i.razaoSocial || "Empresa"}
            <br />
            <em>avaliação por múltiplos de mercado.</em>
          </h1>
          <div className="meta">
            <div>
              CNPJ<b>{i.cnpj || "—"}</b>
            </div>
            <div>
              Setor<b>{i.setor || "—"}</b>
            </div>
            <div>
              Data-base<b>{i.dataBase || "—"}</b>
            </div>
          </div>
        </div>

        <div className="stats">
          <div className="s">
            <div className="n">{i.anosMercado ? i.anosMercado + " anos" : "—"}</div>
            <div className="l">Mercado</div>
          </div>
          <div className="s">
            <div className="n">{brl(r.receitaTotal)}</div>
            <div className="l">Receita declarada</div>
          </div>
          <div className="s">
            <div className="n">{i.margemPct}%</div>
            <div className="l">Margem líquida</div>
          </div>
          <div className="s">
            <div className="n">{brl(r.valor.medio)}</div>
            <div className="l">Valor de referência</div>
          </div>
        </div>

        <div className="body">
          <div className="valbox">
            <div className="l">Valor de referência estimado</div>
            <div className="v">
              {brl(r.valor.min)} – {brl(r.valor.max)}
            </div>
          </div>

          {blocos.map((b, k) => (
            <div key={k}>
              {b.titulo && <h2>{b.titulo}</h2>}
              {b.corpo.map((par, j) => (
                <p key={j}>{par}</p>
              ))}
            </div>
          ))}

          <h2>Avaliação — múltiplos de mercado</h2>
          <table>
            <tbody>
              <tr>
                <td>Receita total declarada</td>
                <td className="n">{brl(r.receitaTotal)}</td>
              </tr>
              <tr>
                <td>Múltiplo sobre o lucro ({i.multLucroMin}x–{i.multLucroMax}x)</td>
                <td className="n">
                  {brl(r.metodoLucro.min)} – {brl(r.metodoLucro.max)}
                </td>
              </tr>
              <tr>
                <td>EV / Receita ({i.multReceitaMin}x–{i.multReceitaMax}x)</td>
                <td className="n">
                  {brl(r.metodoReceita.min)} – {brl(r.metodoReceita.max)}
                </td>
              </tr>
              <tr>
                <td>Prêmio por intangíveis</td>
                <td className="n">+{i.premioPct}%</td>
              </tr>
            </tbody>
          </table>

          <h2>Cenário decisório</h2>
          <div className="scen">
            <div className="bad">
              <span style={{ fontFamily: "Fraunces,serif", fontWeight: 600 }}>Venda sob pressão</span>
              <span style={{ color: "#4a463d" }}>Comprador percebe urgência e comprime o múltiplo.</span>
              <span className="c">
                {brl(r.cenarios.pressao.min)} – {brl(r.cenarios.pressao.max)}
              </span>
            </div>
            <div>
              <span style={{ fontFamily: "Fraunces,serif", fontWeight: 600 }}>Valor justo hoje</span>
              <span style={{ color: "#4a463d" }}>Avaliação técnica + intangíveis.</span>
              <span className="c">
                {brl(r.cenarios.justo.min)} – {brl(r.cenarios.justo.max)}
              </span>
            </div>
            <div className="good">
              <span style={{ fontFamily: "Fraunces,serif", fontWeight: 600 }}>Segurar 24–36 meses</span>
              <span style={{ color: "#4a463d" }}>Normalização rumo à capacidade comprovada.</span>
              <span className="c">
                {brl(r.cenarios.segurar.min)} – {brl(r.cenarios.segurar.max)}
              </span>
            </div>
          </div>
          <div className="field">
            <div className="bar" />
            <div className="mk" style={{ left: `${pos(r.valor.medio)}%` }}>
              {brl(r.valor.medio)}
              <div className="t" />
            </div>
          </div>

          <div className="assin">
            <div className="l" />
            <b style={{ fontFamily: "Fraunces,serif" }}>MARCH Contabilidade &amp; Assessoria</b>
            <br />
            <span style={{ color: "var(--cinza)", fontSize: 11 }}>Responsável Técnico — CRC</span>
          </div>

          <div className="disc">
            Parecer de natureza indicativa, elaborado a partir de informações fornecidas pela
            administração e do método de múltiplos de mercado. Não constitui laudo pericial de
            avaliação (NBC TP 03 / IVS) nem oferta de compra e venda; o valor de uma eventual
            transação depende de negociação e diligência específica.
          </div>
        </div>
      </div>
    </>
  );
}
