import { AppHeader } from "@/components/ui/app-header";
import { PageBody } from "@/components/ui/page";
import { MomentDetail } from "@/components/memories/moment-detail";

export default async function MomentPage({ params }: { params: Promise<{ momentId: string }> }) {
  const { momentId } = await params;
  return (
    <>
      <AppHeader title="Moment" />
      <PageBody>
        <MomentDetail key={momentId} momentId={momentId} />
      </PageBody>
    </>
  );
}
