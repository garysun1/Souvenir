import { AppHeader } from "@/components/ui/app-header";
import { PageBody } from "@/components/ui/page";
import { PlaceDetail } from "@/components/catalog/place-detail";

export default async function PlacePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return (
    <>
      <AppHeader title="Place" />
      <PageBody>
        <PlaceDetail key={slug} slug={slug} />
      </PageBody>
    </>
  );
}
