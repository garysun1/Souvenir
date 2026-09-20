"use client";

import { useState } from "react";
import type { MemoryMomentDto, MomentTagDto } from "../../../shared/memories-contract";
import { useAccount } from "@/components/account/account-provider";
import { ResourceState } from "@/components/catalog/resource-state";
import { Button } from "@/components/ui/button";
import { useMemoryAction, useMemoryPage } from "./memory-state";
import { ActionNotice, MemoryPager, MemorySection } from "./memory-ui";
import { FriendPicker } from "./friend-picker";
import { AuthorName } from "./author-name";

export function MomentTags({ moment }: { moment: MemoryMomentDto }) {
  const { userId } = useAccount();
  const tags = useMemoryPage<MomentTagDto>(`/api/moments/${moment.id}/tags`);
  const action = useMemoryAction();
  const [selected, setSelected] = useState<string[]>([]);
  const [confirm, setConfirm] = useState(false);
  const [sending, setSending] = useState(false);
  const owner = moment.authorId === userId;
  async function send() {
    if (sending || !confirm) return;
    setSending(true);
    try {
      for (const userId of selected) {
        const result = await action.post<MomentTagDto>(`/api/moments/${moment.id}/tags`, {
          userId,
          confirmShare: true,
        });
        if (!result) return;
        setSelected((ids) => ids.filter((id) => id !== userId));
      }
      setConfirm(false);
    } finally {
      setSending(false);
    }
  }
  return (
    <MemorySection title={owner ? "People tagged in this moment" : "Your tag association"}>
      <p className="text-sm text-text-secondary">
        A pending tag allows its recipient to preview this one moment and photo. Declining or
        removing the tag ends tag-derived access. It never grants album membership.
      </p>
      <ResourceState {...tags} label="Loading tags you can access…" />
      <ActionNotice {...action} />
      {!tags.loading && tags.data?.items.length === 0 && (
        <p className="text-sm">No visible tag associations.</p>
      )}
      {tags.data?.items.map((tag) => (
        <div key={tag.id} className="space-y-2 rounded-xl border border-border p-3 text-sm">
          <p>
            <AuthorName userId={tag.userId} /> · {tag.state}
          </p>
          <div className="flex flex-wrap gap-2">
            {tag.userId === userId &&
              tag.state === "pending" &&
              (["accepted", "declined"] as const).map((state) => (
                <Button
                  key={state}
                  disabled={action.busy || sending}
                  variant={state === "accepted" ? "default" : "outline"}
                  onClick={() =>
                    void action.run(
                      `/api/moments/${moment.id}/tags/${tag.id}`,
                      {
                        method: "PATCH",
                        body: { expectedVersion: tag.version, state },
                      },
                      `Tag ${state}.`,
                    )
                  }
                >
                  {state === "accepted" ? "Accept tag" : "Decline tag"}
                </Button>
              ))}
            {(owner || tag.userId === userId) &&
              (tag.state === "pending" || tag.state === "accepted") && (
                <Button
                  disabled={action.busy || sending}
                  variant="outline"
                  onClick={() =>
                    void action.run(
                      `/api/moments/${moment.id}/tags/${tag.id}`,
                      {
                        method: "PATCH",
                        body: { expectedVersion: tag.version, state: "removed" },
                      },
                      "Tag removed. New tag-derived reads are revoked.",
                    )
                  }
                >
                  Remove tag
                </Button>
              )}
          </div>
        </div>
      ))}
      <MemoryPager {...tags} />
      {owner && (
        <details>
          <summary className="min-h-11 cursor-pointer py-3 font-semibold text-brand">
            Share this moment with a friend
          </summary>
          <FriendPicker
            selected={selected}
            disabled={sending}
            onChange={(ids) => {
              setSelected(ids);
              setConfirm(false);
            }}
          />
          <label className="flex min-h-11 items-start gap-3 text-sm">
            <input
              type="checkbox"
              className="mt-1"
              checked={confirm}
              disabled={sending}
              onChange={(event) => setConfirm(event.target.checked)}
            />
            I approve sharing this displayed photo, note and confirmed stop with the selected
            accounts, including before they accept.
          </label>
          <Button disabled={sending || !selected.length || !confirm} onClick={() => void send()}>
            {sending ? "Sending…" : "Send tag invitations"}
          </Button>
        </details>
      )}
    </MemorySection>
  );
}
