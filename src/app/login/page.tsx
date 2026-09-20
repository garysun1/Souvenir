import { LoginForm } from "@/components/auth/login-form";
import { PageBody } from "@/components/ui/page";
import { safeRedirect } from "@/lib/auth/redirect";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string; confirmed?: string }>;
}) {
  const params = await searchParams;
  return (
    <PageBody className="max-w-md space-y-6 py-10">
      <h1 className="font-serif text-3xl font-bold text-brand">Your Souvenir account</h1>
      <p className="text-sm text-text-secondary">
        Keep your places and memories together on web and mobile.
      </p>
      <LoginForm
        next={safeRedirect(params.next)}
        callbackFailed={Boolean(params.error)}
        confirmed={params.confirmed === "true"}
      />
    </PageBody>
  );
}
