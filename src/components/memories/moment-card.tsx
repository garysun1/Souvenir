"use client";

import Link from "next/link";
import type { MemoryMomentDto } from "../../../shared/memories-contract";
import { useAccount } from "@/components/account/account-provider";
import { useMemoryAction } from "./memory-state";
import { ActionNotice, ConfirmDelete } from "./memory-ui";
import { MemoryPhoto } from "./memory-photo";
import { AuthorName } from "./author-name";
import { momentGroups } from "./memory-model";

export function MomentCard({ moment }: { moment: MemoryMomentDto }) {
  const { userId } = useAccount();
  const action = useMemoryAction();
  return (
    <article className="space-y-3 rounded-2xl border border-border p-4">
      <MemoryPhoto
        path={`/api/moments/${moment.id}/photo`}
        alt="Photo explicitly shared in this moment"
      />
      <p className="text-sm">
        Contributed by <AuthorName userId={moment.authorId} />
      </p>
      {moment.note && <p className="whitespace-pre-wrap text-sm">{moment.note}</p>}
      <Link
        href={`/moments/${moment.id}`}
        className="inline-flex min-h-11 items-center text-sm font-semibold text-brand underline"
      >
        {userId === moment.authorId ? "Edit moment & manage tags" : "View shared moment"}
      </Link>
      {userId === moment.authorId && (
        <>
          <ActionNotice {...action} />
          <ConfirmDelete
            label="Withdraw moment"
            busy={action.busy}
            description="Removes this moment and its tags from sharing. Your original personal visit or imported photo remains. Downloaded copies cannot be recalled."
            onConfirm={async () => {
              await action.run(
                `/api/moments/${moment.id}`,
                {
                  method: "DELETE",
                  body: { expectedVersion: moment.version },
                },
                "Moment withdrawn.",
              );
            }}
          />
        </>
      )}
    </article>
  );
}

export function MomentGroups({ moments }: { moments: MemoryMomentDto[] }) {
  const { data } = useAccount();
  return (
    <div className="space-y-6">
      {momentGroups(moments).map((group) => (
        <section key={group.items[0].id} className="space-y-3">
          <h3 className="font-serif text-lg font-bold text-brand">
            {group.day} ·{" "}
            {data?.places.find((place) => place.id === group.placeId)?.name ??
              (group.placeId ? "Confirmed stop" : "Place not confirmed")}
            {group.groupKey ? ` · ${group.groupKey}` : ""}
          </h3>
          {group.placeId && (
            <Link
              href={`/plan?placeIds=${group.placeId}`}
              className="inline-flex min-h-11 items-center text-sm text-brand underline"
            >
              Plan another visit
            </Link>
          )}
          <div className="grid gap-4 md:grid-cols-2">
            {group.items.map((moment) => (
              <MomentCard key={`${moment.id}:${moment.version}`} moment={moment} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
