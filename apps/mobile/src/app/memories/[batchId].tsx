import { useLocalSearchParams } from 'expo-router';
import { ImportBatch } from '@/features/memories/Imports';
import { MemoryScreen } from '@/features/memories/MemoryUi';

export default function BatchScreen() {
  const { batchId } = useLocalSearchParams<{ batchId: string }>();
  return <MemoryScreen title="Review import"><ImportBatch key={batchId} batchId={batchId} /></MemoryScreen>;
}
