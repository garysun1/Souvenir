import { AppHeader } from "@/components/ui/app-header";
import { PageBody } from "@/components/ui/page";
import { FriendsContent } from "@/components/social/friends-content";

export default function FriendsPage() {
  return (
    <>
      <AppHeader title="Friends" />
      <PageBody>
        <FriendsContent />
      </PageBody>
    </>
  );
}
