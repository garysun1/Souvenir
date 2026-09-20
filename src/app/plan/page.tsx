import { AppHeader } from "@/components/ui/app-header";
import { PageBody } from "@/components/ui/page";
import { PlanContent } from "@/components/account/plan-content";

export default async function PlanPage({
  searchParams,
}: {
  searchParams: Promise<{ placeIds?: string; wishlistId?: string; planId?: string }>;
}) {
  const context = await searchParams;
  return (
    <>
      <AppHeader title="Plan" />
      <PageBody>
        <PlanContent
          key={`${context.wishlistId ?? ""}:${context.placeIds ?? ""}`}
          context={context}
        />
      </PageBody>
    </>
  );
}
