"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import type { MemoryMomentDto } from "../../../shared/memories-contract";
import { AccountRequired } from "@/components/account/account-state";
import { useAccount } from "@/components/account/account-provider";
import { ResourceState } from "@/components/catalog/resource-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useMemoryAction, useMemoryResource } from "./memory-state";
import { ActionNotice, ConfirmDelete, MemorySection, fieldClass } from "./memory-ui";
import { MemoryPhoto } from "./memory-photo";
import { AuthorName } from "./author-name";
import { MomentTags } from "./moment-tags";
import { StopEditor } from "./stop-editor";

export function MomentDetail({ momentId }: { momentId: string }) {
  return (
    <AccountRequired>
      <Moment momentId={momentId} />
    </AccountRequired>
  );
}
function Moment({ momentId }: { momentId: string }) {
  const resource = useMemoryResource<MemoryMomentDto>(`/api/moments/${momentId}`);
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Link
        href="/moments"
        className="inline-flex min-h-11 items-center text-sm text-brand underline"
      >
        Your moments & invitations
      </Link>
      <h1 className="font-serif text-3xl font-bold text-brand">A moment, shared by choice</h1>
      <Button variant="outline" disabled={resource.loading} onClick={resource.retry}>
        Refresh moment
      </Button>
      <ResourceState {...resource} label="Checking moment access…" />
      {!resource.error && resource.data && (
        <MomentContent
          key={`${resource.data.id}:${resource.data.version}`}
          moment={resource.data}
        />
      )}
    </div>
  );
}
function MomentContent({ moment }: { moment: MemoryMomentDto }) {
  const { data, userId } = useAccount();
  const [note, setNote] = useState(moment.note ?? "");
  const [groupKey, setGroupKey] = useState(moment.groupKey ?? "");
  const action = useMemoryAction();
  const router = useRouter();
  const own = moment.authorId === userId;
  const stop = moment.confirmedStop;
  const place = data?.places.find((place) => place.id === stop?.placeId);
  const path = `/api/moments/${moment.id}`;
  return (
    <>
      <MemoryPhoto path={`${path}/photo`} alt="The photo selected for this moment" />
      <p className="text-sm">
        Contributed by <AuthorName userId={moment.authorId} />
      </p>
      <p className="text-sm">
        {stop
          ? `${place?.name ?? "Confirmed stop"} · ${new Date(stop.capturedAt).toLocaleString(
              undefined,
              { timeZone: stop.timezone },
            )} (${stop.timezone})`
          : "Place and date unresolved. This is not evidence of a recorded visit."}
      </p>
      {moment.note && <p className="whitespace-pre-wrap font-serif text-lg">{moment.note}</p>}
      <p className="text-xs text-text-secondary">
        Access to this moment does not grant access to its source visit or to other album moments.
      </p>
      {own && (
        <MemorySection title="Edit your contribution">
          <label className="block space-y-1 text-sm">
            Words visible with this moment
            <textarea
              className={`${fieldClass} min-h-28 py-3`}
              maxLength={2000}
              value={note}
              onChange={(event) => setNote(event.target.value)}
            />
          </label>
          <label className="block space-y-1 text-sm">
            Group label
            <Input
              maxLength={80}
              value={groupKey}
              onChange={(event) => setGroupKey(event.target.value)}
            />
          </label>
          <p className="text-xs text-text-secondary">
            The same label merges moments at the same confirmed place and local day. Different
            labels split them. Unresolved moments remain separate.
          </p>
          <Button
            disabled={action.busy}
            onClick={() =>
              void action.run(
                path,
                {
                  method: "PATCH",
                  body: {
                    expectedVersion: moment.version,
                    note: note.trim() || null,
                    groupKey: groupKey.trim() || null,
                  },
                },
                "Contribution updated.",
              )
            }
          >
            Save contribution
          </Button>
          {moment.source.kind === "import_item" && (
            <details>
              <summary className="min-h-11 cursor-pointer py-3 text-sm text-brand">
                Correct confirmed stop
              </summary>
              <StopEditor
                value={stop}
                busy={action.busy}
                onSave={async (confirmedStop) => {
                  await action.run(path, {
                    method: "PATCH",
                    body: { expectedVersion: moment.version, confirmedStop },
                  });
                }}
              />
            </details>
          )}
          {moment.source.kind === "edition" && (
            <Link
              href={`/editions/${moment.source.id}`}
              className="inline-flex min-h-11 items-center text-sm text-brand underline"
            >
              View your original personal visit
            </Link>
          )}
          <ActionNotice {...action} />
          <ConfirmDelete
            label="Withdraw moment"
            busy={action.busy}
            description="Ends this moment's album, tag and collage access. Your source media and independent personal visit remain. Previously downloaded copies cannot be recalled."
            onConfirm={async () => {
              const deleted = await action.run(path, {
                method: "DELETE",
                body: { expectedVersion: moment.version },
              });
              if (deleted) router.push("/moments");
            }}
          />
        </MemorySection>
      )}
      <MomentTags moment={moment} />
    </>
  );
}
