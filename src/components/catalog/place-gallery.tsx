"use client";

import Image from "next/image";
import { useState, type FormEvent } from "react";
import type { PlaceDetailDto, PlaceImagePromote } from "../../../shared/api-contract";
import { useAccount } from "@/components/account/account-provider";
import { ErrorNotice } from "@/components/account/account-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { safeExternalUrl } from "@/lib/web/worldwide";
import { useWrite } from "@/lib/web/use-write";
import { SignedPhoto } from "@/components/collection/signed-photo";

export function SourceLink({
  url,
  children,
}: {
  url: string | null | undefined;
  children: React.ReactNode;
}) {
  const href = safeExternalUrl(url);
  return href ? (
    <a href={href} target="_blank" rel="noreferrer" className="text-brand underline">
      {children}
    </a>
  ) : (
    <span>{children}</span>
  );
}

export function PlaceGallery({ place, refresh }: { place: PlaceDetailDto; refresh: () => void }) {
  const { data } = useAccount();
  const editions =
    data?.collection.filter((edition) => edition.placeId === place.id && edition.photo) ?? [];
  const [deleting, setDeleting] = useState<string | null>(null);
  const [editionId, setEditionId] = useState("");
  const edition = editions.find((item) => item.id === editionId);
  const operation = useWrite(refresh);
  async function promote(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const fields = new FormData(event.currentTarget);
    if (fields.get("confirmPublic") !== "on" || fields.get("rightsConfirmed") !== "on") return;
    const body: Omit<PlaceImagePromote, "requestId"> = {
      editionId: String(fields.get("editionId")),
      confirmPublic: true,
      rightsConfirmed: true,
      attribution: String(fields.get("attribution")).trim(),
      license: String(fields.get("license")) as PlaceImagePromote["license"],
    };
    await operation.write(
      `/api/places/${encodeURIComponent(place.slug)}/images`,
      { method: "POST", body },
      "Your selected photo is now a public licensed contribution.",
    );
  }
  return (
    <section className="space-y-4">
      <h2 className="font-serif text-xl font-bold text-brand">Gallery & provenance</h2>
      <ErrorNotice message={operation.error} />
      {operation.message && (
        <p role="status" className="text-sm">
          {operation.message}
        </p>
      )}
      {!place.images.length && (
        <p className="rounded-xl bg-surface-muted p-6 text-sm text-text-secondary">
          No licensed place photos yet.
        </p>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        {place.images.map((image) => (
          <figure key={image.id} className="space-y-2">
            {safeExternalUrl(image.url) && (
              <Image
                src={image.url}
                width={image.width ?? 800}
                height={image.height ?? 600}
                unoptimized
                alt={`${place.name} — ${image.attribution}`}
                className="h-52 w-full rounded-xl object-cover"
              />
            )}
            <figcaption className="space-y-1 text-xs text-text-secondary">
              <p>
                {image.attribution} ·{" "}
                <SourceLink url={image.licenseUrl}>{image.license}</SourceLink>
              </p>
              <p>
                <SourceLink url={image.sourcePageUrl}>Original source</SourceLink> ·{" "}
                {image.provider}
              </p>
              {image.expiresAt && (
                <p>Available until {new Date(image.expiresAt).toLocaleString()}</p>
              )}
              {image.provider === "user" && (
                <Button
                  variant="ghost"
                  type="button"
                  disabled={operation.busy}
                  onClick={() => setDeleting(image.id)}
                >
                  Remove my contribution
                </Button>
              )}
              {deleting === image.id && (
                <div className="space-y-2">
                  <p>
                    Only the contributor can remove this gallery photo. The private original stays
                    in their collection.
                  </p>
                  <Button
                    type="button"
                    variant="destructive"
                    disabled={operation.busy}
                    onClick={() =>
                      void operation
                        .write(
                          `/api/places/${encodeURIComponent(place.slug)}/images/${image.id}`,
                          { method: "DELETE" },
                          "Public contribution removed.",
                        )
                        .then((saved) => {
                          if (saved) setDeleting(null);
                        })
                    }
                  >
                    Confirm removal
                  </Button>
                  <Button type="button" variant="ghost" onClick={() => setDeleting(null)}>
                    Cancel
                  </Button>
                </div>
              )}
            </figcaption>
          </figure>
        ))}
      </div>
      <div className="space-y-3">
        <h3 className="font-serif font-bold text-brand">Sources</h3>
        {!place.sources.length && (
          <p className="text-sm">No documented provider source available.</p>
        )}
        {place.sources.map((source) => (
          <div
            id={`source-${source.id}`}
            key={source.id}
            className="rounded-xl border border-border p-3 text-xs"
          >
            <p>
              <SourceLink url={source.sourceUrl}>
                {source.provider} · {source.providerId}
              </SourceLink>{" "}
              · {source.status}
            </p>
            <p>
              Fetched {new Date(source.fetchedAt).toLocaleString()}
              {source.expiresAt ? ` · expires ${new Date(source.expiresAt).toLocaleString()}` : ""}
            </p>
            <p>
              {source.attribution ?? "Attribution not supplied"} ·{" "}
              <SourceLink url={source.licenseUrl}>
                {source.license ?? "License not supplied"}
              </SourceLink>
            </p>
          </div>
        ))}
      </div>
      {place.visibility === "public" && editions.length > 0 && (
        <form onSubmit={promote} className="space-y-3 rounded-xl border border-border p-4">
          <h3 className="font-serif font-bold text-brand">Contribute a photo</h3>
          <fieldset disabled={operation.busy} className="space-y-3">
            <label className="block text-sm">
              Choose your capture
              <select
                name="editionId"
                required
                value={editionId}
                onChange={(event) => setEditionId(event.target.value)}
                className="min-h-11 w-full rounded-xl border border-border px-3"
              >
                <option value="" disabled>
                  Select a photo explicitly
                </option>
                {editions.map((edition) => (
                  <option key={edition.id} value={edition.id}>
                    Edition {edition.visitSequence} ·{" "}
                    {new Date(edition.capturedAt).toLocaleDateString()}
                  </option>
                ))}
              </select>
            </label>
            {edition?.photo && (
              <SignedPhoto
                key={edition.id}
                editionId={edition.id}
                photo={edition.photo}
                alt="Your selected contribution"
              />
            )}
            <label className="block text-sm">
              Attribution
              <Input name="attribution" required maxLength={1000} />
            </label>
            <label className="block text-sm">
              License
              <select
                name="license"
                className="min-h-11 w-full rounded-xl border border-border px-3"
                defaultValue="CC-BY-4.0"
              >
                <option>CC-BY-4.0</option>
                <option>CC-BY-SA-4.0</option>
                <option>CC0-1.0</option>
              </select>
            </label>
            <label key={`publish:${editionId}`} className="flex gap-2 text-sm">
              <input required type="checkbox" name="confirmPublic" />I choose to publish a separate
              copy of this photo in the public place gallery.
            </label>
            <label key={`rights:${editionId}`} className="flex gap-2 text-sm">
              <input required type="checkbox" name="rightsConfirmed" />I own the rights and grant
              the selected license.
            </label>
            <p className="text-xs text-text-secondary">
              The original stays private. Removing a contribution cannot recall copies already
              shared under its license.
            </p>
            <Button type="submit">
              {operation.busy ? "Publishing…" : "Publish selected photo"}
            </Button>
          </fieldset>
        </form>
      )}
    </section>
  );
}
