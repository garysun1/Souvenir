# Authentication and private photo integration

This component does not provision or mutate hosted Supabase. All application
data remains behind the authenticated Next.js API.

## Server and client configuration

Root server configuration uses `DATABASE_URL` (or `SUPABASE_DATABASE_URL`),
`APP_ORIGIN` (the exact web origin, required in production), and optionally
`CORS_ORIGINS` (comma-separated exact Expo web origins). Never include a trailing
slash or `*`. Native bearer requests need no Origin. Browser requests from a
configured Expo origin must send `Authorization`; ambient cookie auth is denied.
Cookie writes require the configured app Origin. Preflight is handled centrally.

Both root browser and SSR clients use `NEXT_PUBLIC_SUPABASE_URL` and
`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`. Only the Storage server helper uses
`SUPABASE_SECRET_KEY`, falling back to `SUPABASE_SERVICE_ROLE_KEY`.
Never expose server credentials through `NEXT_PUBLIC_*` or `EXPO_PUBLIC_*`.
Public configuration does not parse or require a database URL. `DEV_USER_ID`
remains available to the legacy local seed script only; auth ignores it entirely.

`/login` provides email/password sign-in, signup, and confirmation resend.
Signup without a returned session shows a pending-confirmation message.
`/auth/callback` exchanges a PKCE code; `/auth/confirm` accepts `token_hash`
and `type=email|signup` for a customized email template. Both reject unsafe
return paths and redirect only to the configured application origin.
`/auth/account` provides account status and device-local sign-out.
The web owner should link to it from Profile/account navigation; this component
does not edit existing screens or navigation.

Final integrator: configure the actual approved site URL and callback URLs in
Supabase Auth URL Configuration. Allow the web app's `/auth/callback` (including
its optional `next` query) and, if using a token-hash email template,
`/auth/confirm`. Keep email confirmation enabled. Use exact approved development
and release origins rather than broad production wildcards. Native Auth URL
configuration depends on the mobile owner's chosen confirmation flow.
Never consider signup complete until Auth returns a verified session.

The server exports `requireApiUser(request)` and `getCurrentUserId()` in
`src/lib/auth/server.ts`. Invalid bearer headers never fall back to cookies.
Both authentication paths call `auth.getUser`, provision a profile using the
verified UUID, and ignore the development user. `ensureUserProfile` preserves
existing profile fields. API failures use safe contract envelopes.

## Storage setup (final integration only)

Use the official Storage API with a server-only key; never insert storage tables
directly. The idempotent provisioning algorithm is:

1. Call `supabase.storage.getBucket("captures")`.
2. If it is specifically absent, call `createBucket("captures", options)`.
   If another integrator created it concurrently, re-read before deciding.
3. If it already exists, call `updateBucket("captures", options)` when any setting
   differs. Do not delete or recreate the bucket, preserving existing objects.
4. Re-read and verify these settings:

```ts
const options = {
  public: false,
  fileSizeLimit: 10 * 1024 * 1024,
  allowedMimeTypes: ["image/jpeg", "image/png", "image/webp"],
};
```

Leave Storage client policies at default deny. The server validates identity and
ownership before issuing single-object signed upload tokens, signed read URLs,
or deletion calls. Supabase signed upload tokens have a provider-defined two-hour
lifetime; reads expire after 300 seconds. Upload uses `upsert: false`.
Never call `getPublicUrl`.

## API owner handoff

The preparation contract reserves photo routes for the shared API owner.
`src/lib/auth/storage.ts` exports:

- `createCaptureUpload(auth, input): Promise<PhotoUploadDto>`
- `validateCapturePhoto(auth, path, requestId): Promise<void>`
- `signCapturePhoto(auth, path): Promise<SignedPhotoDto>`
- `deleteCapturePhoto(auth, path): Promise<void>`
- `CaptureStorageError`, with safe `status`, `code`, and `message` properties.

`POST /api/capture/upload`: call `requireApiUser`, validate the request with
`photoUploadSchema`, then call `createCaptureUpload`. Return `{data: result}`.
Map `CaptureStorageError` to the contract error envelope without raw provider
details. When `uploaded: true`, the client skips upload; otherwise it uses
`uploadToSignedUrl(path, token, bytes, {contentType})`. React Native supplies an
ArrayBuffer. Changed MIME or size for an existing request path returns 409.

Before edition creation, call `validateCapturePhoto` with the verified owner
and the edition requestId. It checks exact path ownership, UUID, extension,
existence, actual size and content type. Store only the object path.
`GET /api/editions/:id/photo` must first load the edition with the verified user
predicate, then call `signCapturePhoto`; a foreign edition must return 404.
After transactional edition deletion, call `deleteCapturePhoto`. Retain cleanup
metadata for retry if Storage fails; do not restore deleted data.

Helpers check MIME metadata and bucket limits. These checks are not image decoding
or malware scanning. Upload tokens cannot enforce a caller-declared exact size;
the edition preflight validates the actual object before committing a photo.
Keep draft bytes immutable across retries and use a new requestId for a new photo.

## Local verification

Run `pnpm lint`, `pnpm typecheck`, `pnpm test`, and `pnpm format:check`.
`node tests/auth/check-profiles.mjs` provisions disposable Docker Postgres 16,
applies the existing migration chain, and checks concurrent profile creation,
handle collisions, metadata sanitation, personal-field preservation, UUID
isolation and development-profile preservation. It overrides any ambient
database URL and removes its container afterward.

`node tests/contracts/check-catalog.mjs --build` runs a production build against
another disposable populated database. Set the public Supabase variables to
dummy public values and `APP_ORIGIN` to a local or test origin for this check.
Hosted signup, confirmation delivery, Storage upload/download, cross-client
synchronization and browser/native flows require the final integration stage.

## References

- https://supabase.com/docs/guides/auth/server-side/nextjs
- https://supabase.com/docs/guides/auth/server-side/creating-a-client
- https://supabase.com/docs/reference/javascript/auth-signup
- https://supabase.com/docs/reference/javascript/file-buckets-createsigneduploadurl
- https://supabase.com/docs/reference/javascript/file-buckets-createsignedurl
- https://supabase.com/docs/reference/javascript/file-buckets-createbucket
- https://supabase.com/docs/reference/javascript/file-buckets-updatebucket
- https://supabase.com/docs/reference/javascript/file-buckets-getbucket
