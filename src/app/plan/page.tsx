import Link from "next/link";
import { AppHeader } from "@/components/ui/app-header";
import { EmptyState } from "@/components/ui/empty-state";
import { PageBody } from "@/components/ui/page";

export default function PlanPage() {
  return (
    <>
      <AppHeader title="Plan" />
      <PageBody className="space-y-5">
        <div className="mx-auto max-w-md">
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
      </PageBody>
    </>
  );
}
