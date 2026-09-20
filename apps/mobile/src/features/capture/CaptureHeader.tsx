import { router } from 'expo-router';
import { useState } from 'react';
import { Button, Header, IconButton, Sheet, T } from '@/components/ui';
import { useApp } from '@/state/AppProvider';

export function CaptureHeader({ title, back = false, onPause }: { title: string; back?: boolean; onPause?: () => void }) {
  const { state, commit } = useApp();
  const [open, setOpen] = useState(false);
  const saved = state.captureDraft?.status === 'saved';
  const leave = () => router.canGoBack() ? router.back() : router.replace(saved ? '/collection' : '/discover');
  return <>
    <Header title={title} back={back} right={<IconButton name="close" label="Close capture" onPress={() => { if (saved) leave(); else { onPause?.(); setOpen(true); } }} />} />
    <Sheet visible={open} onClose={() => setOpen(false)} title="Keep this capture?">
      <T muted>Your photo and visit details can wait for you here. Discarding removes the draft, not any edition already saved.</T>
      <Button label="Keep draft and close" onPress={() => { setOpen(false); leave(); }} />
      <Button label="Discard draft" variant="outline" onPress={async () => { await commit({ type: 'DRAFT', draft: null }); setOpen(false); leave(); }} />
    </Sheet>
  </>;
}
