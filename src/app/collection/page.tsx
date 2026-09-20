import { AppHeader } from "@/components/ui/app-header";
import { CollectionContent } from "./collection-content";
import { Suspense } from "react";
import { MemoriesLinks } from "@/components/memories/memory-ui";
import { PageBody } from "@/components/ui/page";

export default function CollectionPage() {
  return (
    <>
      <AppHeader title="Collection" />
      <PageBody>
        <MemoriesLinks />
      </PageBody>
      <Suspense fallback={<p role="status">Loading your memories…</p>}>
        <CollectionContent />
      </Suspense>
    </>
  );
}
