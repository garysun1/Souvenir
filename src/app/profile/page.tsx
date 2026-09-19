import Link from "next/link";
import { ChevronRight, Heart, Import, Settings, Sparkles } from "lucide-react";
import { AppHeader } from "@/components/ui/app-header";
import { AvatarStack } from "@/components/ui/avatar-stack";
import { getCurrentCollection } from "@/lib/data";

const rows = [
  { label: "Favorites", icon: Heart },
  { label: "Tips", icon: Sparkles },
  { label: "Plans", icon: Sparkles, href: "/plan" },
  { label: "Imports", icon: Import },
  { label: "Settings", icon: Settings },
];

export default async function ProfilePage() {
  const collection = await getCurrentCollection();
  return (
    <>
      <AppHeader title="Profile" />
      <div className="space-y-7 px-[18px] pt-7">
        <div className="flex flex-col items-center">
          <div className="flex size-20 items-center justify-center rounded-full bg-brand font-serif text-3xl font-bold text-white">
            Y
          </div>
          <p className="mt-3 text-sm font-semibold">@you</p>
        </div>
        <div className="grid grid-cols-3 divide-x divide-divider rounded-xl border border-divider py-4">
          <Stat label="Places" value={new Set(collection.map((entry) => entry.place.id)).size} />
          <Stat label="Sets" value={0} />
          <Stat label="Friends" value={3} />
        </div>
        <AvatarStack names={["Maya", "Jordan", "Sam"]} />
        <div className="divide-y divide-divider border-y border-divider">
          {rows.map(({ label, icon: Icon, href }) => {
            const content = (
              <>
                <span className="flex items-center gap-3">
                  <Icon className="size-5 text-text-secondary" strokeWidth={1.6} />
                  <span>{label}</span>
                </span>
                <ChevronRight className="size-4 text-text-decorative" />
              </>
            );
            return href ? (
              <Link
                key={label}
                href={href}
                className="flex min-h-14 items-center justify-between text-sm font-medium"
              >
                {content}
              </Link>
            ) : (
              <div
                key={label}
                className="flex min-h-14 items-center justify-between text-sm font-medium"
              >
                {content}
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="text-center">
      <p className="font-serif text-xl font-bold text-brand">{value}</p>
      <p className="mt-1 text-xs text-text-secondary">{label}</p>
    </div>
  );
}
