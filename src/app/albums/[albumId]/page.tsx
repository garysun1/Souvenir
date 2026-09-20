import { AppHeader } from "@/components/ui/app-header";
import { PageBody } from "@/components/ui/page";
import { AlbumDetail } from "@/components/memories/album-detail";

export default async function AlbumPage({ params }: { params: Promise<{ albumId: string }> }) {
  const { albumId } = await params;
  return (
    <>
      <AppHeader title="Trip album" />
      <PageBody>
        <AlbumDetail key={albumId} albumId={albumId} />
      </PageBody>
    </>
  );
}
