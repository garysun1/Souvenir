import { useLocalSearchParams } from 'expo-router';
import { MomentDetail } from '@/features/memories/Moments';
import { MemoryScreen } from '@/features/memories/MemoryUi';

export default function MomentScreen() {
  const { momentId, friends } = useLocalSearchParams<{ momentId: string; friends?: string }>();
  return <MemoryScreen title="Memory moment"><MomentDetail key={momentId} momentId={momentId} initialFriends={friends?.split(',').filter(id => /^[0-9a-f-]{36}$/i.test(id)) ?? []} /></MemoryScreen>;
}
