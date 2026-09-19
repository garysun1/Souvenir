import { AppHeader } from "@/components/ui/app-header";
import { getCurrentCollection } from "@/lib/data";
import { CollectionContent } from "./collection-content";

export default async function CollectionPage() {
  const collection = await getCurrentCollection();
  return (
    <>
      <AppHeader title="Collection" />
      <CollectionContent collection={collection} />
    </>
  );
}
