import { describe, expect, it } from "vitest";
import { z } from "zod";
import { parseJsonBody } from "@/lib/api";

const schema = z.object({ query: z.string() });

describe("parseJsonBody", () => {
  it("returns a 400 invalid_json response for malformed JSON", async () => {
    const result = await parseJsonBody(
      new Request("http://localhost", {
        method: "POST",
        body: "{",
        headers: { "content-type": "application/json" },
      }),
      schema,
    );
    expect("response" in result).toBe(true);
    if ("response" in result) {
      expect(result.response.status).toBe(400);
      await expect(result.response.json()).resolves.toEqual({ error: "invalid_json" });
    }
  });

  it("returns a 400 invalid_request response for schema failures", async () => {
    const result = await parseJsonBody(
      new Request("http://localhost", {
        method: "POST",
        body: JSON.stringify({ query: 4 }),
        headers: { "content-type": "application/json" },
      }),
      schema,
    );
    expect("response" in result).toBe(true);
    if ("response" in result) expect(result.response.status).toBe(400);
  });

  it("returns parsed data for valid JSON", async () => {
    const result = await parseJsonBody(
      new Request("http://localhost", {
        method: "POST",
        body: JSON.stringify({ query: "quiet" }),
        headers: { "content-type": "application/json" },
      }),
      schema,
    );
    expect(result).toEqual({ data: { query: "quiet" } });
  });
});
