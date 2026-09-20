import { useLocalSearchParams } from 'expo-router';
import { AlbumDetail } from '@/features/memories/Albums';
import { MemoryScreen } from '@/features/memories/MemoryUi';

export default function AlbumScreen() {
  const { albumId } = useLocalSearchParams<{ albumId: string }>();
  return <MemoryScreen title="Shared album"><AlbumDetail key={albumId} albumId={albumId} /></MemoryScreen>;
}
