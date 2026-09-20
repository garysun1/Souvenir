"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { ImportBatchDto } from "../../../shared/memories-contract";
import { AccountRequired } from "@/components/account/account-state";
import { ResourceState } from "@/components/catalog/resource-state";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useMemoryAction, useMemoryPage } from "./memory-state";
import { ActionNotice, MemoryPager, MemorySection } from "./memory-ui";

export function ImportList() {
  return (
    <AccountRequired>
      <ImportBatches />
    </AccountRequired>
  );
}
function ImportBatches() {
  const batches = useMemoryPage<ImportBatchDto>("/api/imports");
  const [title, setTitle] = useState("");
  const action = useMemoryAction();
  const router = useRouter();
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="font-serif text-3xl font-bold text-brand">Import memories</h1>
        <p className="mt-2 text-sm text-text-secondary">
          Your selected photos, organized on your terms. Up to 20 JPEG, PNG or WebP images per
          batch, 10 MiB each. No library-wide access.
        </p>
      </div>
      <MemorySection title="Start a private batch">
        <form
          className="space-y-3"
          onSubmit={async (event) => {
            event.preventDefault();
            const batch = await action.post<ImportBatchDto>("/api/imports", {
              title: title.trim(),
            });
            if (batch) router.push(`/collection/imports/${batch.id}`);
          }}
        >
          <label className="block space-y-1 text-sm">
            A name for these memories
            <Input
              required
              maxLength={120}
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="A weekend by the coast"
            />
          </label>
          <ActionNotice {...action} />
          <Button type="submit" disabled={action.busy || !title.trim()}>
            Create batch & choose photos
          </Button>
        </form>
      </MemorySection>
      <MemorySection title="Resume an import">
        <ResourceState {...batches} label="Loading your imports…" />
        {batches.data?.items.length === 0 && (
          <p className="text-sm text-text-secondary">
            No imports yet. Start with a few meaningful photos. Nothing is sent for AI analysis
            until you choose it.
          </p>
        )}
        <ul className="divide-y divide-divider">
          {batches.data?.items.map((batch) => (
            <li key={batch.id}>
              <Link
                className="flex min-h-16 items-center justify-between gap-3 py-3 text-brand"
                href={`/collection/imports/${batch.id}`}
              >
                <span className="font-serif font-bold">{batch.title}</span>
                <span className="text-xs">
                  {batch.items.length} photos · {batch.state}
                </span>
              </Link>
            </li>
          ))}
        </ul>
        <MemoryPager {...batches} />
      </MemorySection>
    </div>
  );
}
