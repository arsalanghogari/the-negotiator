import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "The Negotiator",
  description: "An AI agent that calls, compares, and negotiates moving quotes for you.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <header className="border-b">
          <nav className="mx-auto flex max-w-4xl items-center gap-6 px-8 py-3 text-sm">
            <a href="/" className="font-bold">The Negotiator</a>
            <a href="/intake" className="text-muted-foreground hover:text-foreground">Intake</a>
            <a href="/calls" className="text-muted-foreground hover:text-foreground">Calls</a>
            <a href="/report" className="text-muted-foreground hover:text-foreground">Report</a>
          </nav>
        </header>
        {children}
      </body>
    </html>
  );
}
