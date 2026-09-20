import { AppHeader } from "@/components/ui/app-header";
import { PageBody } from "@/components/ui/page";
import { AlbumList } from "@/components/memories/album-list";

export default function AlbumsPage() {
  return (
    <>
      <AppHeader title="Trip albums" />
      <PageBody>
        <AlbumList />
      </PageBody>
    </>
  );
}
