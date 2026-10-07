import type { Metadata, Viewport } from "next";
import { Heebo } from "next/font/google";
import "./globals.css";

const heebo = Heebo({
  variable: "--font-heebo",
  subsets: ["hebrew", "latin"],
  weight: ["400", "500", "600", "700", "800"],
});

export const metadata: Metadata = {
  title: "Fleet HQ — the agents' operations room",
  description:
    "A live operations room: a chief-of-staff agent plans real work, worker agents execute it on real data books with live monitors, and decisions come to you. מפקדת הצי.",
  keywords: ["AI agents", "agents office", "multi-agent", "live dashboard", "Fleet HQ"],
};

export const viewport: Viewport = {
  themeColor: "#131316",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="he" suppressHydrationWarning>
      <body className={`${heebo.variable} antialiased`} style={{ fontFamily: "var(--font-heebo), system-ui, sans-serif" }}>
        {children}
      </body>
    </html>
  );
}
