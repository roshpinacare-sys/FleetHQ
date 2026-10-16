import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
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

export const metadata: Metadata = {
  title: "מפקדת הצי — המשרד הריבוני החי (3D)",
  description: "המשרד התלת-ממדי של ריבונות אוטונומית: צוות אמיתי, משימות אמיתיות, אמת כלכלית מהשרשרת — הכל חי, מדוד ומפורסם.",
  keywords: ["Fleet HQ", "sovereign office", "3D office", "Steem", "autonomous sovereignty"],
  openGraph: {
    title: "מפקדת הצי — המשרד הריבוני החי",
    description: "חדר פיקוד תלת-ממדי חי — נתונים אמיתיים בלבד",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="he" dir="rtl" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-background text-foreground`}
      >
        {children}
        <Toaster />
      </body>
    </html>
  );
}
