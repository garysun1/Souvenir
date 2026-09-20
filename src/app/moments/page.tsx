import { AppHeader } from "@/components/ui/app-header";
import { PageBody } from "@/components/ui/page";
import { MomentsList } from "@/components/memories/moments-list";

export default function MomentsPage() {
  return (
    <>
      <AppHeader title="Your moments" />
      <PageBody>
        <MomentsList />
      </PageBody>
    </>
  );
}
