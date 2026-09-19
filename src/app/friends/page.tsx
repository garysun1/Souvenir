import Link from "next/link";
import { AppHeader } from "@/components/ui/app-header";
import { EmptyState } from "@/components/ui/empty-state";

export default function FriendsPage() {
  return (
    <>
      <AppHeader title="Friends" />
      <div className="space-y-5 px-[18px] pt-7">
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
    </>
  );
}
