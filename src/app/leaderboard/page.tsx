import { AppHeader } from "@/components/ui/app-header";
import { PageBody } from "@/components/ui/page";
import { Leaderboard } from "@/components/social/leaderboard";

export default function LeaderboardPage() {
  return (
    <>
      <AppHeader title="Leaderboard" />
      <PageBody>
        <Leaderboard />
      </PageBody>
    </>
  );
}
