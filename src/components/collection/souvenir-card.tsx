"use client";

import Link from "next/link";
import type { CollectionEntryDto } from "../../../shared/api-contract";
import { SignedPhoto } from "./signed-photo";

export function SouvenirCard({
  edition,
  outingTitle,
}: {
  edition: CollectionEntryDto;
  outingTitle?: string;
}) {
  return (
    <article className="overflow-hidden rounded-xl border border-border bg-white">
      {edition.photo ? (
        <SignedPhoto
          editionId={edition.id}
          photo={edition.photo}
          alt={`Your memory of ${edition.place.name}`}
          className="aspect-[4/3] w-full object-cover"
        />
      ) : (
        <div className="flex aspect-[4/3] flex-col items-center justify-center gap-3 bg-surface-muted p-6 text-center text-brand">
          <span className="font-serif text-3xl">souvenir</span>
          <p className="text-sm">A visit worth keeping · No personal photo</p>
        </div>
      )}
      <div className="space-y-3 p-4">
        <p className="text-xs uppercase tracking-widest text-text-secondary">
          {edition.visitSequence > 1 ? "Return visit" : "First visit"} · Edition{" "}
          {edition.visitSequence}
        </p>
        <h2 className="font-serif text-xl font-bold text-brand">
          <Link href={`/editions/${edition.id}`} className="inline-block py-1">
            {edition.place.name}
          </Link>
        </h2>
        <time dateTime={edition.capturedAt} className="block text-sm text-text-secondary">
          {new Date(edition.capturedAt).toLocaleDateString(undefined, {
            timeZone: edition.timezone,
            month: "long",
            day: "numeric",
            year: "numeric",
          })}
        </time>
        {edition.note && <p className="line-clamp-3 whitespace-pre-wrap text-sm">{edition.note}</p>}
        {edition.companions.length > 0 && (
          <p className="text-xs text-text-secondary">With {edition.companions.join(", ")}</p>
        )}
        <p className="text-xs text-text-secondary">
          Visit:{" "}
          {edition.visibility === "friends"
            ? "Friends"
            : edition.visibility === "public"
              ? "Public"
              : "Only me"}{" "}
          · Photo and moment: Only me
        </p>
        {outingTitle && (
          <Link
            href={`/collection?outingId=${edition.outingId}`}
            className="block min-h-11 py-3 text-sm text-brand underline"
          >
            {outingTitle}
          </Link>
        )}
        <Link
          href={`/editions/${edition.id}`}
          className="inline-flex min-h-11 items-center text-sm text-brand underline"
        >
          Open your souvenir
        </Link>
      </div>
    </article>
  );
}
