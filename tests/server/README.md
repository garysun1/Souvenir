# Persistence checks

Run with Node 24 and the root pnpm 9.15.5 dependencies:

```sh
corepack pnpm test
node tests/server/check-persistence.mjs
```

The first command includes private Storage unit tests. The second creates a
disposable PostgreSQL 16 Docker container, applies the repository migration chain,
and invokes the real query services and route handlers against that database.
It overrides `DATABASE_URL`; it never reads or changes the hosted database.
The container is removed when the run exits.

The integration suite supplies a test authentication guard and a mock Storage
boundary. It exercises real Postgres transactions, simultaneous duplicate and
distinct visit creates, durable request/import tombstones, rollback, independent
accounts, shared-list membership, ranking cleanup, plan validation and API shapes.
It does not verify Supabase Auth sessions, real Storage, web UI or native UI.

`node tests/server/check-persistence.mjs --build` also builds Next.js against the
disposable schema and test catalog. The authentication component must export the
prepared `requireApiUser` helper before typecheck/build can complete.

## Integration boundary

`src/lib/auth/storage.ts` implements `createCaptureUpload`, `verifyCapturePhoto`,
`signCapturePhoto` and `deleteCapturePhoto`. The upload endpoint itself is excluded
from this component assignment. Its owner should parse `photoUploadSchema`, invoke
`createCaptureUpload` with verified auth, and return the normal `{data}` envelope.
Only private `captures` objects are supported; the final integration stage creates
the bucket and verifies hosted behavior.
