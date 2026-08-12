import type { Metadata } from "next";
import { Fraunces, Instrument_Sans, JetBrains_Mono } from "next/font/google";
import "./globals.css";

// Tom "relatório editorial de auditoria":
// - Fraunces: display serifada moderna com eixo opsz — dá peso institucional nos títulos.
// - Instrument Sans: sans humanista pouco vista — evita a cara de Inter/Roboto genéricos.
// - JetBrains Mono: números tabulares nítidos pra colunas de valores.
const display = Fraunces({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  style: ["normal", "italic"],
  variable: "--font-display",
  display: "swap",
});
const body = Instrument_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-body",
  display: "swap",
});
const numeric = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-numeric",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Plataforma Contábil — Análise Financeira",
  description:
    "Plataforma para análise de demonstrativos contábeis e geração de relatórios técnicos com auxílio de IA.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="pt-BR"
      className={`h-full antialiased ${display.variable} ${body.variable} ${numeric.variable}`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
