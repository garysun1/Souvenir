import Link from "next/link";
import { AccountControls } from "@/components/auth/account-controls";
import { PageBody } from "@/components/ui/page";
import { getCurrentUserId } from "@/lib/auth/server";
import { ensureUserProfile } from "@/lib/auth/profile";

export default async function AccountPage() {
  let name: string | null = null;
  let error = "";
  try {
    const userId = await getCurrentUserId();
    if (userId)
      name = (await ensureUserProfile({ userId, email: null, mode: "cookie" })).displayName;
  } catch {
    error = "Your account could not be loaded. Please try again.";
  }
  return (
    <PageBody className="max-w-md space-y-5 py-10">
      <h1 className="font-serif text-3xl font-bold text-brand">Account</h1>
      {error && <p role="alert">{error}</p>}
      {name ? <p>Signed in as {name}.</p> : <p>Sign in to sync your collection.</p>}
      <AccountControls />
      <Link href="/login" className="block text-brand">
        Sign in or create an account
      </Link>
      <Link href="/collection" className="block text-brand">
        Back to collection
      </Link>
    </PageBody>
  );
}
