import { AppHeader } from "@/components/ui/app-header";
import { PageBody } from "@/components/ui/page";
import { SharedLists } from "@/components/account/shared-lists";

export default function FriendsPage() {
  return (
    <>
      <AppHeader title="Friends" />
      <PageBody>
        <SharedLists />
      </PageBody>
    </>
  );
}
