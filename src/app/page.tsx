import { HomeGrid } from "@/components/home-grid";

export default function Home() {
  return (
    <div className="space-y-6 p-5">
      <header>
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-amber-700">Souvenir</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">Collect places.</h1>
        <p className="mt-1 text-muted-foreground">A little inspiration for your next adventure.</p>
      </header>
      <HomeGrid />
    </div>
  );
}
