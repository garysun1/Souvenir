# Beli UI — Style Notes

Sources: Beli App Store listing (current screenshots) + Audrey Wu's "Redesigning Beli" case study (Medium, Sep 2024), which includes a reconstructed Beli UI kit.

## 1. Brand & color
- One dominant brand color: deep teal/petrol **#144F5D**. Used for the logo, primary buttons, selected segment, active tab icon, filled pills, and all headline text. Almost nothing else is saturated.
- Everything else is white + a cool gray scale: #212121 text, #808080 secondary, #C2C2C2 / #D7D7D7 borders, #EDEDED / #F5F5F7 surfaces.
- Semantic pastels, used only for scores/sentiment: green **#66B28C** (liked / high score), yellow **#F7E1A5** (fine / mid), pink **#F0B4B4** → red **#DE6A6B** (didn't like / low). Map pins and score bubbles are colored with this same scale.
- Marketing/App Store background uses the teal with a lighter teal wave + dusty mauve blobs; the app itself is white-first.

## 2. Typography (two-font system)
- **Playfair Display** (serif) for brand + section headers only: "beli" wordmark (Extrabold 25), "Lists" page header (Black 29), restaurant names in lists (Bold 16). Gives the "notebook / spreadsheet" personality.
- **Inter** (sans) for everything functional: rank display Bold 16, list titles Bold 15, search text Semibold 15, meta/distance Medium 13, tab labels Regular 10.
- Strong contrast between serif display and small sans meta is the signature look — copy this pairing.

## 3. Layout & spacing
- Spacing scale: 12 / 18 / 26 / 35 / 40 px.
- Dense, list-first screens. Ranked list rows: number + serif name, then one gray meta line (`$$ | Japanese, Sushi`), then location; a circular score bubble (outlined, colored by score, e.g. `9.6`) right-aligned; distance in tiny gray text.
- Header pattern: left back/user name, centered serif "beli" logo, right share + "…" icons.
- Sub-navigation is text tabs with an underline (`Been | Want to Try | Recs | More`), sitting under a **pill segmented control** (`☰ List | ⌖ Map`) with a filled teal active state.
- Filter row: horizontally scrolling outlined pill chips with chevrons (`Filters`, `Restaurants ▾`, `City ▾`, `Cuisine ▾`, `Sort by: Score ▾`), plus a floating "Search Here" pill on the map.
- Bottom tab bar, 5 items: Feed, Your Lists, **Search (center, filled teal circle +)**, Leaderboard, Profile. Center-action tab is a strong pattern to reuse for Souvenir's Capture.

## 4. Components worth cloning
- **Score bubble**: 32px circle, 1.5px stroke, color from the green→yellow→red scale, number inside. Also used as map markers (clusters of colored circles with scores).
- **Featured list cards**: 2-up image cards with dark gradient overlay, white serif title ("Top 10 Williamsburg NYC"), tiny progress caption ("You've been to 1 of 10"). Directly maps to Souvenir "themed sets".
- **Profile stats**: avatar centered, @handle, member since, a quote, outlined "Edit profile" pill; 3-column stats (Followers / Following / #Rank on Beli); then a plain list of rows with icons and counts (Been 951 ›, Want to Try 660 ›, Recs for You ›); 2 stat tiles (Rank #151, Current Streak 30 weeks 🔥).
- **Feed rows**: avatar + "Christina ranked Misi" + neighborhood, score bubble right; horizontal strip of food thumbnails with "+2" overflow; "Favorite dishes:" caption.
- **Ranking flow (stacked bottom sheets)**: after "Add to my list of [Restaurants ▾]" → "How was it?" with three big pastel circles (I liked it! / It was fine / I didn't like it) → "Which do you prefer?" pairwise comparison with two outlined cards and a teal "OR" badge, plus `Undo`, `Too tough`, `Skip` actions. The case study adds a "Rank by: [Cuisine ▾]" chooser (Cuisine / Price / Location / Ambiance / Service pills). Excellent template for Souvenir's post-visit "would you recommend?" ranking.
- Success toast: dark bar at bottom "MIX ranked!" with score chip + "Share" link.

## 5. Iconography & imagery
- Thin 1.5px outline icons (mail, bell, people, calendar w/ dot, list, trophy, bookmark, camera, fork/knife, check, heart, grid, share, flame, moon). Filled variants only for active tab.
- Real food photography in square/rounded-8 thumbnails; no illustrations inside the app.
- Corner radii: pills fully rounded; cards ~12px; thumbnails ~8px.

## 6. Overall feel / what to borrow for Souvenir
- "Goodreads for restaurants": utilitarian, list/ranking-centric, competitive (leaderboard, streaks, global rank), social feed of friends' rankings.
- Borrow: single teal-like brand color + pastel sentiment scale, serif/sans pairing, pill segmented List|Map toggle, score bubbles as map markers, center "+" tab, 2-up set cards with completion captions, stacked bottom-sheet ranking flow, streak/rank stat tiles.
- Differentiate: Souvenir's collectible cards/reveal need more visual richness (foil, gradients, animation) than Beli's flat white lists — keep Beli's structure but let the card layer be the "hero".
