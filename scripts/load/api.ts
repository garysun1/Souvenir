import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";
import type { ApiResult, ProfileDto } from "../../shared/api-contract";
import { API_ORIGIN, SUPABASE_ORIGIN, guardedFetch } from "./safety";
import { clientOptions, type LocalStatus } from "./local";

export class ApiFailure extends Error {
  constructor(
    readonly status: number,
    method: string,
    path: string,
  ) {
    super(`API ${method} ${path.split("?")[0]} returned ${status}; response withheld`);
  }
}
const request = guardedFetch(API_ORIGIN);
export const timings = new Map<string, number[]>();
const statuses = new Map<string, Record<string, number>>();

export class ApiClient {
  private auth;
  constructor(
    config: LocalStatus,
    readonly id: string,
  ) {
    this.auth = createClient(config.API_URL, config.ANON_KEY, clientOptions);
  }
  async login(email: string, password: string) {
    const { data, error } = await this.auth.auth.signInWithPassword({ email, password });
    assert(!error, `Local account sign-in failed (${error?.code ?? "unknown"})`);
    assert(data.user?.id === this.id && data.session, "Auth returned unexpected identity");
    const profile = await this.call<ProfileDto>("GET", "/api/me");
    assert.equal(profile.id, this.id, "API owner must come from verified bearer token");
  }
  async call<T>(method: string, path: string, body?: object): Promise<T> {
    const { data } = await this.auth.auth.getSession();
    assert(data.session, "Authenticated session required");
    let token = data.session.access_token;
    if ((data.session.expires_at ?? 0) < Date.now() / 1000 + 60) {
      const refreshed = await this.auth.auth.refreshSession();
      assert(refreshed.data.session && !refreshed.error, "Local refresh failed");
      token = refreshed.data.session.access_token;
    }
    assert(path.startsWith("/api/") && !path.startsWith("//"));
    const start = performance.now();
    const response = await request(`${API_ORIGIN}${path}`, {
      method,
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
    });
    const metric = `${method} ${path
      .split("?")[0]
      .replace(/[0-9a-f]{8}-[0-9a-f-]{27}/g, ":id")
      .replace(/load-[a-z0-9-]+/g, ":place")}`;
    const samples = timings.get(metric) ?? [];
    samples.push(performance.now() - start);
    timings.set(metric, samples);
    const counts = statuses.get(metric) ?? {};
    counts[response.status] = (counts[response.status] ?? 0) + 1;
    statuses.set(metric, counts);
    if (!response.ok) throw new ApiFailure(response.status, method, path);
    const result = (await response.json()) as ApiResult<T>;
    assert("data" in result, `Invalid API envelope: ${method} ${path}`);
    return result.data;
  }
  async upload(path: string, token: string, bytes: Buffer) {
    assert(path.startsWith(`${this.id}/`), "Foreign capture path refused");
    const result = await this.auth.storage
      .from("captures")
      .uploadToSignedUrl(path, token, bytes, { contentType: "image/jpeg" });
    assert(!result.error, "Signed upload failed");
  }
  async signedBytes(url: string) {
    const response = await guardedFetch(SUPABASE_ORIGIN)(url);
    assert(response.ok, "Signed download failed");
    return Buffer.from(await response.arrayBuffer());
  }
  async verifyDataBoundary() {
    for (const table of ["users", "editions", "place_notes", "activity_events"]) {
      const result = await this.auth.from(table).select("*").limit(1);
      assert.equal(result.error?.code, "42501", "Authenticated PostgREST access must be revoked");
    }
  }
}

export function latencyReport() {
  return [...timings].map(([route, samples]) => {
    samples.sort((a, b) => a - b);
    return {
      route,
      count: samples.length,
      responseStatuses: statuses.get(route),
      p50Ms: samples[Math.floor(samples.length * 0.5)],
      p95Ms: samples[Math.floor(samples.length * 0.95)],
      maxMs: samples.at(-1),
    };
  });
}
