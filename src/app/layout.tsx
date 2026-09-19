import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Inter, Playfair_Display } from "next/font/google";
import "./globals.css";
import { BottomNav } from "@/components/ui/bottom-nav";

export const metadata: Metadata = {
  title: "Souvenir",
  description: "Collect places. Keep memories. Find your next adventure.",
};

const playfair = Playfair_Display({
  subsets: ["latin"],
  variable: "--font-playfair",
  weight: ["700", "800", "900"],
});

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  weight: ["400", "500", "600", "700"],
});

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className={`${playfair.variable} ${inter.variable} min-h-screen`}>
        <main className="mx-auto min-h-screen max-w-[480px] bg-surface pb-24 shadow-sm">
          {children}
        </main>
        <BottomNav />
      </body>
    </html>
  );
}
