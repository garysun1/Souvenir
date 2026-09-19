import { HomeGrid } from "@/components/home-grid";

export default function ExplorePage() {
  return (
    <div className="space-y-5 p-5">
      <div className="space-y-3">
        <h1 className="text-3xl font-semibold">Explore</h1>
        <p className="text-muted-foreground">Owner: Search &amp; Data</p>
      </div>
      <HomeGrid />
    </div>
  );
}
