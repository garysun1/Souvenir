import { AppHeader } from "@/components/ui/app-header";
import { PageBody } from "@/components/ui/page";
import { ProfileContent } from "@/components/account/profile-content";

export default function ProfilePage() {
  return (
    <>
      <AppHeader title="Profile" />
      <PageBody>
        <ProfileContent />
      </PageBody>
    </>
  );
}
