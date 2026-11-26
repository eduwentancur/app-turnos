import { Suspense } from "react";
import type { Metadata } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import "./globals.css";
import { AuthProvider } from "@/lib/auth/auth-context";

export const metadata: Metadata = {
  title: "App Turnos",
  description: "Panel de gestión de turnos de la barbería",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="es"
      className={`${GeistSans.variable} ${GeistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-stone-50 text-stone-900">
        <AuthProvider>
          {/* Rutas dinámicas (ej. /clientes/[id]) leen la URL en componentes cliente */}
          <Suspense>{children}</Suspense>
        </AuthProvider>
      </body>
    </html>
  );
}
