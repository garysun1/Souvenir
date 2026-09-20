import { useLocalSearchParams } from 'expo-router';
import { PlannerScreen } from '@/features/planner/PlannerScreen';

export default function PlannerSessionRoute() {
  const params = useLocalSearchParams<{ sessionId?: string; placeIds?: string; participantIds?: string; wishlistId?: string; planId?: string }>();
  const one = (value: string | string[] | undefined) => Array.isArray(value) ? value[0] : value;
  const sessionId = one(params.sessionId) ?? '';
  return <PlannerScreen key={sessionId} sessionId={sessionId} context={{ placeIds: one(params.placeIds), participantIds: one(params.participantIds), wishlistId: one(params.wishlistId), planId: one(params.planId) }} />;
}
