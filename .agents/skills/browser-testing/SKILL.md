---
name: souvenir-browser-testing
description: Run Souvenir prototype or integrated Supabase browser acceptance in isolated storage and distinguish application failures from extraction side effects.
---

# Local browser testing

- Repo: `/home/ubuntu/repos/souvenir`. This source archive may have no remote/PR or resolvable repo blueprint.
- Source `/home/ubuntu/.nvm/nvm.sh` for Node; reuse the existing Expo server on port 8081 when available. Otherwise follow package scripts and publish the preview through the lead.
- Preserve ordinary user preview storage: test through visible incognito Chrome. Restore the isolated preview's starting mode via Settings → Demo controls after destructive reset tests. Maximize before recording.
- Providers, identification, Dropbox import, source modes and social confirmations are explicitly local simulations. Phone-width Chrome does not prove native behavior.

## Resource-error diagnosis

- `Log.enable` can replay historical errors on attachment. Preserve them, but distinguish startup/replay from newly observed requests.
- Enable `Network` before navigation; retain full requestWillBeSent, responseReceived, loadingFailed, initiators, timestamps and request IDs.
- For a control interval, use physical keyboard navigation without DOM extraction and a pixel-only screenshot, then compare separate screenshot/automatic-HTML and explicit read_dom intervals.
- DOM extraction can instantiate image elements, copy their src, then abbreviate src/href strings. These detached image elements can issue literal abbreviated asset requests and 404s while the live page remains correct.
- Do not infer attribution solely from `...` or visible images. Compare fresh Network events and retain supplied initiator stacks; use Debugger.getScriptSource when necessary to identify an injected extraction script. Failed requests may expose `initiator: other` even when the preceding full-image request exposes a script stack.
- Preserve historical failures without silently reclassifying every event. Asset attribution does not automatically establish the cause of separate blob/file errors.
- Hydration warnings can also involve extraction-injected `devinid`,
  `devin-tagname`, or `devin-hidden` attributes. Preserve the original diff, then
  repeat fresh route loads with a passive CDP collector and no DOM extraction
  during hydration. Classify these as tooling effects only when the diff and
  clean control run support that conclusion.
- Save logs, screenshots and recordings under persistent `/home/ubuntu` paths, not only `/tmp`. Stop collectors after testing.

## Devin Secrets Needed

None for the local deterministic prototype.

For integrated account testing: `SUPABASE_DATABASE_URL`, `SUPABASE_SECRET_KEY` (server-only test-account administration), and `SUPABASE_PUBLISHABLE_KEY`. Bind secret references to process environment; never put secret values in artifacts or client configuration.

## Integrated Next.js and Expo account acceptance

- Confirm the checkout: the integrated repository may be `/home/ubuntu/repos/souvenir-integrated`, distinct from the older Expo-only prototype. Read root and mobile READMEs and `docs/supabase-api.md` before setup.
- Run root Next.js on 3000 and the integrated Expo web client on a separate free port such as 8082; an older prototype may occupy 8081. Use the root pnpm and mobile npm lockfiles. Source nvm before commands.
- Configure root `DATABASE_URL`, Supabase server/public variables and `APP_ORIGIN`; explicitly allow the actual Expo origin via the CORS variable defined in root env.ts. Mobile uses `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, and `EXPO_PUBLIC_API_URL`. Reuse already provisioned schema/catalog/storage rather than reseeding a shared project.
- Use dedicated disposable confirmed Auth users, not real email recipients. Keep generated login credentials in memory and exercise real UI login forms. Stop recording around credential filling; restart after successful navigation.
- Test cross-client persistence with two editions of the same canonical place, distinct photos/notes/companions and different stored zones. A UTC instant shortly after midnight catches previous-day LA formatting mistakes. Check Collection list, latest/all-edition albums, detail and place history against the stored timezone.
- Web Profile sign-out can invalidate the same user's other sessions. Expo may show Welcome on subsequent refresh. Welcome's “Retry sign out” button alone is not proof of a failed sign-out; inspect visible error state and whether populated login fields enable submission.
- Verify account isolation with a fresh second-account form login, zero collection counts, private-list absence and direct access to the first user's edition route. Separately enter explicit local demo, leave it through Settings, log back in and verify no sample visits appear after refresh in either client.
- Use 390×844 viewport emulation for phone-width acceptance; this is browser testing, not native camera, permission, offline or token-expiration coverage.
- Cleanup must be scoped to recorded temporary IDs: private capture objects, editions, lists/membership/saves, outings, rankings/preferences/counters/API requests, profiles and Auth users. Independently verify zero leftovers and unchanged shared catalog count. Sign out before deletion and stop diagnostic collectors afterward.

## Signup and account-bootstrap diagnosis

- Verify the actual installed mobile dependencies before startup. After a checkout
  update, an existing node_modules directory may still lack a newly configured
  Expo plugin; install from the current mobile lockfile before diagnosing app code.
- With Expo 57, inspect environment precedence if copied `.env.local` placeholders
  appear to override explicitly injected shell values. `expo/virtual/env` can merge
  dotenv modules over `process.env`; an empty public-key line then shadows a valid
  injected key. Remove the empty local placeholder when using environment-only
  injection. Never solve this by putting server secrets in public variables.
- Before creating fixtures, verify the bound database credential with a read-only
  catalog count. Use the most recently verified secret reference when session and
  organization references differ. A PostgreSQL `28P01` error is invalid database
  authentication, not a missing profile; the API may intentionally return a generic
  readable HTTP 503 while swallowing the underlying exception.
- A successful catalog count does not prove schema readiness. Compare the hosted
  migration journal with the checked-out migration files and verify newly needed
  columns through `information_schema` before creating accounts. Report missing
  migrations and obtain authorization rather than applying them implicitly.
- Determine confirmation expectations from actual signup response and the public
  Supabase Auth settings (`mailer_autoconfirm`). Auto-confirmed signup does not
  exercise confirmation-required UI, delivery or deep-link routing. Never change
  shared-project Auth settings merely to force that branch.
- Keep browser transport evidence distinct from HTTP errors. A non-allowlisted
  Expo origin can produce OPTIONS 403 without Access-Control-Allow-Origin, followed
  by `PreflightMissingAllowOriginHeader` / `net::ERR_FAILED`; a stopped API yields
  `net::ERR_CONNECTION_REFUSED`. Both can map to the same generic mobile banner.
  Readable HTTP 401/503 responses are different paths.
- Exact origins matter: `localhost` and `127.0.0.1`, different ports, and different
  schemes are separate browser origins. After correcting the allowlist and
  restarting Next, use the existing UI's Retry loading to verify recovery without
  reauthentication. For native devices, assess API reachability separately; browser
  CORS behavior is not native-device evidence and localhost refers to the device.
- Do not infer the original reporter's exact cause from a screenshot alone.
  Request platform, effective API origin and sanitized network error if necessary.
