import type { Metadata, Viewport } from "next";
// @ts-ignore: Next.js handles global CSS side-effect imports.
import "./globals.css";

export const metadata: Metadata = {
  title: "TimeLog | Timeregistrering",
  description: "Enkel registrering af medarbejdertimer",
  manifest: "/manifest.json",
};

export const viewport: Viewport = {
  themeColor: "#12352a",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="da">
      <body>{children}</body>
    </html>
  );
}
