import type { Metadata } from "next";
import { Geist_Mono, Inter } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "@/components/theme-provider";

const inter = Inter({
  variable: "--font-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "charlotte",
  description: "charlotte's website",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning className={`${inter.variable} ${geistMono.variable}`}>
      <body className="antialiased">
        {/* The visible page background. The body is shorter than the viewport,
            and a body background propagated to the root canvas surface is not
            repainted by WebKit when the theme class flips (stale until reload,
            Safari/iOS only — https://developer.apple.com/forums/thread/734135).
            Element boxes repaint correctly, so the page background must always
            be painted by a real full-viewport element. */}
        <div aria-hidden="true" className="fixed inset-0 -z-20 bg-background" />
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}
