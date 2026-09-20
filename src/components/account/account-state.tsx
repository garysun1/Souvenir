"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { useAccount } from "./account-provider";

export function ErrorNotice({ message }: { message: string | null }) {
  return message ? (
    <p role="alert" className="rounded-xl border border-negative bg-negative/15 p-3 text-sm">
      {message}
    </p>
  ) : null;
}

export function AccountRequired({ children }: { children: ReactNode }) {
  const { userId, data, loading, error, refresh } = useAccount();
  if (loading && !data)
    return (
      <p role="status" className="py-8 text-sm text-text-secondary">
        Loading your account…
      </p>
    );
  if (!userId) {
    return (
      <div className="space-y-3">
        <ErrorNotice message={error} />
        <EmptyState
          title="Your memories, on every device"
          description="Sign in with the same email you use in the mobile app."
          action={
            <Link
              className="inline-flex min-h-11 items-center rounded-full bg-brand px-5 text-sm font-semibold text-white"
              href="/login"
            >
              Sign in or create an account
            </Link>
          }
        />
      </div>
    );
  }
  if (!data) {
    return (
      <div className="space-y-3">
        <ErrorNotice message={error ?? "Could not load your collection."} />
        <div className="flex gap-3">
          <Button onClick={() => void refresh()}>Retry</Button>
          <Link className="p-3 text-sm underline" href="/login">
            Sign in again
          </Link>
        </div>
      </div>
    );
  }
  return (
    <>
      <ErrorNotice
        message={error ? `Refresh failed: ${error} Showing the last loaded account data.` : null}
      />
      {children}
    </>
  );
}

export function RefreshAccount() {
  const { loading, refresh } = useAccount();
  return (
    <Button variant="outline" disabled={loading} onClick={() => void refresh()}>
      {loading ? "Refreshing…" : "Refresh"}
    </Button>
  );
}
