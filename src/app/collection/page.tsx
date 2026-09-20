import { AppHeader } from "@/components/ui/app-header";
import { CollectionContent } from "./collection-content";
import { Suspense } from "react";

export default function CollectionPage() {
  return (
    <>
      <AppHeader title="Collection" />
      <Suspense fallback={<p role="status">Loading your memories…</p>}>
        <CollectionContent />
      </Suspense>
    </>
  );
}
