"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { createSupabaseBrowserClient } from "@/lib/auth/browser";
import { authenticateWithPassword } from "@/lib/auth/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function LoginForm({
  next,
  callbackFailed,
  confirmed,
}: {
  next: string;
  callbackFailed: boolean;
  confirmed: boolean;
}) {
  const [signup, setSignup] = useState(false);
  const [pending, setPending] = useState(false);
  const [confirmation, setConfirmation] = useState(confirmed);
  const [error, setError] = useState(
    callbackFailed
      ? "The confirmation link expired or could not be verified. Try signing in, or request a new link below."
      : "",
  );

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    const values = new FormData(event.currentTarget);
    setPending(true);
    setError("");
    setConfirmation(false);
    try {
      const callback = new URL("/auth/callback", window.location.origin);
      callback.searchParams.set("next", next);
      const result = await authenticateWithPassword(createSupabaseBrowserClient(), {
        email: String(values.get("email") ?? ""),
        password: String(values.get("password") ?? ""),
        signup,
        callbackUrl: callback.toString(),
      });
      if (result === "confirmation_required") {
        setConfirmation(true);
      } else {
        const response = await fetch("/api/me", { cache: "no-store" });
        if (!response.ok)
          throw new Error("Signed in, but your profile could not be loaded. Please retry.");
        window.location.assign(next);
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Sign-in failed. Please try again.");
    } finally {
      setPending(false);
    }
  }

  async function resend(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    const email = new FormData(event.currentTarget).get("email");
    if (typeof email !== "string" || !email.trim()) {
      setError("Enter your email address first.");
      return;
    }
    setPending(true);
    setError("");
    try {
      const callback = new URL("/auth/callback", window.location.origin);
      callback.searchParams.set("next", next);
      const { error: resendError } = await createSupabaseBrowserClient().auth.resend({
        type: "signup",
        email: email.trim(),
        options: { emailRedirectTo: callback.toString() },
      });
      if (resendError)
        throw new Error("The link could not be sent. Please wait a moment and retry.");
      setConfirmation(true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Please try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="space-y-5">
      {error && (
        <p
          role="alert"
          className="rounded-xl border border-destructive/30 p-3 text-sm text-destructive"
        >
          {error}
        </p>
      )}
      {confirmation && (
        <p role="status" className="rounded-xl bg-surface-muted p-4 text-sm">
          {confirmed
            ? "Your email is confirmed. Sign in below."
            : "Check your email for a confirmation link. You are not signed in yet. After confirming, return here and sign in."}
        </p>
      )}
      <form
        onSubmit={(event) => {
          const submitter = (event.nativeEvent as SubmitEvent).submitter;
          if (submitter instanceof HTMLButtonElement && submitter.value === "resend")
            void resend(event);
          else void submit(event);
        }}
        className="space-y-4"
      >
        <label className="block space-y-2 text-sm font-semibold">
          <span>Email</span>
          <Input
            name="email"
            type="email"
            autoComplete="email"
            required
            maxLength={254}
            disabled={pending}
          />
        </label>
        <label className="block space-y-2 text-sm font-semibold">
          <span>Password</span>
          <Input
            name="password"
            type="password"
            autoComplete={signup ? "new-password" : "current-password"}
            required
            minLength={signup ? 8 : 1}
            maxLength={128}
            disabled={pending}
          />
        </label>
        <Button type="submit" disabled={pending} className="w-full">
          {pending ? "Please wait…" : signup ? "Create account" : "Sign in"}
        </Button>
        <Button
          type="submit"
          value="resend"
          formNoValidate
          disabled={pending}
          variant="link"
          className="w-full"
        >
          Resend confirmation email
        </Button>
      </form>
      <Button
        type="button"
        variant="outline"
        disabled={pending}
        className="w-full"
        onClick={() => {
          setSignup(!signup);
          setError("");
        }}
      >
        {signup ? "Already have an account? Sign in" : "New here? Create an account"}
      </Button>
      <div className="flex justify-between text-sm text-brand">
        <Link href="/discover">Browse places</Link>
        <Link href="/auth/account">Account &amp; sign out</Link>
      </div>
    </div>
  );
}
