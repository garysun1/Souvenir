"use client";

import { useState, type FormEvent } from "react";
import type {
  PlaceDetailDto,
  PlaceNoteDto,
  PlaceNoteKind,
  PlaceCorrection,
  Visibility,
} from "../../../shared/api-contract";
import { useAccount } from "@/components/account/account-provider";
import { ErrorNotice } from "@/components/account/account-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useWrite } from "@/lib/web/use-write";

export function VisibilitySelect({
  value,
  onChange,
  label = "Who can see this?",
}: {
  value: Visibility;
  onChange: (value: Visibility) => void;
  label?: string;
}) {
  return (
    <label className="block space-y-1 text-sm">
      {label}
      <select
        value={value}
        onChange={(event) => onChange(event.target.value as Visibility)}
        className="min-h-11 w-full rounded-xl border border-border px-3"
      >
        <option value="private">Only me</option>
        <option value="friends">Accepted friends</option>
        <option value="public">Public</option>
      </select>
    </label>
  );
}

function WriteStatus({ error, message }: { error: string | null; message: string | null }) {
  return (
    <>
      <ErrorNotice message={error} />
      {message && (
        <p role="status" className="text-sm">
          {message}
        </p>
      )}
    </>
  );
}

function NoteEditor({
  slug,
  note,
  refresh,
}: {
  slug: string;
  note?: PlaceNoteDto;
  refresh: () => void;
}) {
  const [body, setBody] = useState(note?.body ?? "");
  const [kind, setKind] = useState<PlaceNoteKind>(note?.kind ?? "tip");
  const [visibility, setVisibility] = useState<Visibility>(note?.visibility ?? "private");
  const [deleting, setDeleting] = useState(false);
  const operation = useWrite(refresh);
  const path = `/api/places/${encodeURIComponent(slug)}/notes${note ? `/${note.id}` : ""}`;
  async function save(event: FormEvent) {
    event.preventDefault();
    if (
      await operation.write(
        path,
        { method: note ? "PATCH" : "POST", body: { body: body.trim(), kind, visibility } },
        "Note saved.",
      )
    ) {
      if (!note) setBody("");
    }
  }
  return (
    <form onSubmit={save} className="space-y-3 rounded-xl border border-border p-4">
      <h3 className="font-serif font-bold text-brand">
        {note ? "Edit your note" : "Add a separate place note"}
      </h3>
      <WriteStatus {...operation} />
      <fieldset disabled={operation.busy} className="space-y-3">
        <label className="block text-sm">
          Kind
          <select
            className="min-h-11 w-full rounded-xl border border-border px-3"
            value={kind}
            onChange={(event) => setKind(event.target.value as PlaceNoteKind)}
          >
            {["tip", "warning", "hours", "access", "story"].map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm">
          Note
          <textarea
            required
            maxLength={600}
            value={body}
            onChange={(event) => setBody(event.target.value)}
            className="min-h-24 w-full rounded-xl border border-border p-3"
          />
        </label>
        <VisibilitySelect value={visibility} onChange={setVisibility} />
        <p className="text-xs text-text-secondary">
          Your private tip stays separate. Sharing this new note is your choice.
        </p>
        <Button type="submit" disabled={!body.trim()}>
          {operation.busy ? "Saving…" : "Save note"}
        </Button>
        {note && (
          <Button type="button" variant="ghost" onClick={() => setDeleting(!deleting)}>
            Delete note
          </Button>
        )}
        {deleting && (
          <div className="space-y-2">
            <p className="text-sm">Delete this note and its activity?</p>
            <Button
              type="button"
              variant="destructive"
              onClick={() => void operation.write(path, { method: "DELETE" }, "Note deleted.")}
            >
              Confirm deletion
            </Button>
          </div>
        )}
      </fieldset>
    </form>
  );
}

function TagsEditor({ place, refresh }: { place: PlaceDetailDto; refresh: () => void }) {
  const [tags, setTags] = useState(place.myTags.join(", "));
  const [visibility, setVisibility] = useState<Visibility>("private");
  const operation = useWrite(refresh);
  return (
    <form
      className="space-y-3 rounded-xl border border-border p-4"
      onSubmit={(event) => {
        event.preventDefault();
        void operation.write(
          `/api/places/${encodeURIComponent(place.slug)}/tags`,
          {
            method: "PUT",
            body: {
              tags: [
                ...new Set(
                  tags
                    .split(",")
                    .map((tag) => tag.trim())
                    .filter(Boolean),
                ),
              ],
              visibility,
            },
          },
          "Your tags were replaced.",
        );
      }}
    >
      <h3 className="font-serif font-bold text-brand">Your tags</h3>
      <WriteStatus {...operation} />
      <fieldset disabled={operation.busy} className="space-y-3">
        <label className="block text-sm">
          Comma-separated tags
          <Input value={tags} onChange={(event) => setTags(event.target.value)} />
        </label>
        <p className="text-xs text-text-secondary">
          Up to 10 tags, 32 characters each: lowercase letters, numbers and single hyphens. Empty
          removes your tags.
        </p>
        <VisibilitySelect
          value={visibility}
          onChange={setVisibility}
          label="Visibility for this replacement"
        />
        <Button type="submit">{operation.busy ? "Saving…" : "Replace my tags"}</Button>
      </fieldset>
    </form>
  );
}

function CorrectionForm({ slug, refresh }: { slug: string; refresh: () => void }) {
  const [field, setField] = useState<PlaceCorrection["field"]>("name");
  const operation = useWrite(refresh);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const fields = new FormData(event.currentTarget);
    const text = String(fields.get("value") ?? "").trim();
    let correction: PlaceCorrection;
    switch (field) {
      case "coords":
        correction = {
          field,
          value: { lat: Number(fields.get("lat")), lng: Number(fields.get("lng")) },
        };
        break;
      case "closed":
        correction = { field, value: fields.get("closed") === "true" };
        break;
      case "website":
        correction = { field, value: text || null };
        break;
      case "hours":
        correction = { field, value: { text } };
        break;
      default:
        correction = { field, value: text };
    }
    await operation.write(
      `/api/places/${encodeURIComponent(slug)}/suggestions`,
      { method: "POST", body: correction },
      "Correction submitted for review. The place has not been changed.",
    );
  }
  return (
    <form onSubmit={submit} className="space-y-3 rounded-xl border border-border p-4">
      <h3 className="font-serif font-bold text-brand">Suggest a correction</h3>
      <WriteStatus {...operation} />
      <fieldset disabled={operation.busy} className="space-y-3">
        <label className="block text-sm">
          Field
          <select
            value={field}
            onChange={(event) => setField(event.target.value as PlaceCorrection["field"])}
            className="min-h-11 w-full rounded-xl border border-border px-3"
          >
            {["name", "hours", "website", "coords", "closed"].map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
        </label>
        {field === "coords" ? (
          <div className="grid grid-cols-2 gap-3">
            <label className="text-sm">
              Latitude
              <Input required name="lat" type="number" step="any" min={-90} max={90} />
            </label>
            <label className="text-sm">
              Longitude
              <Input required name="lng" type="number" step="any" min={-180} max={180} />
            </label>
          </div>
        ) : field === "closed" ? (
          <label className="block text-sm">
            Reported state
            <select name="closed" className="min-h-11 w-full rounded-xl border border-border px-3">
              <option value="true">Permanently closed</option>
              <option value="false">Not permanently closed</option>
            </select>
          </label>
        ) : (
          <label className="block text-sm">
            {field === "website" ? "Website (blank to clear)" : "Suggested value"}
            <Input
              key={field}
              required={field !== "website"}
              type={field === "website" ? "url" : "text"}
              name="value"
              maxLength={field === "hours" ? 1000 : field === "name" ? 200 : 2000}
            />
          </label>
        )}
        <Button type="submit">{operation.busy ? "Submitting…" : "Submit for review"}</Button>
      </fieldset>
    </form>
  );
}

export function PlaceMetadata({ place, refresh }: { place: PlaceDetailDto; refresh: () => void }) {
  const { userId } = useAccount();
  const notes = [
    ...new Map([...place.notes, ...place.myNotes].map((note) => [note.id, note])).values(),
  ];
  return (
    <section className="space-y-4">
      <h2 className="font-serif text-xl font-bold text-brand">Place notes & tags</h2>
      {place.tags.length ? (
        <p className="text-sm">{place.tags.map((tag) => `#${tag}`).join(" · ")}</p>
      ) : (
        <p className="text-sm text-text-secondary">No visible tags yet.</p>
      )}
      {!notes.length && <p className="text-sm text-text-secondary">No notes visible to you yet.</p>}
      {notes.map((note) =>
        note.userId === userId ? (
          <NoteEditor
            key={`${note.id}:${note.updatedAt}`}
            slug={place.slug}
            note={note}
            refresh={refresh}
          />
        ) : (
          <article key={note.id} className="space-y-2 rounded-xl border border-border p-4">
            <p className="text-xs capitalize text-text-secondary">
              {note.kind} · {note.visibility} · {new Date(note.updatedAt).toLocaleDateString()}
            </p>
            <p className="whitespace-pre-wrap text-sm">{note.body}</p>
          </article>
        ),
      )}
      <NoteEditor slug={place.slug} refresh={refresh} />
      <TagsEditor key={place.myTags.join(",")} place={place} refresh={refresh} />
      <CorrectionForm slug={place.slug} refresh={refresh} />
    </section>
  );
}
