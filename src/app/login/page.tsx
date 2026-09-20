"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { AppHeader } from "@/components/ui/app-header";
import { PageBody } from "@/components/ui/page";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useAccount } from "@/components/account/account-provider";
import { ErrorNotice } from "@/components/account/account-state";
import { errorMessage } from "@/lib/web/api";

export default function LoginPage() {
  const { client, userId, error: accountError, signOut } = useAccount();
  const router = useRouter();
  const [signup, setSignup] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!client) return;
    setBusy(true);
    setError(null);
    setMessage("");
    try {
      const result = signup
        ? await client.auth.signUp({
            email: email.trim(),
            password,
            options: { emailRedirectTo: `${window.location.origin}/auth/callback?next=/profile` },
          })
        : await client.auth.signInWithPassword({ email: email.trim(), password });
      if (result.error) throw result.error;
      if (!result.data.session) {
        setMessage(
          "Check your email to confirm your account, then return here to sign in. You are not signed in yet.",
        );
        setPassword("");
      } else {
        router.replace("/collection");
      }
    } catch (failure) {
      setError(errorMessage(failure));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <AppHeader title={signup ? "Create an account" : "Sign in"} />
      <PageBody>
        <div className="mx-auto max-w-md space-y-5">
          <p className="text-sm text-text-secondary">
            One email account for your web and mobile collection.
          </p>
          <ErrorNotice message={error ?? accountError} />
          {!userId && accountError?.includes("signing out") && (
            <Button
              variant="outline"
              onClick={async () => {
                try {
                  await signOut();
                } catch (failure) {
                  setError(errorMessage(failure));
                }
              }}
            >
              Retry sign out
            </Button>
          )}
          {message && (
            <p role="status" className="rounded-xl bg-surface-muted p-4 text-sm">
              {message}
            </p>
          )}
          {userId ? (
            <div className="space-y-4">
              <Link href="/profile" className="block text-brand underline">
                Open your profile
              </Link>
              <Button
                variant="outline"
                onClick={async () => {
                  try {
                    await signOut();
                  } catch (failure) {
                    setError(errorMessage(failure));
                  }
                }}
              >
                Sign out to switch accounts
              </Button>
            </div>
          ) : (
            <form onSubmit={submit} className="space-y-4">
              <label className="block space-y-2 text-sm font-medium">
                Email
                <Input
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  required
                />
              </label>
              <label className="block space-y-2 text-sm font-medium">
                Password
                <Input
                  type="password"
                  autoComplete={signup ? "new-password" : "current-password"}
                  minLength={signup ? 8 : undefined}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  required
                />
              </label>
              <Button type="submit" className="w-full" disabled={busy || !client}>
                {busy ? "Please wait…" : signup ? "Create account" : "Sign in"}
              </Button>
              <Button
                type="button"
                variant="ghost"
                disabled={busy}
                onClick={() => {
                  setSignup(!signup);
                  setError(null);
                  setMessage("");
                }}
              >
                {signup ? "Already have an account? Sign in" : "New here? Create an account"}
              </Button>
            </form>
          )}
        </div>
      </PageBody>
    </>
  );
}
