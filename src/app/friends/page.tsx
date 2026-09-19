import Link from "next/link";
import { AppHeader } from "@/components/ui/app-header";
import { EmptyState } from "@/components/ui/empty-state";
import { PageBody } from "@/components/ui/page";

export default function FriendsPage() {
  return (
    <>
      <AppHeader title="Friends" />
      <PageBody className="space-y-5">
        <div className="mx-auto max-w-md">
          <EmptyState
            title="Your people are on the way"
            description="Share favorite places and compare memories with friends."
            action={
              <Link
                href="/discover"
                className="inline-flex min-h-11 items-center rounded-full bg-brand px-5 text-sm font-semibold text-white"
              >
                Discover places
              </Link>
            }
          />
        </div>
      </PageBody>
    </>
  );
}
