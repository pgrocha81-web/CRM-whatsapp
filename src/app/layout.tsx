import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Koala WhatsApp CRM",
  description: "Central comercial da Koala Turismo — WhatsApp + CRM + IA copiloto",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body className="bg-gray-50 text-gray-900 antialiased">{children}</body>
    </html>
  );
}
