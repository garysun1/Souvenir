import { describe, expect, it } from "vitest";
import { categorySchema, identifyRequestSchema, placeSchema } from "@/lib/schemas";
describe("schemas", () => {
  it("accepts valid inputs", () => {
    expect(categorySchema.parse("nature")).toBe("nature");
    expect(
      identifyRequestSchema.parse({ imageUrl: "https://example.com/photo.jpg" }).imageUrl,
    ).toContain("example");
  });
  it("rejects malformed inputs", () => {
    expect(() => categorySchema.parse("museum")).toThrow();
    expect(() => identifyRequestSchema.parse({ imageUrl: "not-a-url" })).toThrow();
    expect(() => placeSchema.parse({})).toThrow();
  });
});
