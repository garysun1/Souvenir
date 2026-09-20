# Souvenir — End-to-End Dummy UI Implementation Plan

**Platform:** React Native, Expo SDK 57, TypeScript, Expo Router  
**Visual direction:** Beli-style white surfaces, deep teal controls, serif headings, compact lists, pastel sentiment indicators  
**Deliverable:** A persistent, interactive prototype covering Discover → Visit → Capture → Reveal → Collect → Inspire the next visit  
**Scope of this document:** Implementation specification only; application implementation has not started.

## 1. Decisions and scope

Build a phone-first prototype with 30 Los Angeles destinations, three categories, one complete themed set, a seeded friend group, and deterministic mock services. Navigation, search, saving, capture, ranking, collection updates, shared lists, and itinerary revision must work together.

Use these defaults so implementation can begin without further product decisions:

- **Design:** Light mode, matching the Beli references. Souvenir has its own lowercase serif wordmark, destination photography, and copy.
- **Navigation:** Discover · Collection · Capture · Friends · Profile. Capture is the prominent center action. Map becomes a view within Discover and Collection; saved plans live under Profile and are accessible from the planner.
- **Demo identity:** “You” and three fictional friends: Maya, Jordan, and Sam. No authentication.
- **Data:** In-bundle TypeScript fixtures, asynchronous mock-service interfaces, and local persistence. No server is required.
- **Platforms:** iOS/Android UI, plus an Expo web preview. Native maps use `react-native-maps`; web and offline mode use an interactive, explicitly labeled schematic map.
- **Device features:** Camera, photo picker, and optional foreground location when available. Each has a sample-data alternative.
- **Place matching:** location-first, Beli-style. Nearby places from a provider-backed catalog, user taps to choose, search and custom-place fallbacks. See §6.0. AI is optional suggestion only.
- **External integrations:** places provider, Elasticsearch search, Meta, OpenAI planning, Dropbox, and source feeds are simulations. A visible “Demo data” label and per-source provenance make this clear.
- **Images:** Bundle place images with documented rights/attribution and the required font files. User-selected photos remain local.
- **Release:** A runnable prototype and reviewable code changes. Production integrations, deployment, authentication, payments, and booking are separate work.

This supersedes the earlier outline’s separate Map and Plans tabs. It also replaces random identification results, speculative live-data claims, and forced itinerary changes with deterministic behavior.

### 1.1 Delivery tiers

| Tier | Included |
|---|---|
| P0 — complete core loop | Onboarding/demo mode, discovery/search, place detail, camera/sample capture, confirmation, reveal, editions, collection list/album/map, one set, recommendations, one shared wishlist, overlap, planner with revision, source attribution |
| P1 — complete dummy feature map | Favorites/tips, fuller friend feed/profile, matching group editions, Dropbox import simulation, source failures, all empty/error states, offline demonstration |
| P2 — extension previews | Diorama preview, worldwide city picker, Visa booking concept. These are labeled previews with working navigation and cancellation; they do not perform external actions. |

Finish and validate P0 before adding P1. P0 and P1 together are the target dummy UI. Keep the three extension previews outside the core success path.

## 2. Beli references and visual fidelity

### 2.1 Evidence and interpretation

Reference material:

1. [Beli App Store listing](https://apps.apple.com/us/app/beli/id1478375386): published product screenshots showing white list screens, teal controls, List/Map switching, photo-led featured lists, feed rows, and profile statistics.
2. [Audrey Wu — Redesigning Beli, September 2024](https://medium.com/@aw766/redesigning-beli-what-do-you-find-yummy-1fad45a7cbcc): a third-party redesign case study, including a reconstructed design kit and proposed “Rank by” flow.
3. [Case-study design kit image](https://miro.medium.com/v2/resize:fit:1400/1*QFfIJMDcnGzsKq6McUJi-Q.png).
4. [Case-study ranking interaction comparison](https://miro.medium.com/v2/resize:fit:1400/1*qWA1ttHP8u-ZnfYV1UtszQ.png).

The exact typography/color values below come from that case study; they are not a verified official Beli design specification. Component geometry, timing, accessibility adjustments, and Souvenir-specific behavior below are implementation decisions.

### 2.2 Color tokens

| Token | Value | Application |
|---|---|---|
| `brand` | `#144F5D` | Wordmark, primary buttons, selected chips, active navigation, links |
| `background` / `surface` | `#FFFFFF` | Screen and sheet backgrounds |
| `surfaceMuted` | `#F5F5F7` | Search fields, neutral placeholders |
| `divider` | `#EDEDED` | List separators |
| `border` | `#D7D7D7` | Outlined controls and cards |
| `textPrimary` | `#212121` | Body text and headings |
| `textSecondary` | `#626262` | Small readable metadata; darkened from the reference gray |
| `textDecorative` | `#808080` | Nonessential, larger secondary decoration only |
| `positive` | `#66B28C` | “Recommend” sentiment, positive status accents |
| `neutral` | `#F7E1A5` | “It depends” sentiment |
| `negative` | `#F0B4B4` | “Would skip” sentiment |
| `errorAccent` | `#DE6A6B` | Error icon or surface accent; use dark text alongside |
| `scrim` | Black at 35% | Modal backdrop |

Pastel circles contain dark labels/icons. Do not put small white text on pastel fills. Color always has a text or shape counterpart.

Reserve recommendation colors for recommendation status. Availability, appeal, and discovery frequency remain separately labeled; they must not collapse into one “rarity score.”

### 2.3 Typography

Bundle Playfair Display 700/800/900 and Inter 400/500/600/700 using `expo-font`.

| Role | Font | Size / line height | Weight |
|---|---|---|---|
| Wordmark “souvenir” | Playfair Display | 25 / 32 | 800 |
| Screen title | Playfair Display | 29 / 36 | 900 |
| Section title | Playfair Display | 21 / 28 | 800 |
| Place title | Playfair Display | 16 / 22 | 700 |
| Important value | Inter | 16 / 22 | 700 |
| Button / input | Inter | 15 / 22 | 600 |
| Body | Inter | 15 / 22 | 400 |
| Metadata | Inter | 13 / 18 | 400–500 |
| Tab label | Inter | 11 / 14 | 500 |

Allow system text scaling. Use a 44-point minimum touch target even where the visible icon is 20–24 points. Dimensions in this plan are React Native logical units. At large text sizes, rows and buttons grow rather than clipping.

### 2.4 Spacing and surfaces

- Main gutters: 18. Compact internal spacing: 4, 8, 12. Section spacing: 26; major breaks: 35 or 40.
- Row separators: 1. Icon strokes: approximately 1.5–2.
- Image corners: 8. Standard card corners: 12. Sheet top corners: 20. Pills: fully rounded.
- Flat white rows and light borders dominate. Use shadows only for floating controls and sheets.
- At a 390-point width, a two-column album has 18-point side gutters, a 12-point gap, and 171-point cards. Compute this from available width rather than hardcoding it.
- On a large web viewport, center a maximum 480-point app canvas. Tablet can use a third album column while keeping readable card widths.
- Keep the status area and bottom safe area clear. A sticky button sits above the keyboard and home indicator.

### 2.5 Signature patterns to reproduce

1. Centered serif wordmark; small left identity/location control and right outline action.
2. Teal-outlined **List | Map** segmented control, with the selected segment teal-filled.
3. Underlined text tabs such as **Been | Want to go | Sets**.
4. Horizontally scrolling filter pills with chevrons and a visible reset action.
5. Compact place rows: ordinal or thumbnail, name, gray metadata, and an aligned trailing badge.
6. Two-up photo cards with a subtle dark image overlay and a completion caption.
7. Circular avatars, outline icons, restrained use of filled active icons.
8. White bottom sheets for confirmation and recommendation, with a three-choice pastel sentiment step.
9. A five-position bottom bar with a filled teal center capture button.
10. A small dark success toast above the tab bar, with one optional action.

Use one icon family already supported by the scaffold, wrapped by `AppIcon`. Avoid mixing emoji, unrelated filled sets, and outline sets as interface controls.

### 2.6 Souvenir-specific styling

- Shared place card: destination photo, serif name, category/location metadata, small labeled facts.
- Personal edition: the same frame with the user’s photo, date, companions, and moment.
- Reveal: restrained 700–900 ms card flip, one light sweep, one haptic. No persistent confetti or full-screen game-like chrome.
- Revisit variant: a small teal or pastel frame accent and a label such as “Return visit · Edition 02.”
- Matching editions: a shared outing stamp and companion avatars.
- The base app remains visually consistent before, during, and after the reveal.

## 3. Navigation and screen inventory

### 3.1 Persistent navigation

| Position | Label | Primary destination |
|---|---|---|
| 1 | Discover | Recommendations, search, nearby list/map, planner entry |
| 2 | Collection | Been, Want to go, Sets; list/album/map views |
| 3 | Capture | Opens a capture modal stack and preserves the originating tab |
| 4 | Friends | Activity, shared lists, overlap, outings |
| 5 | Profile | Collection statistics, favorites, tips, plans, imports, settings |

Use Expo Router tabs with a custom center `tabBarButton` that opens `/capture`. The center slot is an accessible button rather than an empty page. Returning or canceling restores the previous screen and its filters.

Planner entry points: Discover’s “Plan an afternoon” card, a wishlist’s “Plan together,” a place’s “Add to plan,” and Profile → Plans. These all enter the same planner feature with optional context.

### 3.2 Route map

Use `src/app` as the only route root. Reconcile the generated template with this tree once during setup; do not keep two competing route roots.

```text
src/app/
  _layout.tsx                       providers, hydration, fonts, global stack
  index.tsx                         redirect to welcome or discover
  welcome.tsx                       sample profile / empty profile
  onboarding/tastes.tsx              three-category preferences
  (tabs)/
    _layout.tsx                     custom center capture action
    discover.tsx
    collection.tsx
    capture-action.tsx              intercepted tab slot; never a blank screen
    friends.tsx
    profile.tsx
  search.tsx                        query, filters, list/map results
  place/[placeId].tsx                shared place detail
  edition/[editionId].tsx            personal edition detail
  sets/[setId].tsx
  capture/
    _layout.tsx                     modal stack
    index.tsx                       camera / picker / sample
    locate.tsx                      nearby list / search / add a place
    confirm.tsx
    reveal.tsx
  recommend/[placeId].tsx            modal recommendation/ranking sequence
  wishlist/[wishlistId].tsx
  friend/[userId].tsx
  outing/[outingId].tsx
  planner/index.tsx                  initializes a draft session
  planner/[sessionId].tsx
  plans/index.tsx
  plans/[planId].tsx
  import/dropbox.tsx
  profile/favorites.tsx
  profile/tips.tsx
  settings/index.tsx
  settings/sources.tsx
  settings/demo.tsx                  reset / scenarios / failures
  previews/diorama/[editionId].tsx
  previews/cities.tsx
  previews/booking/[planId].tsx
  +not-found.tsx
```

Small UI overlays are components, not separate routes: filter sheet, save-to-list picker, source details, availability explanation, companion picker, moment editor, invite sheet, and destructive-action confirmation.

### 3.3 Navigation rules

- Put only IDs and small query/filter parameters in routes; do not pass photos or whole objects.
- Preserve search query, scroll position, filters, and view mode when returning from detail.
- Push shared detail screens onto the current stack; back returns to the exact entry point.
- Capture drafts are kept in state. An interrupted, uncommitted draft can resume or be discarded.
- Cancel after saving an edition cannot delete it. “Discard draft?” appears only before saving.
- Invalid/deleted IDs show a friendly unavailable state with a safe return action.
- A demo shared-list token can resolve a seeded list inside this installation. It is not cross-device collaboration.

## 4. Shared components and screen composition

Build these before feature-specific styling to keep all screens recognizably consistent.

| Component | Contract and behavior |
|---|---|
| `AppScreen` | Safe area, background, optional scrolling, keyboard handling |
| `AppHeader` | Wordmark/title, back or location control, up to two actions |
| `PrimaryButton`, `OutlineButton`, `IconButton` | Loading/disabled states, accessible names, 44-point targets |
| `SegmentedControl` | Two or three controlled choices; labels and selected state |
| `UnderlineTabs` | Controlled active key; horizontal scroll if labels do not fit |
| `FilterChip`, `FilterRow` | Selected count, clear action, sheet trigger |
| `PlaceRow` | Name, category, area, price label, distance, save button, optional recommendation |
| `PlaceImageCard` | Hero photo, title, short reason, save action |
| `EditionCard` | User photo, place, visit date, variant stamp, companion group |
| `SetCard` | Cover, unique-place progress, missing-place preview |
| `RecommendationBadge` | Recommendation or ordinal; unknown state; never a fabricated global rating |
| `AppealChip`, `FrequencyChip`, `WindowChip` | Three separate explanations and unknown states |
| `AvatarStack` | First three avatars, overflow count, accessible names |
| `FactRow`, `SourceChip` | Value/unit, source, as-of date, scope, demo/live-snapshot label |
| `BottomSheet` | RN `Modal` + Reanimated entry, backdrop, close, Android back, focus restoration |
| `PlaceMap` | Platform adapter, markers, selected place, matching result IDs |
| `ItineraryCard` | Stops, local times, transfer legs, totals, warnings, revision status |
| `EmptyState`, `ErrorState`, `Skeleton`, `Toast` | Consistent recovery actions and announcement behavior |

For this prototype, use one reusable modal sheet with fixed content/full-height variants. Do not add a complex gesture-sheet dependency unless the compatible version and keyboard behavior are verified. One overlay is active at a time.

### 4.1 Representative screen wireframes

```text
DISCOVER                         COLLECTION
[Los Angeles v] souvenir [plan]  [You] souvenir [more]
[Search places or a feeling  ]   Collection        [6 places]
[Nearby] [Free] [Open] [Type v]   Been  Want to go  Sets
For you                         [ List | Map ]        [grid]
[photo: Library] [photo: Park]   [Category v] [Sort v] [heart]
[short reason  ] [short reason]  1  Central Library        #1
Downtown Firsts                     Cultural · Downtown
[cover photo                 ]     Recommended · 1 edition
[1 of 3 collected · View set  ]  2  Griffith Observatory   #2
Plan an afternoon ->               Cultural · Los Feliz
[Discover Collection + Friends Profile]
```

```text
PLACE DETAIL                     RECOMMENDATION SHEET
[Back]       souvenir     [save]  [The Broad]             [x]
[destination image           ]   Would you recommend it?
The Broad                        [Yes] [It depends] [Skip]
Cultural · Downtown              Compare within: Cultural v
[Your appeal: High]              Which would you recommend?
[Demo discovery: 12%]            [The Broad] OR [The Getty]
[Availability: View hours]       [Undo] [Too close] [Skip]
[About] [Facts + source links]   [Save recommendation]
[Your editions / no visits   ]
[Capture visit] [Add to plan]
```

These wireframes specify hierarchy. Final layouts follow responsive sizing and the visual tokens above.

## 5. First run and demo controls

### 5.1 Welcome

Show the serif “souvenir” wordmark, one destination card, and “Keep the places that stay with you.”

Primary: **Explore a sample collection**. Secondary: **Start with an empty album**. Both enter the same app and use the same services.

- Sample mode loads the connected fixtures in section 12.
- Empty mode keeps the destination catalog and fictional friends but removes the current user’s editions, rankings, saves, and plans.
- Follow with a short taste screen: Parks, Culture, Landmarks, each with a photo and toggle. Require one choice or allow “Surprise me.”
- Keep Los Angeles selected. Explain that the city selector’s other choices are previews.
- Ask for no permissions at launch. Camera permission belongs to capture; location belongs to “Use my location.”

### 5.2 Demo settings

Profile → Settings → Demo provides named presets:

`sample`, `empty`, `revisit`, `shared-outing`, `rain`, `closed-venues`, `no-matches`, `source-unavailable`.

Expose reset, reduced-motion preview, simulated service failure, and camera-free capture. Reset requires confirmation and replaces only the prototype’s local data/files.

Initialize a deterministic demo clock at **Saturday, September 19, 2026, 14:00, America/Los_Angeles**. Label generated itinerary dates and weather as sample data. Visit mode can explicitly advance it to a scheduled arrival; Demo settings can advance it to the next day for a revisit. Show the current simulated date/time. Real location or selected photo metadata does not silently change this clock.

### 5.3 Profile and settings

Use Beli’s centered profile composition: circular avatar, display name, handle, short personal line, and outlined **Edit profile** pill.

The three-column statistics row shows **Places / Editions / Sets completed**, derived from the current user’s state. Under it, plain icon-and-chevron rows link to Collection, Want to go, Favorites, My tips, Plans, Import memories, and Settings. A “Your top cultural places” section shows settled category rankings; hide it when none exist.

Edit profile changes the local name, handle, avatar choice, and short personal line; save/cancel behave consistently with other editors. Preferences edits the three taste categories and updates recommendations immediately.

Settings groups: Preferences, Data sources, Demo controls, and About. About explains which device features work and which providers are simulated. Use sample avatars or a chosen local image. Do not add a global leaderboard, follower system, or streak just to fill the profile.

## 6. Flow 1 — Capture, locate, confirm, reveal

### 6.0 Place-matching approach

Souvenir matches a photo to a place the way Beli matches a meal to a restaurant: **location first, user chooses, custom fallback.** The catalog is a cache of an external places provider, not a hand-curated list, and AI is never required to identify a place.

1. **Locate.** Take coordinates from device location, photo EXIF GPS, or the place the user launched Capture from (in that priority). No coordinates → skip to search.
2. **Nearby list.** Query the catalog (and, when online, the places provider) for places within ~250 m, filtered to Souvenir categories (museums, galleries, parks, gardens, landmarks, viewpoints), sorted by distance. Widen to 1 km if fewer than three results.
3. **Tap to choose.** The user picks the place. One tap for the common case.
4. **Search fallback.** “Search all places” opens the catalog/provider text search (Flow 3 boundary).
5. **Custom place.** “Add a place” creates a catalog row with name, category, and the captured coordinates, flagged `userSubmitted`. It is a real place from then on (editions, sets, map). A later merge step reconciles it with a provider match.

Catalog rows store `externalIds` per provider (Google Places, Apple MapKit, OpenTripMap, OSM) so a provider can be swapped or added without touching editions. For the prototype the 30 Los Angeles places are seeded from a provider export into Postgres and served from the `pg` search provider.

AI is optional polish, not a dependency: a vision model may reorder the nearby list (“this looks like a garden”) and highlight a suggestion, but it only chooses among the nearby candidates, returns catalog IDs (never free text), and shows its real confidence. Sample photos map directly to known destination IDs. Do not generate a random “92% confident” claim.

### 6.1 Screen sequence

| Step | Visible UI | Action and transition |
|---|---|---|
| Capture | Camera viewport; close; shutter; gallery; “Use sample photo”; optional flash | Take/pick a photo → draft → locate |
| Locate | Frozen photo, “Finding places near you”, distance-sorted nearby list with category icons; optional “Suggested” highlight; “Search all places”; “Add a place” | Tap a place → confirm. Location unavailable → search. Nothing fits → custom place |
| Confirm | Photo, chosen place, “Change place”, visit metadata | Edit visit metadata |
| Reveal | Card back → personal edition front, shared place label, edition stamp | “Add to collection” commits once |
| Saved | “Added to your collection,” set progress, rate/open edition/next visit | Continue into the collection or recommendation flow |

Camera and gallery can be real device interactions. Selected pixels are analyzed only by the optional suggestion step, and only to rank places already on the nearby list.

### 6.2 Confirmation form

Top half: selected image and current place. Under it:

- **Place:** “The Broad · Downtown.” “Change place” reopens the nearby list, with search and “Add a place” available.
- **Visit date/time:** defaults to the demo clock; editable date picker; stored with timezone. An imported date is marked as imported and remains editable.
- **Companions:** avatar picker with Maya, Jordan, Sam; no automatic invitation.
- **Moment:** optional multiline text, maximum 160 characters, visible counter.
- **Outing:** present only when capture starts from an accepted group plan; user can clear it.
- **Confirm & reveal:** disabled until a valid catalog destination is selected.

Validate future dates against the selected demo clock and ask for correction. EXIF GPS/date, if available through the chosen picker configuration, is a suggestion; manual correction is always available. Do not promise metadata that the platform did not provide.

### 6.3 Shared place versus personal edition

**Shared place detail** is immutable catalog identity: name, location, category, description, reference image, documented/sample facts, and contextual appeal/frequency/availability.

**Personal edition** owns the photo, visit date, companions, moment, variant, origin, optional outing ID, and recommendation history. Editing a moment cannot alter shared place facts.

After saving:

1. Write the edition and update the capture draft’s commit ID in one store action.
2. Recompute unique collected place IDs and set progress.
3. Update Collection, Profile, and the selected map marker immediately.
4. Add one local activity event.
5. Show the saved state; then offer “Recommend it?” and “Complete Downtown Firsts.”

Persist the capture draft through restart. If the reveal was already committed, reopening it displays the saved edition and cannot issue another insert.

### 6.4 Revisit policy

- First saved visit: **First visit · Edition 01**.
- A different later visit to the same place: **Return visit · Edition 02**, then 03, etc.
- A revisit adds one edition, never another unique place or another completed-set unit.
- Use a monotonic per-place edition sequence. Deleting Edition 02 does not reuse its number.
- Retrying the same capture request is idempotent. A suspected same-photo/same-time visit prompts “Open existing” or “Save as a separate visit.”
- Changes to personal metadata are edits, not additional editions.

### 6.5 Personal edition detail

Full-width personal photo; place name; variant/date; companions; moment; associated outing; recommendation; “View place.”

Menu actions: edit moment/date/companions, favorite the place, add/edit private tip, share text through the native share dialog, delete edition with confirmation.

If deletion removes the user’s last edition for a place, the place leaves Been, set progress decreases, and visit-based recommendation/ranking entries for that place are removed. Saves, favorites, and tips remain. Explain this consequence before deletion.

### 6.6 States and acceptance

- Denied camera permission → explanation, gallery, sample photo, retry/settings option.
- Canceled picker → return to camera without clearing an existing draft.
- Location denied or unavailable → skip the nearby list; open search with “Add a place” visible; no dead end.
- Nearby list empty → widen radius once, then search; user can cancel.
- Provider unreachable → serve the nearby list from the local catalog only and say so.
- Custom place name matches an existing place within 250 m → offer “Use existing” before creating a duplicate.
- Backgrounded or canceled lookup → ignore late results using request IDs/abort signals.
- Save failure → preserve draft and local image; show retry. No fake success toast.
- Reduced motion → immediate card reveal plus short fade; no flip.
- **Acceptance:** save once updates all screens; retry does not duplicate; revisit changes editions only; changing the confirmed place updates the resulting edition and set correctly.

## 7. Flow 2 — Collection, maps, sets, favorites, ranking, import

### 7.1 Collection screen

Header: **Collection** and `6 places · 7 editions`.

Underlined sections: **Been | Want to go | Sets**.

Been and Want to go have the Beli-style **List | Map** control. A small grid icon next to it switches the List presentation between rows and Album. Remember this per section.

- **Been/list:** one row per distinct collected place; show latest edition date, number of editions, personal recommendation, and category rank when available.
- **Been/album:** two-column place tiles using the latest personal photo, with an edition-count badge. Opening a tile goes to the shared place and its edition strip. “All editions” switches to a dated edition gallery.
- **Want to go:** the deduplicated union of places you saved in personal or shared lists, with save date and member avatars where relevant. Visiting a place does not remove its save automatically; offer “Mark wishlist item done.”
- **Sets:** completion cards; no irrelevant List/Map control.
- Filters: category, favorites, companion, visit date. Sort: recent visit, name, your category ranking. Show an explicit “Clear” when narrowed.

Use `SectionList` for month-grouped edition rows or a `FlatList` of pre-grouped grid rows. Do not rely on `FlatList numColumns` to also provide unsupported sticky month sections.

### 7.2 Map behavior

Use the same filtered IDs as the list.

- Collected: filled teal marker with check.
- Saved: teal outline marker with bookmark.
- Other discovery result: muted outline marker.
- Selected: larger ring and corresponding place preview sheet.
- A place in both Been and Want to go uses the collected marker and explains both states in its preview.
- With only 30 points, do not introduce a clustering dependency initially. Overlapping markers expose “3 places here” and a small selection list.
- Pan the discovery map → “Search this area.” Panning Collection does not alter ownership.
- Provide accessible result-list access alongside maps.

Native: `react-native-maps` on iOS/Android. Web/offline: a bundled SVG LA schematic with geographically projected coordinates, pan/zoom controls, selectable markers, and matching result rows. Label it **Demo map — schematic**. There is no turn-by-turn routing claim.

### 7.3 One themed set

**Downtown Firsts:** Los Angeles Central Library, The Broad, Grand Park.

Set detail:

1. Wide cover image and serif title.
2. `1 of 3 places collected` and progress bar.
3. Owned entries with checkmarks and edition links.
4. Missing entries with “Save” and “Plan a visit.”
5. “Plan remaining places” pre-fills the planner with uncollected IDs.

Count unique owned place IDs. On first completion, show a quiet completion sheet and a set badge. A revisit does not retrigger completion; deleting and recollecting uses the same set identity.

### 7.4 Favorites and private tips

Favorite is a separate field from Want to go. Heart state appears on place detail and in the favorites collection filter.

Tip editor: place name, 280-character text, save/cancel, updated date. Example demo tip: “Leave time for the garden.” Label tips “Only you” and do not publish them to the friend feed.

Profile → Favorites and Profile → My tips reuse the same place-row and editor components.

### 7.5 Post-visit recommendation and ranking

Entry points: saved reveal, edition detail, and a collected place’s “Your recommendation.”

The flow borrows the case study’s interaction style:

1. **“Would you recommend this place?”** Three pastel circles: “Yes,” “It depends,” “Would skip.”
2. **“Compare within: Cultural places”**. Default to the place’s own category. Avoid comparing a park with a museum by default.
3. **“Which would you recommend?”** Two white outlined cards, centered “or,” plus Undo / Too close / Skip.
4. Save the visit assessment and update the current personal recommendation.

Implementation:

- Keep visit assessments separate from a place’s current personal recommendation.
- Store an ordered place-ID list per category and sentiment bucket. New entries use binary-insertion comparisons against that bucket.
- Ask at most two comparisons in the quick flow. If the position is still unresolved, insert at a deterministic location within the remaining bracket and label it **Provisional rank**; offer “Finish ranking” later.
- “Too close” records a tie. Stable IDs break display order without claiming a preference.
- Skip comparison still saves sentiment, with no fabricated decimal score.
- Re-ranking removes the place from its old position first, then inserts it once.
- Undo restores the prior comparison bounds; no persistence until Save.

Display `#3 in your cultural places` where settled, and `Unranked` or `Provisional` otherwise. Beli-style circles can carry the ordinal, but do not invent an overall 9.6 score or confuse personal ranking with appeal.

### 7.6 Dropbox import simulation

Entry: empty collection and Profile → Import memories.

Stages:

1. **Import from Dropbox** explanation: “Preview an import using sample photos.”
2. **Use demo Dropbox library** button. No login fields or fake OAuth consent.
3. Scanning screen: a fixed 12-photo fixture, cancel action, progress counts.
4. Review: 6 eligible destination groups spanning 8 new sample visits; 2 duplicate photos excluded; 1 low-confidence photo needing manual selection; 1 unsupported photo.
5. Group detail: thumbnail, proposed place, source date, confidence band explicitly labeled demo, editable date/place, selection checkbox.
6. Commit selected eligible visits once; show created editions, distinct new places, duplicates skipped, and unresolved items left out.
7. “Open collection” shows the same cards, map markers, and set progress as camera capture.

Use stable import source IDs and per-photo content hashes. Re-importing the same demo library does not add those visits again. Merge multiple photos from one proposed visit only after review; different dates at the same place become separate variants.

Preserve the review draft after cancellation or restart. Import does not infer recommendations or publish past visits to friends without an explicit action.

### 7.7 Acceptance

Filters produce identical place IDs in list and map; reset restores all entries. Completing a set requires its three unique places. Ranking can be skipped or corrected. Tips stay private. Import summaries equal the actual store mutations, including when some imported places were already collected.

## 8. Flow 3 — Discovery, geo-semantic search, and rarity

### 8.1 Discover home

Top to bottom:

1. Location control (“Los Angeles” or selected area), wordmark, planner icon.
2. Search field: **“Quiet, free cultural place near us”**.
3. Filter chips: Nearby, Free, Open now, Category.
4. **For you:** two-up photo cards with one honest reason each: “You enjoy cultural places” or “Saved by Maya.”
5. **Nearby now:** compact list with distance, sample hours, and source-aware weather.
6. **Downtown Firsts:** one set progress card.
7. **Plan an afternoon:** the shared planner entry.

A cold-start profile uses onboarding preferences and curated choices, labeled “Start exploring.” Collection and recommendation changes recalculate the same recommendation selector.

### 8.2 Search screen

Search UI has editable text, clear, recent searches, parsed filter pills, List/Map, result count, and filter sheet.

Submit with keyboard/search button; use approximately 250 ms debounce for suggestions. Keep the previous result set until the new request resolves. Reject stale responses by request ID.

Mock parser recognizes supported intent terms:

- quiet → `quiet` tag
- free / under $10 → admission budget in cents
- cultural / museum / art → cultural category or relevant tags
- near us / nearby → default radius of 8 km, shown explicitly
- open now → demo-clock hours predicate
- outdoors / garden / park → matching tags/category

Apply hard filters before ranking: category, cost, radius, hours, and explicitly requested tags. Then rank by weighted tag match, taste fit, and distance with a stable ID tie-break.

Example fixture guarantee: with the default Downtown origin, **Los Angeles Central Library** matches quiet + free + cultural + nearby. Do not return a paid interior attraction merely because its surrounding park is free.

Parsed chips are editable. Unsupported language yields “I interpreted these filters” and a way to refine manually. No results offers removing one filter; do not silently relax budget or distance.

This service models the future Elasticsearch request/response boundary but does not claim to perform semantic embedding search. Keep search logic outside screen components.

### 8.3 Three separate rarity-related signals

| Signal | UI | Data meaning |
|---|---|---|
| Personal appeal | “High for you” / “Worth a look” / “Still learning” | Derived from current preferences, recommendations, and visits |
| In-app discovery frequency | “12% of demo collectors” | Unique visitors to the place / active demo collector cohort in a stated window |
| Availability window | “Regular hours,” “Seasonal,” “Limited event,” or “Unknown” | Published/sampled access window, with dates and source |

Place detail shows three labeled rows/chips with explanatory sheets. Compact search rows prioritize appeal and current availability; frequency can remain in detail to avoid badge overload.

Do not call a place rare because its recommendation is low. Do not call it open if the hours are unknown. Frequency displays its sample size, timeframe, and demo provenance. Availability distinguishes grounds, interior admission, timed tickets, and special events.

### 8.4 Place detail interactions

Save → add to Want to go or choose a shared list. Add to plan → planner with the place as a preferred stop. Capture → capture draft with place context. View editions → own edition strip. Facts/source chips → provenance sheet.

The shared detail header and photo are identical regardless of entry point. Discovery reasons are contextual annotations below the shared identity.

### 8.5 Acceptance

The sample query produces expected matches and visible parsed filters. Manual chip edits modify results. Search and map agree. Declined location uses a labeled Downtown starting point. Unavailable hours and weather remain unknown, and unsupported query terms never generate fabricated certainty.

## 9. Flow 4 — Friends, shared wishlists, overlap, outings

### 9.1 Friends home

Header **Friends**, avatar row, and underlined **Activity | Shared lists** tabs.

- Activity: “Maya collected…” rows with avatar, destination, time, personal photo strip, and a small recommendation label if present.
- Shared lists: name, member avatars, place count, last edit, and overlap callout.
- A small **Preview friend connection** entry explains the Meta concept and loads seeded friends. It does not promise access to Meta’s real friend graph.

Friend profile: avatar, name, taste tags, sample visit/save counts, public fixture collection, matching editions. Tapping a place reuses shared place detail.

### 9.2 Shared wishlist

Default list: **Saturday with Maya**, owned by You and Maya.

Header: title, member avatars, demo badge. Rows: place name, saved-by avatars, category/cost, completed marker if explicitly marked done.

Actions:

- Add place through catalog search.
- Toggle your own save; another member’s save is not removed.
- Rename list, with local owner permissions.
- Invite → native share/copy of a demo invitation token and explanation of local-only behavior.
- “Simulate Maya joining” in demo mode updates local membership.
- “Plan together” creates a planner session with members and preferred places.

### 9.3 Overlap

Compute overlap from each member’s saved place IDs within the current shared list, not from a canned counter. The default fixtures start with two common places. Saving The Broad to **Saturday with Maya** produces:

**“You and Maya both saved these 3.”**  
“Pick a time” / **“Plan together”**

Date suggestions use the demo clock and availability fixtures, with sample labels. Do not assert that Maya is free unless the user has selected a shared availability window.

Changing a save updates the banner instantly. Removing the last overlap removes the banner and offers “Find something you both like.”

### 9.4 Group outings and matching editions

An accepted group plan creates a local `Outing` with participants and stop IDs. The outing screen shows itinerary, members, and capture buttons.

- Capture from a stop carries its outing ID and place ID.
- The user’s saved edition receives a shared stamp such as `Saturday with Maya`.
- In demo mode, “Simulate Maya confirming her visit” creates Maya’s own matching edition with the same outing/place stamp.
- Each participant keeps their own photo and note. Selecting a companion alone does not create a visit in that person’s collection.
- If another participant has not confirmed, show “Waiting for Maya’s visit,” not “Sent to Maya.”

### 9.5 Acceptance

Adding/removing a save changes actual intersection counts. Member attribution remains correct. A plan launched from the wishlist preserves members and preferences. Matching editions share an outing identity while keeping personal content separate. No network message or invite is falsely reported as delivered.

## 10. Flow 5 — Agent planner and constraint revision

### 10.1 Planner screen

Header **Plan an afternoon**, back, and saved plans link.

Suggested prompt:

> Find two experiences we’ll both like, this afternoon, $25/person.

Constraint bar:

- People: You + Maya.
- Start: Downtown Los Angeles.
- Date/time: demo Saturday, 14:00–18:00.
- Budget: $25 per person.
- Transport: walk; drive/transit alternatives use separate fixture matrices.
- Preferences: culture, parks; optional accessibility constraint.

Submitting the prompt parses supported fields into this editable bar. Unknown constraints require an explicit selection instead of being ignored.

### 10.2 Transparent planning activity

Render one compact progress list under “Building your sample plan”:

1. Matching both people’s tastes.
2. Checking sample opening windows and ticket requirements.
3. Checking sample weather.
4. Estimating travel and cost.
5. Preparing proposal.

Use cancellable staged responses totaling approximately 2–4 seconds. Expand a step to inspect the fixture values/source. These are simulated tool steps, not OpenAI calls or a display of hidden model reasoning.

### 10.3 Deterministic feasibility logic

Use a small local planner rather than canned text that can contradict the changed constraints:

1. Filter the catalog to accessible, available candidates with known fixture cost and travel coverage.
2. Score each candidate for both participants; optimize the lower of their two taste scores, with small boosts for shared saves.
3. Enumerate ordered two-stop combinations. Thirty candidates is small enough for direct evaluation.
4. Use a travel-time matrix keyed by mode and endpoint IDs, never a straight-line distance labeled as road routing.
5. Allocate travel, 10-minute arrival buffers, and configured visit durations within opening windows.
6. Include admission and stated transport costs in per-person totals. Shared vehicle costs are divided by party size with a deterministic rounding rule.
7. Apply weather suitability; prefer indoor options under the rain preset.
8. Check explicit booking requirements. Unknown access or availability blocks the “Fits your constraints” label.
9. Choose the highest-scoring valid proposal; use stable IDs to resolve ties.

Hard constraints are never silently relaxed. If no combination works, show which constraint blocks the plan and offer specific edits.

### 10.4 Default proposal fixture

All numbers below are **sample planning inputs**, not current venue advice:

| Segment | Local time | Sample assumptions |
|---|---|---|
| Start → The Broad | 14:00–14:15 | 15-minute walk from selected demo origin |
| Arrival buffer | 14:15–14:25 | 10 minutes |
| The Broad visit | 14:25–15:25 | 60-minute visit; $0 sample admission; demo access available |
| Transfer → Grand Park | 15:25–15:37 | 12-minute walk |
| Arrival buffer | 15:37–15:47 | 10 minutes |
| Grand Park visit | 15:47–16:32 | 45-minute visit; $0 sample admission |

Proposal footer: `2 experiences · 2h 32m · $0/person admission + travel · Ends 16:32`.

Meals and optional purchases are excluded and visibly labeled. The user’s finish condition is the last stop; returning to the origin requires an explicit toggle and a recalculated final leg.

### 10.5 Proposal controls

Each stop has photo, name, time, reason both people may like it, cost, access status, and source chips. Transfer legs show mode/minutes and “Estimate.”

Actions:

- **Accept plan:** one idempotent write; creates a saved plan and a group outing when applicable.
- **Change constraints:** opens editable fields with the current values.
- **Replace stop:** locks the other stop and searches feasible alternatives.
- **Why this plan?** Shows taste/save reasons and checked constraints.
- **View map:** numbered markers and a dashed schematic route.

Accepting does not make reservations. It also does not silently save every stop to every member’s wishlist; offer “Save stops to Want to go.”

### 10.6 Revisions

- Reduce budget from $25 to $10: a valid $0 plan can remain unchanged; explain that it still fits.
- Set weather to rain: replace an outdoor stop with a feasible indoor fixture, such as Central Library, and recalculate transfers/time.
- Set window to 16:30–17:00: show “Two visits don’t fit this 30-minute window” and offer one experience or a longer window.
- Mark The Broad unavailable: propose a feasible substitute or state no result.
- Change transport: recalculate every leg and cost; do not merely relabel the same itinerary.
- Remove Maya: recalculate taste reasoning for one person.

Show a small change summary: removed/added stop, total cost delta, finish-time delta, and any new warning. Preserve the prior accepted plan until the user accepts the revision. An in-flight older request cannot overwrite a newer revision.

### 10.7 Saved plan and visit mode

Profile → Plans lists upcoming/sample/completed plans.

Plan detail → **Start visit** opens itinerary plus map. “Simulate arrival” advances the visible demo clock to that stop’s scheduled arrival and enables “Capture this stop.” Completion is linked to the user’s saved edition for the corresponding outing stop, not GPS inference. Two captured stops mark the local plan completed.

### 10.8 Acceptance

Every green feasibility state corresponds to checked budget, dates, durations, hours, travel, and access. Weather and closed-place revisions remain valid. Impossible requests show a useful no-plan state. Accept/retry creates one plan; cancel does not erase the last accepted version.

## 11. Flow 6 — Data and provenance

### 11.1 Presentation

Profile → Settings → **Data sources**:

- OpenTripMap — place identity and category context.
- Los Angeles open data / Recreation and Parks — applicable park metadata.
- Open-Meteo — weather for the selected place/time.
- NPS visitation statistics — only records relevant to an actual NPS unit.
- Souvenir curated catalog — authored summaries, category mapping, sample planning inputs.

A “Voloridge / data” explanation can describe this feature area; do not invent a Voloridge API, dataset, or integration.

Each row shows `Bundled sample`, `Verified snapshot`, `Unavailable`, or `Not applicable`, plus as-of/retrieval date where meaningful.

### 11.2 Source-detail sheet

Show:

- Provider and source URL.
- Record ID, geographic scope, period, units.
- Retrieval date versus data observation date.
- Sample/snapshot status.
- What the number describes.
- “View source” link.

A snapshot is “verified” only after someone retrieves the source and records the provenance. Otherwise use sample values or an unknown state.

### 11.3 Facts and source boundaries

- Annual visitor counts must include year and geographic entity. Park-wide attendance must not be shown as building attendance.
- A non-NPS LA destination gets **NPS visitation: Not applicable**. Do not borrow Yosemite or Santa Monica Mountains unit totals to populate it.
- OpenTripMap place metadata is not automatically a reliable current-hours feed. Hours/tickets need their own curated record and source.
- Ground access and paid interior experiences may need separate experience variants/cost records.
- Seasonal windows display start/end, source, and whether the demo date lies inside the window.
- Device-derived distance is an estimate from coordinates; sample start-location distance is labeled accordingly.

### 11.4 Failure states

Source toggles are under Demo settings and explicitly say **Simulate unavailable source**.

- Weather unavailable → gray chip and “Weather not checked”; planner cannot say weather was verified.
- Hours stale → warning/as-of label, never an unconditional “Open.”
- Park facts unavailable → hide unsupported facts or show “No data”; do not show zero.
- Source record removed → keep the place and personal memories, with missing fact state.

The prototype’s baseline must not require live fetches. Provider adapters are future integration boundaries, and their schemas must be checked against official APIs when that work starts.

## 12. Fixture catalog and connected demo data

### 12.1 Thirty candidate destinations

These are real place names selected for a demo catalog. Inclusion does not assert that a site is currently open, free, accessible, or available without a reservation. Confirm coordinates and image rights during fixture authoring; label operational values as sample until verified.

| Parks / outdoors | Cultural | Landmarks |
|---|---|---|
| Griffith Park | The Broad | Walt Disney Concert Hall — exterior |
| Echo Park Lake | MOCA Grand Avenue | Bradbury Building — public areas |
| Elysian Park | Japanese American National Museum | Angels Flight |
| Grand Park | Los Angeles Central Library | Union Station |
| Los Angeles State Historic Park | California African American Museum | Olvera Street |
| Barnsdall Art Park | California Science Center | Watts Towers — exterior |
| MacArthur Park | Griffith Observatory | Hollywood Walk of Fame |
| Exposition Park Rose Garden | Autry Museum | Venice Canals |
| Lake Balboa Park | LACMA | Hollywood Bowl — exterior |
| Vista Hermosa Natural Park | Getty Center | Korean Bell of Friendship |

Use stable descriptive IDs such as `la-the-broad`. Each record needs:

- Name, category, neighborhood, coordinates, short summary.
- Bundled image asset ID and credit/license.
- Search/taste tags: quiet, indoors, outdoors, art, architecture, garden, scenic, etc.
- Structured admission/access scope and booking requirement.
- Demo weekly hours and date overrides in LA time.
- Typical sample visit duration and transport-matrix coverage.
- Source references for each factual or operational field.
- Demo discovery counts/cohort and documented/sample availability window.

### 12.2 Sample user state

- Six collected places: Central Library, Griffith Observatory, Echo Park Lake, Getty Center, Venice Canals, Union Station.
- Seven editions: Echo Park has two different visits.
- Downtown Firsts starts at **1/3** from Central Library.
- In Saturday with Maya, you have saved Grand Park and MOCA, plus one non-overlapping place.
- In that list, Maya has saved Grand Park, MOCA, and The Broad.
- Saving The Broad to that list therefore changes overlap **2 → 3**.
- Two private tips, two favorites, a few seeded category recommendations.
- No accepted plan initially.

The captured visit flow targets The Broad first and Grand Park second:

| State | Your unique places | Your editions | Downtown Firsts |
|---|---:|---:|---:|
| Initial | 6 | 7 | 1/3 |
| First Broad visit saved | 7 | 8 | 2/3 |
| First Grand Park visit saved | 8 | 9 | 3/3 |
| Later Broad revisit saved | 8 | 10 | 3/3 |

Maya’s simulated editions never increase your counts.

### 12.3 Fixture discipline

Keep all randomness out of the demo path. Use fixed sample timestamps, stable IDs, named latency/failure scenarios, and sorted tie-breaks. Put mock photos and thumbnails in the bundle, avoiding unrelated placeholder imagery.

Maintain a fixture validator: no dangling place/user/source IDs, all coordinates in valid ranges, nonnegative cents/durations, valid opening intervals, valid timezones, and set membership referencing distinct catalog IDs.

## 13. State, models, and service contracts

### 13.1 Model boundaries

| Entity | Key fields / invariant |
|---|---|
| `Place` | ID, category, coordinates, asset, tags, access variants, source references; shared catalog identity |
| `Edition` | ID, owner ID, place ID, visit instant/timezone, local media ID, companions, moment, sequence, variant, origin, optional outing ID |
| `VisitAssessment` | Edition ID, sentiment, saved-at timestamp; immutable history or explicitly editable current record |
| `PlaceRecommendation` | Owner/place ID, current assessment ID; separate from discovery appeal |
| `CategoryRanking` | Owner/category/sentiment, ordered IDs, ties, provisional IDs; each place appears once per relevant ranking |
| `Wishlist` | ID, title, owners/members, entries with saver IDs and completed-by IDs |
| `Outing` | ID, participants, accepted plan ID, stop IDs, per-participant visit confirmations |
| `Plan` | ID, version, constraints, stop/leg schedule, cost breakdown, checks, status |
| `SourceRecord` | Provider, URL, entity/scope, observed/retrieved dates, unit, sample/snapshot status, availability |
| `CaptureDraft` | Draft ID, request ID, media ID, chosen place, metadata, status, optional committed edition ID |
| `ImportDraft` | Batch ID, source photo IDs/hashes, groups, corrections, selection, per-item commit IDs |
| `UserPreferences` | Tastes, display modes, units, demo preset, onboarding completion |

Use explicit discriminated unions for states:

```ts
type Category = 'park' | 'cultural' | 'landmark';
type Sentiment = 'recommend' | 'depends' | 'skip';
type DataMode = 'sample' | 'verified-snapshot';
type CaptureStatus =
  | 'choosing-photo'
  | 'locating'
  | 'confirming'
  | 'revealing'
  | 'saving'
  | 'saved'
  | 'error';

type EvidenceValue<T> =
  | {
      status: 'known';
      value: T;
      sourceRecordId: string;
      mode: DataMode;
      observedAt: string;
    }
  | { status: 'unknown'; reason: string }
  | { status: 'not-applicable'; reason: string };
```

Money is integer cents. Store visit times as ISO instants plus IANA timezone. Hours and plan inputs use local-calendar dates in `America/Los_Angeles`; convert consistently when producing an itinerary.

### 13.2 Store and persistence

For this bounded prototype, use a typed reducer plus React context and focused selector hooks. It avoids an additional state-library dependency. Keep component-local state for transient sheet visibility, text input, and animation progress.

Persistent, versioned state:

- Editions, recommendations, category rankings.
- Saves/shared lists, favorites, tips.
- Accepted plans, outings, local activity.
- Drafts and idempotency/import tracking.
- Preferences and seed version.

Ephemeral state: search requests, loading indicators, visible sheet, selected map marker, in-flight planner output.

Use AsyncStorage for a single versioned metadata envelope. Hydrate before rendering the main navigator to avoid a flash of the wrong seed. Serialize writes through one queue, retain an explicit persistence error state, and never show “saved” until required local persistence succeeds.

Derived selectors, not persisted counters, compute:

`collectedPlaceIds`, `editionCount`, `setProgress`, `wishlistOverlap`, `recommendationOrder`, `profileStats`, `recommendationCandidates`.

Add a schema version and small migration registry. Reset should be atomic from the app’s perspective. Corrupt storage prompts “Reset demo data” while retaining recoverable media where possible.

### 13.3 Media persistence

- Native: copy accepted camera/picker media into an app-owned document directory via `expo-file-system`; persist media IDs and paths, not temporary picker URIs.
- Web: store accepted blobs in IndexedDB and recreate object URLs on hydration; revoke unused URLs.
- Bundled fixture assets use stable manifest IDs, resolved through static asset imports.
- Deletes clean up only unreferenced app-owned media. Do not delete the user’s original photo-library assets.
- Do not store image bytes in AsyncStorage or route parameters.

### 13.4 Mock-service interfaces

| Service | Input | Output / key behavior |
|---|---|---|
| `nearbyPlaces` | Coordinates, radius, categories, abort signal | Distance-sorted catalog/provider places; empty when location unavailable |
| `suggestPlace` (optional) | Media ID, nearby candidate IDs, abort signal | At most one highlighted candidate ID with real confidence, or none |
| `createCustomPlace` | Name, category, coordinates | New `userSubmitted` place ID, or existing ID when a near-duplicate is chosen |
| `searchPlaces` | Text, structured filters, origin, demo clock | Parsed intent, result IDs, match explanations |
| `getRecommendations` | Preferences, assessments, visits, saves | Ordered IDs and reason labels |
| `createEdition` | Draft ID, validated metadata | Existing or new edition ID; idempotent |
| `getSharedOverlap` | Member IDs and saves | Intersection IDs and member attribution |
| `proposePlan` | Constraints, preferences, source availability | Progress events, feasible plan or specific blockers |
| `scanImport` | Demo library ID, abort signal | Review groups, duplicates, unresolved items |
| `commitImport` | Batch ID and reviewed selections | Created/skipped IDs and totals; resumable |
| `getPlaceFacts` | Place ID | Typed evidence values with provenance |
| `getWeather` | Coordinates and interval | Known/sample or unknown weather values |

Implement shared `MockContext` with demo clock, preset, latency policy, and source state. All async interfaces support cancellation or request-token rejection. Screens consume typed results and do not inspect fixture filenames.

### 13.5 File organization

```text
src/
  app/                              route tree from section 3
  design/
    colors.ts typography.ts spacing.ts motion.ts
  components/
    ui/                             buttons, chips, sheet, toast, text
    cards/                          place, edition, set, itinerary
    map/
      PlaceMap.native.tsx
      PlaceMap.web.tsx
      SchematicMap.tsx
  features/
    capture/ collection/ discovery/ social/ planner/ import/ sources/
  domain/
    types.ts
    collection.ts rankings.ts search.ts planner.ts import.ts
  state/
    AppProvider.tsx reducer.ts actions.ts selectors.ts persistence.ts
  services/
    contracts.ts
    mock/
  fixtures/
    catalog.ts users.ts editions.ts wishlists.ts sets.ts
    hours.ts weather.ts travel.ts imports.ts sources.ts scenarios.ts
  platform/
    media.native.ts media.web.ts location.ts sharing.ts
  assets/
    fonts/ places/ avatars/ samples/ maps/ credits.json
  tests/
    fixtures.test.ts collection.test.ts rankings.test.ts
    search.test.ts planner.test.ts import.test.ts persistence.test.ts
```

Keep domain functions pure and importable by tests. Route modules assemble features and handle navigation; they do not own search scoring or duplicate detection.

## 14. Expo 57 setup and technical gates

### 14.1 Scaffold

The Expo documentation confirms that the default template includes Router and TypeScript. The npm registry checked for this plan includes SDK-57 templates. Use an explicit SDK-57 template rather than assuming `latest` will keep targeting 57.

Candidate scaffold command, pinned to releases published more than seven days before this plan:

```sh
npx create-expo-app@4.0.0 souvenir --template expo-template-default@57.0.23
```

Before executing during implementation:

1. Inspect the destination repository if one is supplied; retain its package manager and conventions.
2. Use the project’s supported Node LTS version, checking the resolved Expo/React Native engine requirements.
3. Verify the scaffolded `expo` dependency remains 57.x and retain the matching React/React Native pair.
4. Keep the generated agent/setup guidance and read it before changing structure.
5. Record the lockfile and run `npx expo install --check`.

The precise patch versions resolved by the template must be reviewed at implementation time. Avoid upgrading the framework to 58 just because a tag changes.

### 14.2 Dependencies

Install missing Expo/native packages through `expo install`, preserving existing compatible entries:

```sh
npx expo install \
  expo-camera expo-image-picker expo-image expo-location \
  expo-font expo-haptics expo-linear-gradient expo-file-system \
  react-native-maps react-native-svg \
  react-native-reanimated react-native-worklets \
  react-native-gesture-handler react-native-safe-area-context \
  @react-native-async-storage/async-storage \
  @react-native-community/datetimepicker
```

The SDK-57 Reanimated docs specify installing both Reanimated and Worklets; Babel integration comes through `babel-preset-expo`. Do not add outdated manual plugin configuration without checking the generated setup.

Use React Native `Share` for text sharing. Add image-sharing dependencies only if that later deliverable is explicitly included. Fonts are bundled files, avoiding runtime font downloads.

Add a SDK-compatible Jest Expo preset and React Native Testing Library when implementing the meaningful tests below; choose established compatible versions and commit the lockfile. Use the template’s ESLint setup.

### 14.3 App configuration

- App name: Souvenir; slug: `souvenir`; scheme: `souvenir`.
- Light appearance; portrait phone layout for the first prototype.
- Descriptive camera and photo-use permission copy.
- Foreground location only, requested on demand.
- No microphone/audio recording requirement.
- Native module config changes may require a development build; verify on the target runtime.
- Font and asset loading must complete before hiding the splash screen; show a fallback if an asset cannot load.

### 14.4 Runtime gates

| Surface | Gate |
|---|---|
| Expo Go | Check the installed Expo Go build actually supports SDK 57; do not assume compatibility from the product name |
| Native map | SDK-57 documentation lists `react-native-maps` in Expo Go; custom/store binaries using Google Maps need additional platform configuration |
| Camera | Verify on a physical device or configured emulator; demo photo remains available everywhere |
| Web | Native-only imports stay behind platform files; picker/date/keyboard behavior gets web fallbacks |
| Offline | Bundled assets + schematic map allow the full mock loop without provider/network access |
| iOS | Use an iOS device or simulator for validation; Android/web alone do not establish iOS correctness |

Baseline commands to define/use:

```sh
npx expo install --check
npx expo-doctor
npm run lint
npm run typecheck
npm test -- --runInBand
npx expo export --platform web
```

Define `typecheck` as `tsc --noEmit` and `test` as Jest if the scaffold does not already provide them. Keep existing scripts if starting in an established repository.

## 15. Implementation order and delivery gates

These are dependency-ordered work packages, not separate human sprints. A reasonable Devin estimate is **one substantial implementation session plus one integration/visual-polish session**, with a possible additional session if native environment setup or device testing needs it. External approvals or provider provisioning are outside that estimate.

| Package | Concrete implementation | Depends on | Done when |
|---|---|---|---|
| A — App and visual shell | Scaffold; tokens; bundled fonts; screen/header/buttons; center capture tab; route skeletons | None | All five destinations navigate; one reference screen matches Beli hierarchy at 390-point width |
| B — Catalog and state | Thirty places; asset manifest; users; sources; persistence; reducer; derived selectors; demo settings | A | Restart preserves a save; sample/empty reset works; fixture validator passes |
| C — Browse and save | Discover; search parsing/filtering; shared place detail; save picker; native/web map adapters | B | Example search and List/Map use the same IDs; save updates Want to go everywhere |
| D — Capture to collection | Device/sample photo; confirmation; reveal; media storage; idempotent edition write; collection views | B, C | The Broad changes 6/7 to 7/8 exactly once and survives restart |
| E — Sets and recommendations | Downtown Firsts; edition editing; favorites/tips; sentiment and bounded ranking | D | Set changes 1/3 → 2/3 → 3/3; ranking and deletion invariants hold |
| F — Shared planning context | Friends; shared list membership; overlap; outing model | B, C | Saving The Broad changes the Maya overlap from 2 to 3 |
| G — Planner and visit | Constraint UI; feasibility engine; progress; revisions; saved plan; arrival/capture linking | C, F, D | Valid plan accepts once, rain revises, impossible window explains failure |
| H — Complete dummy feature map | Import review/dedup; matching editions; source states; fuller friend/profile UI | E, F, G | Empty profile import and group outing work through the same store |
| I — Quality and handoff | Permission/error cases; accessibility; offline mode; visual pass; run instructions; recorded acceptance when approved | A–H | All P0/P1 acceptance rows pass or an explicit untested platform is documented |
| J — Extension previews | Diorama, city picker, booking concept | I | Each entry opens an honest preview and returns without mutating real-world state |

Create the core PR after basic lint/type checks and the first connected loop pass. Expand it with focused commits for the remaining packages, keep its description current, and review any automated feedback. Do not wait for the extension previews to make the core reviewable.

Potential concurrency after shared contracts stabilize: search/map and collection presentation can be built independently; social and planner presentation can follow their shared model. If using multiple sessions later, agree on tokens, routes, and data contracts first so each does not invent a different navigation system.

### 15.1 Per-package review material

- **A:** Discover, Collection, place-detail reference frames.
- **D/E:** Capture → save → recommendation → updated set.
- **F/G:** Overlap → planner → revision → accepted outing.
- **H:** Empty profile → import review → populated album, plus source-unavailable state.
- **I:** Final connected demo and explicit platform coverage.

These are implementation deliverables to produce later, not claims that those screens or checks already exist.

## 16. Quality plan and acceptance matrix

### 16.1 Automated tests worth writing

Focus on meaningful state and domain behavior rather than asserting every static label:

1. Edition creation is idempotent by draft/request ID.
2. Distinct visits increase edition count; revisits leave unique-place/set counts unchanged.
3. Deleting the last edition removes visit-derived recommendation/ranking state but retains explicit saves/tips/favorites.
4. Ranking inserts within a category/sentiment bucket, handles ties, undo, and provisional positions.
5. Import deduplication works across batches and partial retries.
6. Filters, radius, cost, and availability produce deterministic results and never silently relax constraints.
7. Source unknown/stale state propagates to facts and planner feasibility.
8. Planner arithmetic covers transfer time, buffers, opening windows, party costs, timezone conversion, and optional return travel.
9. Infeasible plans produce blockers; revision does not mutate the prior accepted plan.
10. Shared save attribution and overlap remain correct when one member removes a save.
11. Hydration/migration preserves valid state; corruption and failed writes surface recovery UI.
12. Outing matches join the correct place/participants without increasing the wrong user’s counts.

Add a small number of interaction tests for confirmation validation, repeated Save taps, filter sheets, and asynchronous request cancellation.

### 16.2 UI-driven acceptance cases

| ID | Scenario | Expected result |
|---|---|---|
| Q01 | Launch sample mode | 30 catalog places; your collection shows 6 places / 7 editions |
| Q02 | Launch empty mode | Useful empty state with Capture, Discover, Import actions |
| Q03 | Enter quiet/free/cultural query | Parsed chips visible; expected Central Library fixture appears |
| Q04 | Deny location | Labeled Downtown origin; search still works |
| Q05 | Toggle List/Map and select a pin | Same IDs; selected place opens correctly |
| Q06 | Save The Broad to Saturday with Maya | Want to go updates; shared-list overlap changes 2 → 3 |
| Q07 | Open shared planner | Maya, saved places, and selected time carried into constraints |
| Q08 | Submit default prompt | Feasible two-stop sample itinerary with correct cost/time totals |
| Q09 | Lower budget to $10 | Free plan remains valid; no forced arbitrary change |
| Q10 | Enable rain | Outdoor stop revised or a clear infeasibility explanation |
| Q11 | Restrict to 30 minutes | No false feasible two-stop result |
| Q12 | Accept plan twice quickly | One plan and one associated outing |
| Q13 | Deny camera / cancel picker | Sample/manual paths remain available; no lost draft |
| Q14 | Correct identification | Saved edition belongs to the manually confirmed destination |
| Q15 | Capture Broad from outing | 7 places / 8 editions; set 2/3 |
| Q16 | Save Grand Park stop | 8 places / 9 editions; set 3/3; plan complete |
| Q17 | Advance demo date; revisit Broad | 8 places / 10 editions; set remains 3/3 |
| Q18 | Recommend, compare, undo, skip | Sentiment/rank obey choices; no fabricated decimal score |
| Q19 | Simulate Maya confirming | Linked stamp; separate photo; your counters unchanged |
| Q20 | Delete your only edition of a place | Been/set/recommendation update; saves remain |
| Q21 | Import review then re-import | Correct counts; repeated source photos do not duplicate |
| Q22 | Source unavailable | Unknown state visible; no zero-as-missing or false verification |
| Q23 | Restart after edits | Photos, moments, saved plan, lists, and filters restore |
| Q24 | Interrupt async flow then navigate back | No stale modal, late overwrite, or duplicate write |
| Q25 | Disable network | Sample core loop works; map shows schematic fallback |
| Q26 | Large text / reduced motion / screen reader | Usable labels/order, no clipped core controls, reduced-motion reveal |
| Q27 | Open invalid/deleted deep link | Friendly unavailable view and working return action |
| Q28 | Open all extension previews | Clear preview labels; cancellation works; no purchase/connect claim |

Run Q01–Q25 on the primary native target and the web preview where supported. Validate permissions/camera on native hardware or a suitable simulator. Record iOS versus Android coverage independently.

### 16.3 Visual acceptance

At 390 × 844 and one narrow phone width:

- White screen backgrounds; teal controls; serif headings; sans metadata.
- Same type hierarchy and row density across Discover, Collection, Friends, and Profile.
- No clipped wordmark, hidden sticky actions, or tab overlap.
- Place names can wrap to two lines; metadata remains readable.
- Sheets leave a visible close/back affordance with the keyboard open.
- Photo ratios and card radii are consistent.
- Set progress, timestamps, counts, and badge meanings agree between screens.
- Reveal looks like the same app rather than a separate visual theme.

Check contrast programmatically for tokens used as foreground/background pairs. Review VoiceOver/TalkBack names and announcements for key transitions, especially saved editions and revised plans.

## 17. Script for the final connected demonstration

Target approximately 4–6 minutes using sample media. This becomes the acceptance recording when implementation and UI testing are authorized.

1. Reset to Sample. Open Collection: **6 places / 7 editions**, Downtown Firsts **1/3**.
2. Discover → enter the quiet/free/cultural query. Show parsed filters and Central Library; switch to map.
3. Open The Broad from Discover, inspect the three separate signals, and save it to **Saturday with Maya** using the list picker.
4. Friends → Saturday with Maya. Show overlap **3** and start “Plan together.”
5. Generate the two-stop afternoon plan. Show budget/time/source details.
6. Revise to rain, inspect the changed itinerary, then restore the clear-weather fixture and accept.
7. Start visit, simulate arrival, capture the Broad sample, correct/confirm metadata, and reveal.
8. Save and recommend. Open Collection: **7 / 8**, set **2/3**.
9. Capture Grand Park from the outing. Set reaches **3/3** and plan completes.
10. Simulate Maya confirming: matching outing editions appear with independent personal content.
11. Advance the demo clock to the next day and capture Broad again: **8 / 10**, set still complete.
12. Restart and show persistence.

Separate short demonstrations:

- Empty preset → Dropbox sample review → selected editions → album/map.
- Hours/weather unavailable → facts and planner show honest unknown states.
- Camera denied, impossible itinerary, reduced-motion reveal.

## 18. Extension previews

### 18.1 Single-image diorama

Edition menu → **Diorama preview**. Show the personal photo on three layered planes with a small drag-controlled parallax effect, reset button, and label “2.5D preview — generated 3D is not connected.”

Use Reanimated transforms; no new renderer or sensor dependency in the core prototype. A future true image-to-3D integration needs a job model, progress/failure states, stored model asset, and a supported renderer. Do not call layered images a generated 3D model.

### 18.2 Worldwide

City selector → Los Angeles active; two or three other cities shown as preview rows. Selecting one opens an explanation and a “Back to Los Angeles” action, rather than relabeling LA fixtures as another city.

Future implementation must add timezone, locale, currency, source coverage, and geospatial indexing per city. Do not encode LA assumptions directly in reusable screen components.

### 18.3 Visa booking

Saved plan → **Booking preview** for a sample bookable experience. Show date, party size, sample total, cancellation-copy placeholder, and “Payment integration not connected.”

Offer Close and Return to plan. No card input, authorization, reservation, “Paid” toast, or confirmation number. A future booking feature must validate actual inventory/prices and use the chosen authorized payment/booking integration.

## 19. Definition of complete

The dummy UI is complete when:

- All P0 and P1 screens are navigable and every visible action has a meaningful result or explicitly labeled preview.
- One state model drives the entire core loop, with the section-12 counter transitions verified.
- The Beli-style visual system is applied consistently, including sheets, maps, and errors.
- Local persistence includes media and survives a normal restart.
- Async retries, duplicate saves, imports, and plan acceptance are safe to repeat.
- Search and planner outcomes respond to actual fixture constraints.
- Source facts and all simulated external activity are clearly attributed.
- Lint, typecheck, domain tests, fixture validation, and web export pass.
- Native and web UI coverage, any untested platform, and known limitations are documented.
- The repository has concise run/reset instructions and the chosen SDK-57 lockfile.
- Reviewable code, demo instructions, and approved UI-testing evidence are handed over.

### Reference links

- [Expo create-expo-app](https://docs.expo.dev/more/create-expo/)
- [Expo SDK 57 reference](https://docs.expo.dev/versions/v57.0.0/)
- [SDK 57 react-native-maps](https://docs.expo.dev/versions/v57.0.0/sdk/map-view/)
- [SDK 57 Reanimated / Worklets](https://docs.expo.dev/versions/v57.0.0/sdk/reanimated/)
- [Expo default-template registry](https://registry.npmjs.org/expo-template-default)
- [Beli product screenshots](https://apps.apple.com/us/app/beli/id1478375386)
- [Beli redesign case study](https://medium.com/@aw766/redesigning-beli-what-do-you-find-yummy-1fad45a7cbcc)

**Planning assumptions:** The pasted feature map and researched references are the inputs. The earlier mentioned “full version” attachment was not available. No backend behavior, device validation, or live provider data has been implemented or verified as part of this planning deliverable.
