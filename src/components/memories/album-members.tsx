"use client";

import { useState } from "react";
import type { AlbumMemberDto, TripAlbumDto } from "../../../shared/memories-contract";
import { useAccount } from "@/components/account/account-provider";
import { Button } from "@/components/ui/button";
import { ResourceState } from "@/components/catalog/resource-state";
import { useMemoryAction, useMemoryPage } from "./memory-state";
import { ActionNotice, ConfirmDelete, MemoryPager, MemorySection } from "./memory-ui";
import { FriendPicker } from "./friend-picker";
import { AuthorName } from "./author-name";

export function AlbumMembers({ album }: { album: TripAlbumDto }) {
  const { userId } = useAccount();
  const members = useMemoryPage<AlbumMemberDto>(`/api/albums/${album.id}/members`);
  const action = useMemoryAction();
  const [friends, setFriends] = useState<string[]>([]);
  const [confirm, setConfirm] = useState(false);
  const [sending, setSending] = useState(false);
  async function invite() {
    if (sending || !confirm) return;
    setSending(true);
    try {
      for (const friend of friends) {
        const member = await action.post<AlbumMemberDto>(`/api/albums/${album.id}/members`, {
          userId: friend,
        });
        if (!member) return;
        setFriends((value) => value.filter((id) => id !== friend));
      }
      setConfirm(false);
    } finally {
      setSending(false);
    }
  }
  return (
    <MemorySection title="People in this album">
      <p className="text-sm">
        Owner: <AuthorName userId={album.ownerId} />
      </p>
      <ResourceState {...members} label="Loading album memberships…" />
      <ActionNotice {...action} />
      {members.data?.items.map((member) => (
        <div key={member.id} className="space-y-2 rounded-xl border border-border p-3 text-sm">
          <p>
            <AuthorName userId={member.userId} /> · {member.state}
          </p>
          {(album.role === "owner" || member.userId === userId) &&
            (member.state === "accepted" || member.state === "pending") && (
              <ConfirmDelete
                label={member.userId === userId ? "Leave album" : "Remove member"}
                busy={action.busy || sending}
                description="Ends this membership and hides this person's contributions from the album until they explicitly rejoin. Independent tags remain separate."
                onConfirm={async () => {
                  await action.run(`/api/albums/${album.id}/members/${member.id}`, {
                    method: "PATCH",
                    body: { expectedVersion: member.version, state: "removed" },
                  });
                }}
              />
            )}
        </div>
      ))}
      <MemoryPager {...members} />
      {album.role === "owner" && (
        <details>
          <summary className="min-h-11 cursor-pointer py-3 font-semibold text-brand">
            Invite accepted friends
          </summary>
          <FriendPicker
            selected={friends}
            disabled={sending}
            onChange={(ids) => {
              setFriends(ids);
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
            Send album invitations to these accounts. Once accepted, members can see the
            album&apos;s contributions.
          </label>
          <Button disabled={sending || !friends.length || !confirm} onClick={() => void invite()}>
            Invite {friends.length || ""} {friends.length === 1 ? "friend" : "friends"}
          </Button>
        </details>
      )}
    </MemorySection>
  );
}
