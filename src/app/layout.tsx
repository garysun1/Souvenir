import type { Metadata } from "next";
import type { Viewport } from "next";
import type { ReactNode } from "react";
import { Inter, Playfair_Display } from "next/font/google";
import "./globals.css";
import { BottomNav } from "@/components/ui/bottom-nav";
import { SideNav } from "@/components/ui/side-nav";

export const metadata: Metadata = {
  title: "Souvenir",
  description: "Collect places. Keep memories. Find your next adventure.",
};

export const viewport: Viewport = {
  themeColor: "#144F5D",
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
      <body className={`${playfair.variable} ${inter.variable} min-h-screen bg-surface`}>
        <div className="flex min-h-screen">
          <SideNav />
          <div className="flex min-w-0 flex-1 flex-col">
            <main className="flex-1 pb-24 lg:pb-8">{children}</main>
          </div>
        </div>
        <BottomNav />
      </body>
    </html>
  );
}
