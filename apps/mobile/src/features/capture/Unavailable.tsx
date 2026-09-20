import { router } from 'expo-router';
import { EmptyState, Header, Screen } from '@/components/ui';
export function CaptureUnavailable({ message = 'This capture draft is no longer available.' }: { message?: string }) {
  return <Screen><Header title="Capture unavailable" /><EmptyState icon="camera" title="Nothing to continue" message={message} action="Return to Discover" onPress={() => router.replace('/discover')} /></Screen>;
}
