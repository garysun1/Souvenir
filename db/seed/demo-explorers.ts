import { createHash } from "node:crypto";
import type { TasteInterest } from "../../shared/memories-contract";

type DemoExplorer = {
  handle: string;
  name: string;
  city: string;
  title: string;
  interests: TasteInterest[];
  visits: string[];
};

export const demoExplorers: DemoExplorer[] = [
  {
    handle: "demo_maya_gardens",
    name: "Maya Chen",
    city: "Pasadena",
    title: "Garden paths and quiet courtyards",
    interests: ["gardens", "parks", "photography"],
    visits: ["descanso-gardens", "the-getty-center", "venice-canals"],
  },
  {
    handle: "demo_leo_architecture",
    name: "Leo Torres",
    city: "Los Angeles",
    title: "A city told through its buildings",
    interests: ["architecture", "history", "art"],
    visits: [
      "union-station",
      "walt-disney-concert-hall",
      "the-getty-center",
      "griffith-observatory",
    ],
  },
  {
    handle: "demo_priya_food",
    name: "Priya Shah",
    city: "Los Angeles",
    title: "Market mornings and neighborhood flavors",
    interests: ["street_food", "markets", "local_food"],
    visits: [
      "grand-central-market",
      "smorgasburg-la",
      "mariscos-jalisco",
      "philippe-the-original",
      "howlin-rays",
    ],
  },
  {
    handle: "demo_noah_trails",
    name: "Noah Brooks",
    city: "Burbank",
    title: "One more trail before sunset",
    interests: ["hiking", "scenic_views", "parks"],
    visits: [
      "runyon-canyon",
      "bronson-canyon",
      "wisdom-tree",
      "topanga-state-park",
      "hollywood-sign-hike",
      "griffith-park-old-zoo",
    ],
  },
  {
    handle: "demo_zoe_coast",
    name: "Zoe Rivera",
    city: "Santa Monica",
    title: "Salt air and the long way home",
    interests: ["beaches", "waterfronts", "scenic_views"],
    visits: ["santa-monica-pier", "el-matador-state-beach", "point-dume", "venice-canals"],
  },
  {
    handle: "demo_amir_art",
    name: "Amir Hassan",
    city: "Los Angeles",
    title: "Contemporary art and unexpected perspectives",
    interests: ["art", "museums", "photography"],
    visits: ["the-broad", "los-angeles-county-museum-of-art", "the-getty-center"],
  },
  {
    handle: "demo_jules_stage",
    name: "Jules Park",
    city: "Hollywood",
    title: "Cinema afternoons and concert nights",
    interests: ["live_music", "theater", "museums"],
    visits: [
      "hollywood-bowl",
      "walt-disney-concert-hall",
      "academy-museum-of-motion-pictures",
      "hollywood-forever-cemetery",
    ],
  },
  {
    handle: "demo_sienna_history",
    name: "Sienna Cole",
    city: "Glendale",
    title: "The stories beneath the city",
    interests: ["history", "museums", "architecture"],
    visits: [
      "la-brea-tar-pits",
      "union-station",
      "petersen-automotive-museum",
      "hollywood-forever-cemetery",
      "philippe-the-original",
    ],
  },
  {
    handle: "demo_theo_photo",
    name: "Theo Nguyen",
    city: "Malibu",
    title: "Chasing light from hilltops to the coast",
    interests: ["photography", "scenic_views", "beaches"],
    visits: [
      "griffith-observatory",
      "el-matador-state-beach",
      "point-dume",
      "wisdom-tree",
      "venice-canals",
      "santa-monica-pier",
    ],
  },
  {
    handle: "demo_ava_weekends",
    name: "Ava Patel",
    city: "Culver City",
    title: "Little escapes and local favorites",
    interests: ["local_food", "gardens", "waterfronts"],
    visits: [
      "malibu-seafood",
      "descanso-gardens",
      "santa-monica-pier",
      "grand-central-market",
      "salt-straw",
    ],
  },
];

export function demoId(key: string) {
  const bytes = createHash("sha256")
    .update(`souvenir-demo-explorers-v1:${key}`)
    .digest()
    .subarray(0, 16);
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
