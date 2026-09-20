"use client";

import type { MemoryMomentDto } from "../../../shared/memories-contract";
import { AccountRequired } from "@/components/account/account-state";
import { ResourceState } from "@/components/catalog/resource-state";
import { useMemoryPage } from "./memory-state";
import { MemoriesLinks, MemoryPager } from "./memory-ui";
import { MomentGroups } from "./moment-card";
import { ContributionForm } from "./contribution-form";
import { InvitationInbox } from "./invitation-inbox";

export function MomentsList() {
  return (
    <AccountRequired>
      <Moments />
    </AccountRequired>
  );
}
function Moments() {
  const resource = useMemoryPage<MemoryMomentDto>("/api/moments");
  return (
    <div className="space-y-6">
      <MemoriesLinks />
      <h1 className="font-serif text-3xl font-bold text-brand">Your selected moments</h1>
      <p className="text-sm text-text-secondary">
        Moments you authored, kept privately or explicitly shared. Your original collection stays
        separate.
      </p>
      <ResourceState {...resource} label="Loading your moments…" />
      {!resource.loading && resource.data?.items.length === 0 && (
        <p className="text-sm">
          No selected moments yet. Choose one of your visits below, or import a few photos.
        </p>
      )}
      {!resource.loading && !resource.error && resource.data && (
        <MomentGroups moments={resource.data.items} />
      )}
      <MemoryPager {...resource} />
      <ContributionForm />
      <InvitationInbox />
    </div>
  );
}
