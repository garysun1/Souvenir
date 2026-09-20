import { AppHeader } from "@/components/ui/app-header";
import { PageBody } from "@/components/ui/page";
import { SetDetail } from "@/components/catalog/set-detail";

export default async function SetPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return (
    <>
      <AppHeader title="Set" />
      <PageBody>
        <SetDetail slug={slug} />
      </PageBody>
    </>
  );
}
