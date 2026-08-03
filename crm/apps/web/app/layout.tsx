import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Mabres CRM",
  description: "CRM imobiliário Mabres Negócios Imobiliários",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
