import assert from "node:assert/strict";
import {
  mkdirSync,
  openSync,
  closeSync,
  writeSync,
  fsyncSync,
  readFileSync,
  existsSync,
  unlinkSync,
  truncateSync,
} from "node:fs";
import { resolve } from "node:path";
import { z } from "zod";
import { RUNS, runId } from "./safety";

export const optionsSchema = z.object({
  runId: z.string(),
  seed: z.string(),
  accounts: z.number().int().min(2).max(1000),
  editions: z.number().int().min(1).max(120).nullable(),
  concurrency: z.number().int().min(1).max(16),
  mode: z.enum(["core", "worldwide"]),
  photoMode: z.enum(["pool", "sparse", "none"]),
  anchor: z.string().datetime(),
  fixtureHash: z.string(),
  poolHash: z.string().nullable(),
});
export type RunOptions = z.infer<typeof optionsSchema>;
export const recordSchema = z
  .object({
    kind: z.enum([
      "intent",
      "account",
      "place",
      "object",
      "edition",
      "wishlist",
      "note",
      "done",
      "cleaned",
      "report",
    ]),
    key: z.string(),
    id: z.string().uuid().optional(),
    email: z.string().email().optional(),
    path: z
      .string()
      .regex(/^[a-f0-9-]{36}\/[a-f0-9-]{36}\.jpg$/)
      .optional(),
    sha256: z
      .string()
      .regex(/^[a-f0-9]{64}$/)
      .optional(),
    index: z.number().int().min(0).max(999).optional(),
  })
  .strict();
export type RecordEntry = z.infer<typeof recordSchema>;

export class Manifest {
  readonly dir: string;
  readonly options: RunOptions;
  readonly records: RecordEntry[];
  private fd: number;
  private lock: string;
  private index = new Map<string, RecordEntry>();

  constructor(id: string, options?: RunOptions, recover = false) {
    this.dir = resolve(RUNS, runId(id));
    assert(options || existsSync(resolve(this.dir, "manifest.json")), "Unknown run-id");
    mkdirSync(this.dir, { recursive: true, mode: 0o700 });
    this.lock = resolve(this.dir, "lock");
    if (existsSync(this.lock) && recover) {
      const pid = Number(readFileSync(this.lock, "utf8"));
      let alive = true;
      try {
        process.kill(pid, 0);
      } catch (error) {
        if (error instanceof Error && "code" in error && error.code === "ESRCH") alive = false;
      }
      assert(!alive, "Run still has a live owner; refusing recovery");
      unlinkSync(this.lock);
    }
    const lockFd = openSync(this.lock, "wx", 0o600);
    writeSync(lockFd, String(process.pid));
    fsyncSync(lockFd);
    closeSync(lockFd);
    const meta = resolve(this.dir, "manifest.json");
    try {
      if (!existsSync(meta)) {
        assert(options, "Unknown run-id; start with run");
        const fd = openSync(meta, "wx", 0o600);
        writeSync(fd, JSON.stringify(optionsSchema.parse(options), null, 2));
        fsyncSync(fd);
        closeSync(fd);
      }
      this.options = optionsSchema.parse(JSON.parse(readFileSync(meta, "utf8")));
      assert.equal(this.options.runId, id);
      if (options)
        assert.deepEqual(this.options, options, "Options differ; use resume or a new run-id");
      const journal = resolve(this.dir, "journal.jsonl");
      const text = existsSync(journal) ? readFileSync(journal, "utf8") : "";
      const boundary = text.lastIndexOf("\n") + 1;
      this.records = text
        .slice(0, boundary)
        .split("\n")
        .filter(Boolean)
        .map((line) => recordSchema.parse(JSON.parse(line)));
      for (const record of this.records) this.index.set(`${record.kind}:${record.key}`, record);
      if (boundary < text.length) truncateSync(journal, Buffer.byteLength(text.slice(0, boundary)));
      this.fd = openSync(journal, "a", 0o600);
    } catch (error) {
      unlinkSync(this.lock);
      throw error;
    }
  }

  has(key: string, kind: RecordEntry["kind"] = "done") {
    return this.index.get(`${kind}:${key}`);
  }

  append(entry: RecordEntry) {
    recordSchema.parse(entry);
    const line = Buffer.from(JSON.stringify(entry) + "\n");
    let offset = 0;
    while (offset < line.length) offset += writeSync(this.fd, line, offset);
    fsyncSync(this.fd);
    this.records.push(entry);
    this.index.set(`${entry.kind}:${entry.key}`, entry);
  }

  close() {
    closeSync(this.fd);
    unlinkSync(this.lock);
  }
}
