"use client";

import Link from "next/link";
import { Camera } from "lucide-react";
import { usePathname } from "next/navigation";
import { cn } from "cn";
import { navItems } from "./nav-items";

export function SideNav() {
  const pathname = usePathname();
  return (
    <nav
      aria-label="Primary"
      className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col border-r border-divider bg-white p-6 lg:flex"
    >
      <Link href="/discover" className="font-serif text-[25px] font-extrabold text-brand">
        souvenir
      </Link>
      <div className="mt-8 space-y-1">
        {navItems.map((item) => {
          const Icon = item.icon;
          const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex min-h-11 items-center gap-3 rounded-lg px-3 text-sm",
                active
                  ? "bg-surface-muted font-semibold text-brand"
                  : "text-text-secondary hover:bg-surface-muted",
              )}
            >
              <Icon className="size-5" strokeWidth={1.6} />
              {item.label}
            </Link>
          );
        })}
      </div>
      <Link
        href="/capture"
        className="mt-5 flex min-h-11 items-center justify-center gap-2 rounded-full bg-brand px-4 text-sm font-semibold text-white"
      >
        <Camera className="size-4" strokeWidth={1.7} />
        Capture
      </Link>
      <Link href="/plan" className="mt-auto text-sm font-semibold text-brand hover:underline">
        Plan an afternoon
      </Link>
    </nav>
  );
}
