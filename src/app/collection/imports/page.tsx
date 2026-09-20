import { AppHeader } from "@/components/ui/app-header";
import { PageBody } from "@/components/ui/page";
import { ImportList } from "@/components/memories/import-list";

export default function ImportsPage() {
  return (
    <>
      <AppHeader title="Import memories" />
      <PageBody>
        <ImportList />
      </PageBody>
    </>
  );
}
