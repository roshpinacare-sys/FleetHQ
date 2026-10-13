import type { Metadata, Viewport } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import { ThemeProvider } from "next-themes";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";

// SELF-HOSTED FONTS (build-time zero-network law): next/font/google fetched
// fonts from Google at build time and the runner's flaky network turned it
// into 38 resolve errors (office-3d bake RED, 2026-10-11T21:27Z). The geist
// package ships the same variable names (--font-geist-sans/--font-geist-mono);
// Heebo + JetBrains Mono ship via @fontsource with identical CSS var contract
// defined below — same glyphs, same weights, zero build-time fetches.
import "@fontsource/heebo/400.css";
import "@fontsource/heebo/500.css";
import "@fontsource/heebo/600.css";
import "@fontsource/heebo/700.css";
import "@fontsource/jetbrains-mono/400.css";
import "@fontsource/jetbrains-mono/500.css";
import "@fontsource/jetbrains-mono/700.css";

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
  themeColor: "#f3f1ec",
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
        className={`${GeistSans.variable} ${GeistMono.variable} antialiased bg-background text-foreground`}
        style={{ fontFamily: "var(--font-heebo), var(--font-geist-sans), system-ui, sans-serif" }}
      >
        {/* Task 51 (Daylight Slate): light by default — the night palette lives
            under html.dark, user's choice via the header toggle. */}
        <ThemeProvider attribute="class" defaultTheme="light" enableSystem={false} disableTransitionOnChange>
          {children}
          <Toaster />
        </ThemeProvider>
      </body>
    </html>
  );
}
