import { AppHeader } from "@/components/ui/app-header";
import { PageBody } from "@/components/ui/page";
import { PlanContent } from "@/components/account/plan-content";

export default function PlanPage() {
  return (
    <>
      <AppHeader title="Plan" />
      <PageBody>
        <PlanContent />
      </PageBody>
    </>
  );
}
