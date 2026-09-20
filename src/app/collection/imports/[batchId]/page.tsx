import { AppHeader } from "@/components/ui/app-header";
import { PageBody } from "@/components/ui/page";
import { ImportDetail } from "@/components/memories/import-detail";

export default async function ImportPage({ params }: { params: Promise<{ batchId: string }> }) {
  const { batchId } = await params;
  return (
    <>
      <AppHeader title="Review import" />
      <PageBody>
        <ImportDetail batchId={batchId} />
      </PageBody>
    </>
  );
}
