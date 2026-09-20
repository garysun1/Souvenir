import { useLocalSearchParams } from 'expo-router';
import { PlannerScreen } from '@/features/planner/PlannerScreen';
import { AccountPlanner } from '@/features/planner/AccountPlanner';
import { useApp } from '@/state/AppProvider';

export default function PlannerSessionRoute() {
  const { mode } = useApp();
  const params = useLocalSearchParams<{ sessionId?: string; placeIds?: string; participantIds?: string; wishlistId?: string; planId?: string }>();
  const one = (value: string | string[] | undefined) => Array.isArray(value) ? value[0] : value;
  const sessionId = one(params.sessionId) ?? '';
  if (mode === 'account') return <AccountPlanner key={sessionId} context={{ placeIds: one(params.placeIds), wishlistId: one(params.wishlistId), planId: one(params.planId) }} />;
  return <PlannerScreen key={sessionId} sessionId={sessionId} context={{ placeIds: one(params.placeIds), participantIds: one(params.participantIds), wishlistId: one(params.wishlistId), planId: one(params.planId) }} />;
}
