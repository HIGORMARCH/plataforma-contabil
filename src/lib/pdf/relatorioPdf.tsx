/**
 * Geração do PDF do relatório técnico com papel timbrado do escritório.
 * Usa @react-pdf/renderer (fontes padrão, sem dependência de rede).
 */

import React from "react";
import {
  Document,
  Page,
  Text,
  View,
  Image,
  StyleSheet,
  renderToBuffer,
} from "@react-pdf/renderer";
import type { ResultadoAnalise } from "@/lib/accounting/analyze";
import { ROTULO_SITUACAO, ROTULO_CLASSIFICACAO } from "@/lib/accounting/analyze";
import type { RelatorioTexto } from "@/lib/accounting/narrative";

export interface DadosPdf {
  escritorio: {
    razaoSocial: string;
    nomeFantasia?: string | null;
    cnpj?: string | null;
    crc?: string | null;
    endereco?: string | null;
    telefone?: string | null;
    email?: string | null;
    site?: string | null;
    logoDataUrl?: string | null;
    assinaturaDataUrl?: string | null;
    corPrimaria: string;
    corSecundaria?: string | null;
    rodapePadrao?: string | null;
  };
  cliente: {
    razaoSocial: string;
    cnpj: string;
    cnaePrincipal?: string | null;
    regimeTributario?: string | null;
    porte?: string | null;
    contadorResponsavel?: string | null;
    crcContador?: string | null;
  };
  relatorio: {
    titulo: string;
    periodo: string;
    situacao: string;
    bloqueado: boolean;
    aprovadoPor?: string | null;
    geradoEm: string;
  };
  texto: RelatorioTexto;
  analise: ResultadoAnalise;
  documentos: string[];
}

function estilos(cor: string, corSec: string) {
  return StyleSheet.create({
    page: { paddingTop: 112, paddingBottom: 70, paddingHorizontal: 50, fontSize: 10, color: "#1f2937", lineHeight: 1.5 },
    header: {
      position: "absolute", top: 0, left: 0, right: 0, height: 96,
      backgroundColor: "#ffffff", borderBottom: `2pt solid ${corSec}`,
      paddingHorizontal: 50, paddingTop: 14, paddingBottom: 8,
      flexDirection: "column", alignItems: "flex-start", justifyContent: "flex-end",
    },
    headerNome: { color: cor, fontSize: 15, fontFamily: "Helvetica-Bold" },
    headerSub: { color: cor, fontSize: 8.5, fontFamily: "Helvetica-Bold", textAlign: "left", marginTop: 1 },
    logo: { height: 58, objectFit: "contain" },
    footer: {
      position: "absolute", bottom: 0, left: 0, right: 0, height: 50,
      paddingHorizontal: 50, paddingTop: 10, borderTop: `1pt solid ${cor}`,
      flexDirection: "row", justifyContent: "space-between", fontSize: 7, color: "#64748b",
    },
    secaoTitulo: {
      fontSize: 12, fontFamily: "Helvetica-Bold", color: cor,
      marginTop: 16, marginBottom: 7, borderBottom: `1.5pt solid ${corSec}`, paddingBottom: 4,
      letterSpacing: 0.3,
    },
    paragrafo: { marginBottom: 5, textAlign: "justify" },
    // Capa
    capa: { flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%" },
    capaRegua: { width: 70, height: 3, backgroundColor: corSec, marginTop: 14 },
    capaTitulo: { fontSize: 22, fontFamily: "Helvetica-Bold", color: cor, marginTop: 18, textAlign: "center", letterSpacing: 0.5 },
    capaBox: { marginTop: 26, padding: 18, border: `1pt solid ${corSec}`, backgroundColor: "#faf7f0", borderRadius: 4, width: "82%" },
    capaLinha: { flexDirection: "row", justifyContent: "space-between", marginBottom: 5 },
    capaLabel: { color: "#6b7280" },
    capaValor: { fontFamily: "Helvetica-Bold", color: cor },
    // Tabela
    tabelaHead: { flexDirection: "row", backgroundColor: "#f4efe4", borderBottom: `1pt solid ${corSec}`, paddingVertical: 4 },
    tabelaRow: { flexDirection: "row", borderBottom: "0.5pt solid #ece6da", paddingVertical: 3 },
    cIndicador: { width: "30%", paddingHorizontal: 3 },
    cFormula: { width: "34%", paddingHorizontal: 3, fontSize: 8, color: "#64748b" },
    cValor: { width: "16%", paddingHorizontal: 3, textAlign: "right", fontFamily: "Helvetica-Bold" },
    cClasse: { width: "20%", paddingHorizontal: 3, textAlign: "right" },
    th: { fontFamily: "Helvetica-Bold", fontSize: 8, color: "#475569" },
    boxAlerta: { backgroundColor: "#fef2f2", border: "1pt solid #fecaca", borderRadius: 4, padding: 8, marginBottom: 8, color: "#991b1b" },
    assinaturaArea: { marginTop: 40, alignItems: "center" },
    linhaAssinatura: { borderTop: `1pt solid ${cor}`, width: 240, marginTop: 30, paddingTop: 4, textAlign: "center" },
  });
}

const CLASSE_COR: Record<string, string> = {
  saudavel: "#166534",
  atencao: "#854d0e",
  critico: "#991b1b",
  inconclusivo: "#475569",
};

export async function gerarRelatorioPdf(d: DadosPdf): Promise<Buffer> {
  const cor = d.escritorio.corPrimaria || "#3d3b30";
  const s = estilos(cor, d.escritorio.corSecundaria || "#c2a565");
  const nomeEscritorio = d.escritorio.nomeFantasia || d.escritorio.razaoSocial;

  const Cabecalho = () => (
    <View style={s.header} fixed>
      {d.escritorio.logoDataUrl ? (
        // eslint-disable-next-line jsx-a11y/alt-text
        <Image style={s.logo} src={d.escritorio.logoDataUrl} />
      ) : (
        <Text style={s.headerNome}>{nomeEscritorio}</Text>
      )}
      <Text style={s.headerSub}>
        {[d.escritorio.cnpj ? `CNPJ ${d.escritorio.cnpj}` : nomeEscritorio, d.escritorio.crc]
          .filter(Boolean)
          .join("   •   ")}
      </Text>
    </View>
  );

  const Rodape = () => (
    <View style={s.footer} fixed>
      <Text>
        {d.escritorio.rodapePadrao ||
          `${nomeEscritorio} — Documento gerado eletronicamente.`}
      </Text>
      <Text render={({ pageNumber, totalPages }) => `Pág. ${pageNumber}/${totalPages}`} />
    </View>
  );

  const Secao = ({ titulo, paragrafos }: { titulo: string; paragrafos: string[] }) => (
    <View wrap>
      <Text style={s.secaoTitulo}>{titulo}</Text>
      {paragrafos.map((p, i) => (
        <Text key={i} style={s.paragrafo}>{p}</Text>
      ))}
    </View>
  );

  const doc = (
    <Document title={d.relatorio.titulo} author={nomeEscritorio}>
      {/* CAPA */}
      <Page size="A4" style={s.page}>
        <Cabecalho />
        <Rodape />
        <View style={s.capa}>
          {d.escritorio.logoDataUrl ? (
            // eslint-disable-next-line jsx-a11y/alt-text
            <Image style={{ height: 90, objectFit: "contain" }} src={d.escritorio.logoDataUrl} />
          ) : (
            <Text style={{ fontSize: 16, color: cor, fontFamily: "Helvetica-Bold", marginTop: 16 }}>{nomeEscritorio}</Text>
          )}
          <View style={s.capaRegua} />
          <Text style={s.capaTitulo}>{d.relatorio.titulo}</Text>
          <View style={s.capaBox}>
            <View style={s.capaLinha}>
              <Text style={s.capaLabel}>Cliente</Text>
              <Text style={s.capaValor}>{d.cliente.razaoSocial}</Text>
            </View>
            <View style={s.capaLinha}>
              <Text style={s.capaLabel}>CNPJ</Text>
              <Text style={s.capaValor}>{d.cliente.cnpj}</Text>
            </View>
            <View style={s.capaLinha}>
              <Text style={s.capaLabel}>Período analisado</Text>
              <Text style={s.capaValor}>{d.relatorio.periodo}</Text>
            </View>
            <View style={s.capaLinha}>
              <Text style={s.capaLabel}>Data de emissão</Text>
              <Text style={s.capaValor}>{new Date(d.relatorio.geradoEm).toLocaleDateString("pt-BR")}</Text>
            </View>
            {d.escritorio.crc ? (
              <View style={s.capaLinha}>
                <Text style={s.capaLabel}>CRC do escritório</Text>
                <Text style={s.capaValor}>{d.escritorio.crc}</Text>
              </View>
            ) : null}
          </View>
        </View>
      </Page>

      {/* CONTEÚDO */}
      <Page size="A4" style={s.page}>
        <Cabecalho />
        <Rodape />

        <Text style={s.secaoTitulo}>1. Identificação da empresa analisada</Text>
        <View>
          <Text style={s.paragrafo}>Razão social: {d.cliente.razaoSocial}</Text>
          <Text style={s.paragrafo}>CNPJ: {d.cliente.cnpj}</Text>
          {d.cliente.cnaePrincipal ? <Text style={s.paragrafo}>Atividade econômica: {d.cliente.cnaePrincipal}</Text> : null}
          <Text style={s.paragrafo}>
            Regime tributário: {d.cliente.regimeTributario || "—"} • Porte: {d.cliente.porte || "—"}
          </Text>
          <Text style={s.paragrafo}>Período analisado: {d.relatorio.periodo}</Text>
          <Text style={s.paragrafo}>
            Responsável técnico: {d.cliente.contadorResponsavel || "—"}
            {d.cliente.crcContador ? ` (${d.cliente.crcContador})` : ""}
          </Text>
        </View>

        <Text style={s.secaoTitulo}>2. Objetivo do relatório</Text>
        <Text style={s.paragrafo}>
          Este relatório tem por finalidade apresentar análise técnica dos demonstrativos contábeis
          disponibilizados, com foco na situação econômica, financeira, patrimonial e contábil da empresa.
        </Text>

        <Text style={s.secaoTitulo}>3. Documentos analisados</Text>
        {(d.documentos.length ? d.documentos : ["Demonstrativos informados na plataforma"]).map((doc, i) => (
          <Text key={i} style={s.paragrafo}>• {doc}</Text>
        ))}

        <Text style={s.secaoTitulo}>4. Limitação de escopo</Text>
        <Text style={s.paragrafo}>{d.texto.limitacaoEscopo}</Text>

        {d.relatorio.bloqueado ? (
          <View style={s.boxAlerta}>
            <Text style={{ fontFamily: "Helvetica-Bold" }}>Atenção — emissão condicionada à revisão</Text>
            <Text>
              Foram detectadas inconsistências relevantes nos dados. A conclusão permanece inconclusiva
              até a revisão e correção pelo contador responsável.
            </Text>
          </View>
        ) : null}

        <Secao titulo="5. Resumo executivo" paragrafos={d.texto.resumoExecutivo} />
        <Secao titulo="6. Análise do Balanço Patrimonial" paragrafos={d.texto.analiseBalanco} />
        <Secao titulo="7. Análise da DRE" paragrafos={d.texto.analiseResultado} />

        {/* Tabela de indicadores */}
        <Text style={s.secaoTitulo}>8. Análise dos indicadores financeiros</Text>
        <View style={s.tabelaHead}>
          <Text style={[s.cIndicador, s.th]}>Indicador</Text>
          <Text style={[s.cFormula, s.th]}>Fórmula</Text>
          <Text style={[s.cValor, s.th]}>Valor</Text>
          <Text style={[s.cClasse, s.th]}>Classificação</Text>
        </View>
        {d.analise.indicadoresRecentes.map((ind) => (
          <View style={s.tabelaRow} key={ind.chave} wrap={false}>
            <Text style={s.cIndicador}>{ind.nome}</Text>
            <Text style={s.cFormula}>{ind.formula}</Text>
            <Text style={s.cValor}>{ind.valorFormatado}</Text>
            <Text style={[s.cClasse, { color: CLASSE_COR[ind.classificacao] }]}>
              {ROTULO_CLASSIFICACAO[ind.classificacao]}
            </Text>
          </View>
        ))}

        <Secao titulo="9. Pontos de atenção" paragrafos={d.texto.pontosAtencao} />
        <Secao titulo="10. Recomendações técnicas" paragrafos={d.texto.recomendacoes} />

        <Text style={s.secaoTitulo}>11. Conclusão</Text>
        <Text style={[s.paragrafo, { fontFamily: "Helvetica-Bold" }]}>
          Classificação: {ROTULO_SITUACAO[d.analise.situacao]}
        </Text>
        {d.texto.conclusao.map((p, i) => (
          <Text key={i} style={s.paragrafo}>{p}</Text>
        ))}

        {/* Responsabilidade técnica */}
        <View style={s.assinaturaArea} wrap={false}>
          <Text style={s.secaoTitulo}>12. Responsabilidade técnica</Text>
          {d.escritorio.assinaturaDataUrl ? (
            // eslint-disable-next-line jsx-a11y/alt-text
            <Image style={{ height: 50, objectFit: "contain" }} src={d.escritorio.assinaturaDataUrl} />
          ) : null}
          <View style={s.linhaAssinatura}>
            <Text style={{ fontFamily: "Helvetica-Bold" }}>
              {d.relatorio.aprovadoPor || d.cliente.contadorResponsavel || "Contador Responsável"}
            </Text>
            <Text style={{ fontSize: 8, color: "#64748b" }}>
              {d.cliente.crcContador || d.escritorio.crc || ""} • {nomeEscritorio}
            </Text>
            <Text style={{ fontSize: 8, color: "#64748b" }}>
              {new Date(d.relatorio.geradoEm).toLocaleDateString("pt-BR")}
            </Text>
          </View>
        </View>
      </Page>
    </Document>
  );

  return renderToBuffer(doc);
}
