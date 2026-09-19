import Link from "next/link";
import { AppHeader } from "@/components/ui/app-header";
import { EmptyState } from "@/components/ui/empty-state";

export default function CapturePage() {
  return (
    <>
      <AppHeader title="Capture" />
      <div className="space-y-5 px-[18px] pt-7">
        <EmptyState
          title="Keep the moment"
          description="Take a photo or choose a sample capture to add a place to your collection."
          action={
            <Link
              href="/discover"
              className="inline-flex min-h-11 items-center rounded-full bg-brand px-5 text-sm font-semibold text-white"
            >
              Browse places
            </Link>
          }
        />
      </div>
    </>
  );
}
