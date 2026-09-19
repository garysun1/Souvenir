import type { Metadata } from "next";
import type { ReactNode } from "react";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "Souvenir",
  description: "Collect places. Keep memories. Find your next adventure.",
};

const navItems = ["Capture", "Collection", "Explore", "Plan", "Friends"];

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-stone-50 text-stone-950">
        <main className="mx-auto min-h-screen max-w-md bg-white pb-20 shadow-sm">{children}</main>
        <nav className="fixed inset-x-0 bottom-0 z-10 mx-auto flex max-w-md justify-around border-t bg-white/95 p-2 backdrop-blur">
          {navItems.map((label) => {
            const href = `/${label.toLowerCase()}`;
            return (
              <Link
                key={label}
                className="rounded-lg px-2 py-2 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
                href={href}
              >
                {label}
              </Link>
            );
          })}
        </nav>
      </body>
    </html>
  );
}
