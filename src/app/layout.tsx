import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Blinds & Curtains Quoting",
  description: "Internal quoting application",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
