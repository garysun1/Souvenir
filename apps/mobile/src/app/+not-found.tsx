import { router } from 'expo-router';
import { EmptyState, Screen, Header } from '@/components/ui';
export default function NotFound() { return <Screen><Header back /><EmptyState title="This page wandered off" message="The place, edition, or link may no longer be available." action="Back to Discover" onPress={() => router.replace('/discover')} /></Screen>; }
