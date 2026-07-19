import type { Metadata } from "next";
import { Space_Grotesk, Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";

const space = Space_Grotesk({ variable: "--font-space", subsets: ["latin"] });
const inter = Inter({ variable: "--font-inter", subsets: ["latin"] });
const jetbrains = JetBrains_Mono({ variable: "--font-jetbrains", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Parley — never overpay again",
  description: "The voice that haggles so you never overpay. Parley calls the market, compares itemized quotes, and negotiates the best deal on your behalf.",
};

// Brand mark: three sound bars stepping down (brand-guidelines.pdf §4, SVG source of truth).
function Mark({ size = 24 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden>
      <rect width="48" height="48" rx="14" fill="#0B1A24" />
      <g fill="#C6F04D">
        <rect x="12" y="14" width="5" height="22" rx="2.5" />
        <rect x="21" y="20" width="5" height="16" rx="2.5" />
        <rect x="30" y="25" width="5" height="11" rx="2.5" />
      </g>
    </svg>
  );
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${space.variable} ${inter.variable} ${jetbrains.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <header className="bg-ink text-white">
          <nav className="mx-auto flex max-w-4xl items-center gap-6 px-8 py-3 text-sm">
            <a href="/" className="flex items-center gap-2.5">
              <Mark />
              <span className="font-display text-base font-bold tracking-[-0.03em]">Parley</span>
            </a>
            <a href="/intake" className="text-white/60 hover:text-white">Intake</a>
            <a href="/calls" className="text-white/60 hover:text-white">Calls</a>
            <a href="/report" className="text-white/60 hover:text-white">Report</a>
          </nav>
        </header>
        {children}
      </body>
    </html>
  );
}
