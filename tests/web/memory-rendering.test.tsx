import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ImportItem } from "@/components/memories/import-item";
import { TastePublish } from "@/components/taste/taste-publish";
import { FriendPicker } from "@/components/memories/friend-picker";
import { ComparisonSummary } from "@/components/taste/taste-together";
import { item, profile, friendId } from "./memory-fixtures";
import { snapshot } from "./fixtures";

vi.mock("@/components/account/account-provider", () => ({
  useAccount: () => ({ data: snapshot, userId: snapshot.user.id }),
}));
vi.mock("@/components/memories/memory-state", () => ({
  useMemoryAction: () => ({ busy: false, error: null, message: null, run: vi.fn(), post: vi.fn() }),
  useMemoryPage: () => ({
    loading: false,
    error: null,
    retry: vi.fn(),
    data: { items: [], nextCursor: null },
  }),
  useMemoryResource: (path: string) => ({
    loading: false,
    error: null,
    retry: vi.fn(),
    data:
      path === "/api/friends"
        ? {
            friends: [
              {
                user: { id: friendId, displayName: "Accepted account", handle: "accepted" },
                status: "accepted",
                tasteOverlap: null,
              },
              {
                user: { id: "incoming", displayName: "Pending requester", handle: "incoming" },
                status: "incoming",
                tasteOverlap: null,
              },
              {
                user: { id: "outgoing", displayName: "Unaccepted recipient", handle: "outgoing" },
                status: "outgoing",
                tasteOverlap: null,
              },
            ],
          }
        : null,
  }),
}));

beforeEach(() => vi.stubGlobal("React", React));
afterEach(() => vi.unstubAllGlobals());

describe("consent and coverage rendering", () => {
  it("does not pre-approve inferred facets, image grants, or publication", () => {
    const html = renderToStaticMarkup(<TastePublish profile={profile} />);
    expect(html).toContain("I approve this title");
    expect(html).toContain("Publication preview");
    expect(html).toContain("No interests selected");
    expect(html).toContain("0 selected collage moments");
    expect(html).not.toContain('checked=""');
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Publish approved portrait/);
    expect(html).not.toContain("Private evidence explanation");
    expect(html).not.toContain("Private preferences");
  });
  it("requires confirmation before a selected unlocated photo can record a visit", () => {
    const html = renderToStaticMarkup(
      <ImportItem
        item={item}
        selected
        createVisit={false}
        onSelect={() => {}}
        onVisit={() => {}}
      />,
    );
    expect(html).toContain("Unresolved stop");
    expect(html).toContain("confirm the stop first");
    expect(html).toMatch(/type="checkbox"[^>]*disabled=""/);
    expect(html).not.toContain("Search nearby");
    expect(html).not.toContain("Use my location");
  });
  it("offers only accepted account relationships in the sharing picker", () => {
    const html = renderToStaticMarkup(<FriendPicker selected={[]} onChange={() => {}} />);
    expect(html).toContain("Accepted account");
    expect(html).not.toContain("Pending requester");
    expect(html).not.toContain("Unaccepted recipient");
  });
  it("shows sparse coverage honestly without a friendship percentage", () => {
    const html = renderToStaticMarkup(
      <ComparisonSummary
        comparison={{
          definitionVersion: 1,
          commonInterests: ["gardens"],
          overlap: "insufficient",
          coverage: "insufficient",
          explanation: "Publish more approved interests for a useful comparison.",
          suggestions: [],
        }}
      />,
    );
    expect(html).toContain("gardens");
    expect(html).toContain("More approved interests needed");
    expect(html).toContain("not friendship quality");
    expect(html).toContain("definition v1");
    expect(html).not.toContain("%");
  });
});
