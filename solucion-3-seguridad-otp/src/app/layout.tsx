import type { ReactNode } from "react";
import "./globals.css";
import LogoutButton from "./logout-button";

export const metadata = {
  title: "Verificarlo Demo - Seguridad",
  description: "Prototipo con datos simulados: OTP seguro, rate limiting y auditoría.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="es">
      <body>
        <nav>
          <strong>Verificarlo Demo</strong>
          <a href="/inspecciones">Inspecciones</a>
          <a href="/auditoria">Auditoría</a>
          <span className="spacer" />
          <a href="/login">Ingresar</a>
          <LogoutButton />
        </nav>
        <main>{children}</main>
      </body>
    </html>
  );
}
