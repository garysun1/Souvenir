import Link from "next/link";
import { CalendarDays, Globe } from "lucide-react";
import { AppHeader } from "@/components/ui/app-header";
import { DiscoverContent } from "./discover-content";

export default function DiscoverPage() {
  return (
    <>
      <AppHeader
        left={
          <span className="flex min-h-11 items-center gap-1 text-sm font-medium">
            <Globe className="size-4 text-brand" /> Worldwide
          </span>
        }
        right={
          <Link
            aria-label="Plan an afternoon"
            href="/plan"
            className="flex min-h-11 min-w-11 items-center justify-center rounded-full text-brand"
          >
            <CalendarDays className="size-5" strokeWidth={1.6} />
          </Link>
        }
      />
      <DiscoverContent />
    </>
  );
}
