"use client";

import { useState } from "react";
import type { UserDetailDto } from "../../../shared/api-contract";
import { ErrorNotice } from "@/components/account/account-state";
import { Button } from "@/components/ui/button";
import { useWrite } from "@/lib/web/use-write";
import { notifyMemoriesChanged } from "@/components/memories/memory-state";

export function FriendActions({
  userId,
  relationship,
  refresh,
}: {
  userId: string;
  relationship: UserDetailDto["relationship"];
  refresh: () => void;
}) {
  const [confirm, setConfirm] = useState(false);
  const operation = useWrite(() => {
    notifyMemoriesChanged();
    refresh();
  });
  if (relationship === "self") return null;
  const path = `/api/friends/${encodeURIComponent(userId)}`;
  return (
    <div className="space-y-2">
      <ErrorNotice message={operation.error} />
      {operation.message && (
        <p role="status" className="text-xs">
          {operation.message}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-text-secondary">
          {relationship === "accepted"
            ? "Friends"
            : relationship === "incoming"
              ? "Wants to be friends"
              : relationship === "outgoing"
                ? "Request sent"
                : "Not connected"}
        </span>
        {(relationship === "none" || relationship === "incoming") && (
          <Button
            type="button"
            disabled={operation.busy}
            onClick={() =>
              void operation.write(
                path,
                { method: "PUT", body: {} },
                relationship === "incoming" ? "Friend request accepted." : "Friend request sent.",
              )
            }
          >
            {operation.busy
              ? "Saving…"
              : relationship === "incoming"
                ? "Accept request"
                : "Add friend"}
          </Button>
        )}
        {relationship !== "none" && (
          <Button
            type="button"
            variant="outline"
            disabled={operation.busy}
            onClick={() => setConfirm(!confirm)}
          >
            {relationship === "accepted"
              ? "Remove friend"
              : relationship === "incoming"
                ? "Decline"
                : "Cancel request"}
          </Button>
        )}
      </div>
      {confirm && (
        <div className="space-y-2 rounded-xl border border-border p-3">
          <p className="text-sm">
            {relationship === "accepted"
              ? "Remove this friend? Friends-only activity will no longer be shared."
              : "Remove this pending request?"}
          </p>
          <Button
            type="button"
            variant="destructive"
            disabled={operation.busy}
            onClick={() =>
              void operation
                .write(path, { method: "DELETE" }, "Connection removed.")
                .then((saved) => {
                  if (saved) setConfirm(false);
                })
            }
          >
            Confirm removal
          </Button>
          <Button type="button" variant="ghost" onClick={() => setConfirm(false)}>
            Keep connection
          </Button>
        </div>
      )}
    </div>
  );
}
