import { AppHeader } from "@/components/ui/app-header";
import { PageBody } from "@/components/ui/page";
import { EditionDetail } from "@/components/collection/edition-detail";

export default async function EditionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <>
      <AppHeader title="Your edition" />
      <PageBody>
        <EditionDetail id={id} />
      </PageBody>
    </>
  );
}
