import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono, Heebo, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// Heebo carries the Hebrew glyphs for the Fleet World HUD (the console uses it too)
const heebo = Heebo({
  variable: "--font-heebo",
  subsets: ["hebrew", "latin"],
  weight: ["400", "500", "600", "700", "800"],
});

// JetBrains Mono — instrument readouts, git hashes, log lines
const jetbrains = JetBrains_Mono({
  variable: "--font-jetbrains",
  subsets: ["latin"],
  weight: ["400", "500", "700"],
});

export const metadata: Metadata = {
  title: "מפקדת הצי · Fleet HQ — חדר הפעולה של הסוכנים",
  description:
    "משרד חי של סוכני AI אמיתיים: ראש-מטה מתכנן, סוכנים עובדים על ספרי הצי בזמן אמת, מסכים חיים והחלטות שדורשות אותך. The live operations room of real AI agents working the fleet's real books.",
  keywords: ["Fleet HQ", "AI agents", "agents office", "SAOS", "מפקדת הצי", "סוכנים", "AI office"],
  icons: {
    icon: "https://z-cdn.chatglm.cn/z-ai/static/logo.svg",
  },
  openGraph: {
    title: "מפקדת הצי · Fleet HQ",
    description: "The live operations room — real AI agents working the fleet's real books, in real time.",
    type: "website",
  },
};

export const viewport: Viewport = {
  themeColor: "#0b0b0e",
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
      <body
        className={`${geistSans.variable} ${geistMono.variable} ${heebo.variable} ${jetbrains.variable} antialiased bg-background text-foreground`}
        style={{ fontFamily: "var(--font-heebo), var(--font-geist-sans), system-ui, sans-serif" }}
      >
        {children}
        <Toaster />
      </body>
    </html>
  );
}
