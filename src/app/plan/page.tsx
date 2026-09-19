import Link from "next/link";
import { AppHeader } from "@/components/ui/app-header";
import { EmptyState } from "@/components/ui/empty-state";

export default function PlanPage() {
  return (
    <>
      <AppHeader title="Plan" />
      <div className="space-y-5 px-[18px] pt-7">
        <EmptyState
          title="Plan an afternoon"
          description="Choose a few places from Discover and we'll help shape the route."
          action={
            <Link
              href="/discover"
              className="inline-flex min-h-11 items-center rounded-full bg-brand px-5 text-sm font-semibold text-white"
            >
              Find a place
            </Link>
          }
        />
      </div>
    </>
  );
}
