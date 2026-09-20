// Generates the Souvenir icon set: public/icon.svg (app mark), public/icons/*.svg
// (24px outline glyphs) and docs/design/icons.svg (preview sheet).
// Run: node scripts/build-icons.mjs
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const BRAND = "#144F5D";
const STROKE = 1.5;

// 24-unit grid, 1.5 stroke, round caps/joins. Shapes are [tag, attrs] tuples.
const glyphs = {
  // Primary navigation
  discover: {
    group: "Navigation",
    label: "Discover",
    shapes: [
      ["circle", { cx: 12, cy: 12, r: 9 }],
      ["path", { d: "M14.6 9.4 13 13l-3.6 1.6L11 11Z" }],
    ],
  },
  collection: {
    group: "Navigation",
    label: "Collection",
    shapes: [
      ["rect", { x: 8, y: 3, width: 12, height: 15, rx: 2 }],
      ["path", { d: "M4 8v11a2 2 0 0 0 2 2h11" }],
    ],
  },
  capture: {
    group: "Navigation",
    label: "Capture",
    shapes: [
      ["rect", { x: 3, y: 7, width: 18, height: 13, rx: 2.5 }],
      ["circle", { cx: 12, cy: 13.5, r: 3.5 }],
      ["path", { d: "M9 7l1.3-2.3h3.4L15 7" }],
    ],
  },
  friends: {
    group: "Navigation",
    label: "Friends",
    shapes: [
      ["circle", { cx: 9, cy: 8, r: 3.5 }],
      ["path", { d: "M3 20a6 6 0 0 1 12 0" }],
      ["path", { d: "M15 5.2a3.5 3.5 0 0 1 0 5.6" }],
      ["path", { d: "M21 20a6 6 0 0 0-4-5.7" }],
    ],
  },
  profile: {
    group: "Navigation",
    label: "Profile",
    shapes: [
      ["circle", { cx: 12, cy: 8, r: 4 }],
      ["path", { d: "M5 20a7 7 0 0 1 14 0" }],
    ],
  },
  plus: {
    group: "Navigation",
    label: "Capture action",
    shapes: [["path", { d: "M12 5v14M5 12h14" }]],
  },

  // Places and memories
  place: {
    group: "Places & memories",
    label: "Place",
    shapes: [
      ["path", { d: "M12 21c-4.6-4.7-7-8.3-7-11a7 7 0 0 1 14 0c0 2.7-2.4 6.3-7 11Z" }],
      ["circle", { cx: 12, cy: 10, r: 2.5 }],
    ],
  },
  edition: {
    group: "Places & memories",
    label: "Edition",
    shapes: [
      ["rect", { x: 5, y: 3, width: 14, height: 18, rx: 2 }],
      ["path", { d: "M12 8l1 2.6 2.6 1-2.6 1L12 15.2l-1-2.6-2.6-1 2.6-1Z" }],
    ],
  },
  set: {
    group: "Places & memories",
    label: "Themed set",
    shapes: [
      ["rect", { x: 3.5, y: 8, width: 17, height: 12, rx: 2 }],
      ["path", { d: "M7 8V6a1 1 0 0 1 1-1h8a1 1 0 0 1 1 1v2" }],
    ],
  },
  reveal: {
    group: "Places & memories",
    label: "Reveal",
    shapes: [["path", { d: "M12 3l2.2 6.8L21 12l-6.8 2.2L12 21l-2.2-6.8L3 12l6.8-2.2Z" }]],
  },
  photo: {
    group: "Places & memories",
    label: "Photo",
    shapes: [
      ["rect", { x: 3, y: 5, width: 18, height: 14, rx: 2 }],
      ["circle", { cx: 8.5, cy: 9.5, r: 1.5 }],
      ["path", { d: "M21 15.5l-5-5-9 8.5" }],
    ],
  },
  revisit: {
    group: "Places & memories",
    label: "Return visit",
    shapes: [
      ["path", { d: "M4 12a8 8 0 1 0 2.3-5.7" }],
      ["path", { d: "M4 4v4.5h4.5" }],
    ],
  },

  // Recommendation sentiment (pair with positive / neutral / negative fills)
  recommend: {
    group: "Recommendation",
    label: "Recommend",
    shapes: [
      ["circle", { cx: 12, cy: 12, r: 9 }],
      ["path", { d: "M8 12.5l2.5 2.5L16 9.5" }],
    ],
  },
  depends: {
    group: "Recommendation",
    label: "It depends",
    shapes: [
      ["circle", { cx: 12, cy: 12, r: 9 }],
      ["path", { d: "M8 12.5c1.3-1.6 2.7-1.6 4 0s2.7 1.6 4 0" }],
    ],
  },
  skip: {
    group: "Recommendation",
    label: "Would skip",
    shapes: [
      ["circle", { cx: 12, cy: 12, r: 9 }],
      ["path", { d: "M8 12h8" }],
    ],
  },

  // Rarity signals (kept as three separate signals)
  appeal: {
    group: "Rarity signals",
    label: "Appeal",
    shapes: [
      [
        "path",
        { d: "M12 20s-7-4.5-7-9.6A3.9 3.9 0 0 1 12 8a3.9 3.9 0 0 1 7 2.4C19 15.5 12 20 12 20Z" },
      ],
    ],
  },
  frequency: {
    group: "Rarity signals",
    label: "Frequency",
    shapes: [["path", { d: "M3 12h4l2.5-6 4 12L16 12h5" }]],
  },
  window: {
    group: "Rarity signals",
    label: "Window",
    shapes: [
      ["circle", { cx: 12, cy: 12, r: 9 }],
      ["path", { d: "M12 7v5l3 2" }],
    ],
  },

  // Social and planning
  wishlist: {
    group: "Social & planning",
    label: "Want to go",
    shapes: [["path", { d: "M7 3h10v18l-5-3.6L7 21Z" }]],
  },
  "shared-list": {
    group: "Social & planning",
    label: "Shared list",
    shapes: [
      ["path", { d: "M9 3h10v18l-5-3.6L9 21Z" }],
      ["path", { d: "M5 6v13" }],
    ],
  },
  outing: {
    group: "Social & planning",
    label: "Outing",
    shapes: [
      ["circle", { cx: 6, cy: 18, r: 2.5 }],
      ["circle", { cx: 18, cy: 6, r: 2.5 }],
      ["path", { d: "M8 16.2C11 14 13 11 16.2 8" }],
    ],
  },
  plan: {
    group: "Social & planning",
    label: "Plan",
    shapes: [
      ["rect", { x: 3.5, y: 5, width: 17, height: 15, rx: 2 }],
      ["path", { d: "M3.5 10h17M8 3v4M16 3v4" }],
      ["circle", { cx: 12, cy: 15, r: 1.25, fill: "currentColor", stroke: "none" }],
    ],
  },
  overlap: {
    group: "Social & planning",
    label: "Overlap",
    shapes: [
      ["circle", { cx: 9, cy: 12, r: 6 }],
      ["circle", { cx: 15, cy: 12, r: 6 }],
    ],
  },
  import: {
    group: "Social & planning",
    label: "Import",
    shapes: [
      ["path", { d: "M7 16.5a4.25 4.25 0 0 1-.5-8.5 6 6 0 0 1 11.6 1.6A3.5 3.5 0 0 1 17.5 16.5" }],
      ["path", { d: "M12 11.5V21m-3-3 3 3 3-3" }],
    ],
  },

  // Views and utilities
  map: {
    group: "Utility",
    label: "Map view",
    shapes: [
      ["path", { d: "M3 6.5l6-2.5 6 2.5 6-2.5v13.5l-6 2.5-6-2.5-6 2.5Z" }],
      ["path", { d: "M9 4v13.5M15 6.5V20" }],
    ],
  },
  list: {
    group: "Utility",
    label: "List view",
    shapes: [
      ["path", { d: "M9 6h12M9 12h12M9 18h12" }],
      ["path", { d: "M4 6h.01M4 12h.01M4 18h.01" }],
    ],
  },
  grid: {
    group: "Utility",
    label: "Album view",
    shapes: [
      ["rect", { x: 3.5, y: 3.5, width: 7, height: 7, rx: 1.5 }],
      ["rect", { x: 13.5, y: 3.5, width: 7, height: 7, rx: 1.5 }],
      ["rect", { x: 3.5, y: 13.5, width: 7, height: 7, rx: 1.5 }],
      ["rect", { x: 13.5, y: 13.5, width: 7, height: 7, rx: 1.5 }],
    ],
  },
  search: {
    group: "Utility",
    label: "Search",
    shapes: [
      ["circle", { cx: 10.5, cy: 10.5, r: 6.5 }],
      ["path", { d: "M20 20l-4.8-4.8" }],
    ],
  },
  filter: {
    group: "Utility",
    label: "Filters",
    shapes: [
      ["path", { d: "M4 7h10M18 7h2M4 17h4M12 17h8" }],
      ["circle", { cx: 16, cy: 7, r: 2 }],
      ["circle", { cx: 10, cy: 17, r: 2 }],
    ],
  },
  share: {
    group: "Utility",
    label: "Share",
    shapes: [["path", { d: "M12 3v12M8 7l4-4 4 4M5 12v8h14v-8" }]],
  },
  settings: {
    group: "Utility",
    label: "Settings",
    shapes: [
      ["circle", { cx: 12, cy: 12, r: 3 }],
      [
        "path",
        {
          d: "M12 3v2.5M12 18.5V21M3 12h2.5M18.5 12H21M5.6 5.6l1.8 1.8M16.6 16.6l1.8 1.8M5.6 18.4l1.8-1.8M16.6 7.4l1.8-1.8",
        },
      ],
    ],
  },
  check: { group: "Utility", label: "Check", shapes: [["path", { d: "M5 12.5l4.5 4.5L19 7" }]] },
  close: { group: "Utility", label: "Close", shapes: [["path", { d: "M6 6l12 12M18 6 6 18" }]] },
  back: { group: "Utility", label: "Back", shapes: [["path", { d: "M14 5l-7 7 7 7M7 12h14" }]] },
  chevron: { group: "Utility", label: "Chevron", shapes: [["path", { d: "M9 5l7 7-7 7" }]] },
  more: {
    group: "Utility",
    label: "More",
    shapes: [["path", { d: "M5 12h.01M12 12h.01M19 12h.01" }]],
  },
};

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;");

const attrs = (o) =>
  Object.entries(o)
    .map(([k, v]) => `${k}="${v}"`)
    .join(" ");

function glyphBody(shapes) {
  return shapes.map(([tag, a]) => `  <${tag} ${attrs(a)}/>`).join("\n");
}

function iconSvg(shapes, { stroke = STROKE, color = "currentColor" } = {}) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="${stroke}" stroke-linecap="round" stroke-linejoin="round">
${glyphBody(shapes)}
</svg>
`;
}

// App mark: a collectible place card with a pin — the Souvenir loop in one shape.
const MARK = `<g fill="none" stroke="#ffffff" stroke-width="26" stroke-linecap="round" stroke-linejoin="round">
    <rect x="146" y="106" width="220" height="300" rx="30"/>
    <path d="M256 314c-40-42-60-70-60-96a60 60 0 1 1 120 0c0 26-20 54-60 96Z"/>
    <circle cx="256" cy="216" r="20"/>
    <path d="M200 360h112"/>
  </g>`;

function appIcon({ maskable = false } = {}) {
  const card = maskable ? "" : ` rx="112"`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect width="512" height="512"${card} fill="${BRAND}"/>
  ${MARK}
</svg>
`;
}

// Glyph only, transparent background, optionally scaled about the center
// (Android adaptive foregrounds keep content inside the middle 66%).
function markOnly({ scale = 1 } = {}) {
  const t = 256 - 256 * scale;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <g transform="translate(${t} ${t}) scale(${scale})">
  ${MARK}
  </g>
</svg>
`;
}

function solid() {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect width="512" height="512" fill="${BRAND}"/>
</svg>
`;
}

function previewSheet() {
  const groups = [...new Set(Object.values(glyphs).map((g) => g.group))];
  const cell = 96;
  const cols = 8;
  let y = 150;
  const parts = [];
  for (const group of groups) {
    const names = Object.keys(glyphs).filter((n) => glyphs[n].group === group);
    parts.push(
      `<text x="48" y="${y}" font-family="Georgia, 'Playfair Display', serif" font-size="20" font-weight="700" fill="${BRAND}">${esc(group)}</text>`,
    );
    y += 24;
    names.forEach((name, i) => {
      const cx = 48 + (i % cols) * cell;
      const cy = y + Math.floor(i / cols) * (cell + 10);
      parts.push(
        `<g transform="translate(${cx} ${cy})">
  <rect width="72" height="72" rx="12" fill="#ffffff" stroke="#EDEDED"/>
  <g transform="translate(20 20)" fill="none" stroke="${BRAND}" stroke-width="${STROKE}" stroke-linecap="round" stroke-linejoin="round">
    <g transform="scale(1.3333)">
${glyphBody(glyphs[name].shapes)}
    </g>
  </g>
  <text x="36" y="90" text-anchor="middle" font-family="Inter, system-ui, sans-serif" font-size="11" fill="#626262">${esc(glyphs[name].label)}</text>
</g>`,
      );
    });
    y += Math.ceil(names.length / cols) * (cell + 10) + 36;
  }

  // Sentiment pairing + active-tab treatment examples
  const sentiment = [
    ["recommend", "#66B28C"],
    ["depends", "#F7E1A5"],
    ["skip", "#F0B4B4"],
  ];
  parts.push(
    `<text x="48" y="${y}" font-family="Georgia, 'Playfair Display', serif" font-size="20" font-weight="700" fill="${BRAND}">Usage: sentiment fills, active tab, capture button</text>`,
  );
  y += 24;
  sentiment.forEach(([name, fill], i) => {
    parts.push(`<g transform="translate(${48 + i * cell} ${y})">
  <rect width="72" height="72" rx="12" fill="#ffffff" stroke="#EDEDED"/>
  <circle cx="36" cy="36" r="18" fill="${fill}" fill-opacity="0.35" stroke="${fill}" stroke-width="2"/>
  <g transform="translate(20 20) scale(1.3333)" fill="none" stroke="#212121" stroke-width="${STROKE}" stroke-linecap="round" stroke-linejoin="round">
${glyphBody(glyphs[name].shapes.slice(1))}
  </g>
</g>`);
  });
  ["discover", "collection", "friends", "profile"].forEach((name, i) => {
    parts.push(`<g transform="translate(${48 + (i + 3) * cell} ${y})">
  <rect width="72" height="72" rx="12" fill="#ffffff" stroke="#EDEDED"/>
  <g transform="translate(20 20) scale(1.3333)" fill="${BRAND}" fill-opacity="0.12" stroke="${BRAND}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
${glyphBody(glyphs[name].shapes)}
  </g>
</g>`);
  });
  parts.push(`<g transform="translate(${48 + 7 * cell} ${y})">
  <rect width="72" height="72" rx="12" fill="#ffffff" stroke="#EDEDED"/>
  <circle cx="36" cy="36" r="24" fill="${BRAND}"/>
  <g transform="translate(20 20) scale(1.3333)" fill="none" stroke="#ffffff" stroke-width="2" stroke-linecap="round">
${glyphBody(glyphs.plus.shapes)}
  </g>
</g>`);
  y += cell + 40;

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 840 ${y}" width="840" height="${y}" font-family="Inter, system-ui, sans-serif">
  <rect width="840" height="${y}" fill="#F5F5F7"/>
  <g transform="translate(48 36) scale(0.14)">
${appIcon().replace(/<\/?svg[^>]*>/g, "")}
  </g>
  <text x="140" y="66" font-family="Georgia, 'Playfair Display', serif" font-size="30" font-weight="800" fill="${BRAND}">souvenir</text>
  <text x="140" y="90" font-size="13" fill="#626262">Icon set · 24px grid · 1.5px stroke · round caps · single brand color ${BRAND}</text>
  <text x="140" y="108" font-size="13" fill="#626262">App mark: a collectible place card with a pin. Sentiment fills only for recommendations.</text>
${parts.join("\n")}
</svg>
`;
}

const root = new URL("..", import.meta.url).pathname;
const iconsDir = join(root, "public", "icons");
mkdirSync(iconsDir, { recursive: true });
mkdirSync(join(root, "docs", "design"), { recursive: true });

for (const [name, glyph] of Object.entries(glyphs)) {
  writeFileSync(join(iconsDir, `${name}.svg`), iconSvg(glyph.shapes));
}
writeFileSync(join(root, "public", "icon.svg"), appIcon());
writeFileSync(join(root, "public", "icon-maskable.svg"), appIcon({ maskable: true }));
writeFileSync(join(root, "docs", "design", "icons.svg"), previewSheet());

// Expo sources; rasterized to apps/mobile/assets/images by scripts/rasterize-mobile-icons.sh
const mobileDir = join(root, "apps", "mobile", "assets", "icon-src");
mkdirSync(mobileDir, { recursive: true });
writeFileSync(join(mobileDir, "icon.svg"), appIcon({ maskable: true }));
writeFileSync(join(mobileDir, "android-foreground.svg"), markOnly({ scale: 0.72 }));
writeFileSync(join(mobileDir, "android-background.svg"), solid());
writeFileSync(join(mobileDir, "mark.svg"), markOnly());
const iosAssets = join(root, "apps", "mobile", "assets", "expo.icon", "Assets");
mkdirSync(iosAssets, { recursive: true });
writeFileSync(join(iosAssets, "souvenir-mark.svg"), markOnly());
console.log(`Wrote ${Object.keys(glyphs).length} glyphs, app icons and docs/design/icons.svg`);
