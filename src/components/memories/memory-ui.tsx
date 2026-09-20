"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { ErrorNotice } from "@/components/account/account-state";

export const fieldClass =
  "min-h-11 w-full rounded-xl border border-border bg-background px-3 text-sm";
export const sectionClass = "space-y-4 rounded-2xl border border-border bg-background p-4 sm:p-5";

export function MemorySection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className={sectionClass}>
      <h2 className="font-serif text-xl font-bold text-brand">{title}</h2>
      {children}
    </section>
  );
}

export function ActionNotice({
  error,
  message,
  busy,
}: {
  error: string | null;
  message: string | null;
  busy: boolean;
}) {
  return (
    <>
      <ErrorNotice message={error} />
      {(busy || message) && (
        <p role="status" className="text-sm text-text-secondary">
          {busy ? "Saving…" : message}
        </p>
      )}
    </>
  );
}

export function MemoryPager({
  previous,
  next,
  loading,
}: {
  previous?: () => void;
  next?: () => void;
  loading: boolean;
}) {
  return previous || next ? (
    <nav aria-label="Pages" className="flex gap-2">
      <Button variant="outline" disabled={!previous || loading} onClick={previous}>
        Previous
      </Button>
      <Button variant="outline" disabled={!next || loading} onClick={next}>
        Next
      </Button>
    </nav>
  ) : null;
}

export function MemoriesLinks() {
  return (
    <nav aria-label="Memories" className="flex flex-wrap gap-2">
      {[
        ["/collection/imports", "Import memories"],
        ["/albums", "Trip albums & invitations"],
        ["/moments", "Your shared moments"],
        ["/profile#taste", "Your taste"],
      ].map(([href, label]) => (
        <Link
          key={href}
          href={href}
          className="inline-flex min-h-11 items-center rounded-full border border-border px-4 text-sm font-semibold text-brand hover:bg-surface-muted"
        >
          {label}
        </Link>
      ))}
    </nav>
  );
}

export function ConfirmDelete({
  label,
  description,
  busy,
  onConfirm,
}: {
  label: string;
  description: string;
  busy: boolean;
  onConfirm: () => Promise<void>;
}) {
  return (
    <details className="rounded-xl border border-border p-3">
      <summary className="min-h-11 cursor-pointer py-3 text-sm font-medium text-destructive">
        {label}
      </summary>
      <p className="mb-3 text-sm">{description}</p>
      <Button variant="destructive" disabled={busy} onClick={() => void onConfirm()}>
        Confirm {label.toLowerCase()}
      </Button>
    </details>
  );
}
