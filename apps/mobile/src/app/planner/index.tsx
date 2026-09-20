import { Redirect, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';

export default function NewPlannerRoute() {
  const params = useLocalSearchParams<{ placeIds?: string; participantIds?: string; wishlistId?: string; planId?: string }>();
  const [sessionId] = useState(() => `draft-${Date.now()}`);
  return <Redirect href={{ pathname: '/planner/[sessionId]', params: { ...params, sessionId } }} />;
}
