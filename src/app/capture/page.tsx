import { AppHeader } from "@/components/ui/app-header";
import { PageBody } from "@/components/ui/page";
import { CaptureForm } from "@/components/collection/capture-form";

export default async function CapturePage({
  searchParams,
}: {
  searchParams: Promise<{ placeId?: string; outingId?: string }>;
}) {
  const { placeId, outingId } = await searchParams;
  return (
    <>
      <AppHeader title="Capture" />
      <PageBody className="space-y-5">
        <CaptureForm placeId={placeId} outingId={outingId} />
      </PageBody>
    </>
  );
}
