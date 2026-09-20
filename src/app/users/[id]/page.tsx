import { AppHeader } from "@/components/ui/app-header";
import { PageBody } from "@/components/ui/page";
import { UserProfile } from "@/components/social/user-profile";

export default async function UserPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <>
      <AppHeader title="Explorer" />
      <PageBody>
        <UserProfile key={id} id={id} />
      </PageBody>
    </>
  );
}
