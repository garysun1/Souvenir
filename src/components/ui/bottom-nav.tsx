"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Camera, Compass, Heart, Plus, UserRound, UsersRound } from "lucide-react";
import { cn } from "cn";

const items = [
  { label: "Discover", href: "/discover", icon: Compass },
  { label: "Collection", href: "/collection", icon: Heart },
  { label: "Friends", href: "/friends", icon: UsersRound },
  { label: "Profile", href: "/profile", icon: UserRound },
];

export function BottomNav() {
  const pathname = usePathname();
  return (
    <nav
      aria-label="Primary"
      className="fixed inset-x-0 bottom-0 z-20 mx-auto grid max-w-[480px] grid-cols-5 border-t border-divider bg-white/95 px-2 pb-[max(8px,env(safe-area-inset-bottom))] pt-2 backdrop-blur"
    >
      <NavItem item={items[0]} pathname={pathname} />
      <NavItem item={items[1]} pathname={pathname} />
      <Link
        aria-label="Capture"
        className="flex min-h-11 flex-col items-center justify-center gap-0.5 text-[11px] font-medium text-text-secondary"
        href="/capture"
      >
        <span className="relative flex size-10 items-center justify-center rounded-full bg-brand text-white shadow-sm">
          <Plus className="size-5" strokeWidth={1.75} />
          <Camera className="absolute size-3.5" strokeWidth={1.75} />
        </span>
        <span>Capture</span>
      </Link>
      <NavItem item={items[2]} pathname={pathname} />
      <NavItem item={items[3]} pathname={pathname} />
    </nav>
  );
}

function NavItem({ item, pathname }: { item: (typeof items)[number]; pathname: string }) {
  const Icon = item.icon;
  const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
  return (
    <Link
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex min-h-11 flex-col items-center justify-center gap-0.5 rounded-lg text-[11px] font-medium",
        active ? "text-brand" : "text-text-secondary",
      )}
      href={item.href}
    >
      <Icon className="size-5" strokeWidth={1.6} />
      <span>{item.label}</span>
    </Link>
  );
}
