import { describe, expect, it } from "vitest";
import { z } from "zod";
import { demoExplorers, demoId } from "../db/seed/demo-explorers";
import catalog from "../db/seed/la-places.json";
import { TASTE_INTERESTS } from "../shared/memories-contract";

describe("demo explorer fixtures", () => {
  it("provides ten distinct, explicitly labeled identities and interest combinations", () => {
    expect(demoExplorers).toHaveLength(10);
    expect(new Set(demoExplorers.map((person) => person.handle)).size).toBe(10);
    expect(new Set(demoExplorers.map((person) => person.interests.join(","))).size).toBe(10);
    for (const person of demoExplorers) {
      expect(person.handle).toMatch(/^demo_[a-z_]+$/);
      expect(person.interests.every((interest) => TASTE_INTERESTS.includes(interest))).toBe(true);
    }
  });

  it("uses existing destinations with unique visits and stable, non-colliding identifiers", () => {
    const slugs = new Set(catalog.map((place) => place.slug));
    const ids: string[] = [];
    for (const person of demoExplorers) {
      ids.push(demoId(person.handle));
      expect(person.visits.length).toBeGreaterThanOrEqual(3);
      expect(new Set(person.visits).size).toBe(person.visits.length);
      for (const slug of person.visits) {
        expect(slugs.has(slug)).toBe(true);
        ids.push(demoId(`${person.handle}:edition:${slug}`));
        ids.push(demoId(`${person.handle}:request:${slug}`));
      }
    }
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.every((id) => z.string().uuid().safeParse(id).success)).toBe(true);
    expect(demoId("demo_maya_gardens")).toBe("5aad2640-0795-5760-ba8e-151be16b25e5");
    expect(demoId("demo_maya_gardens")).not.toBe(
      demoId("demo_maya_gardens:edition:descanso-gardens"),
    );
  });
});
