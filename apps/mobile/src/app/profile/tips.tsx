import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { useApp } from '@/state/AppProvider';
import { collectedPlaceIds } from '@/state/selectors';
import { placeById } from '@/fixtures/catalog';
import { PlaceRow } from '@/components/cards/PlaceRow';
import { Button, Chip, ChipRow, EmptyState, Field, Header, Screen, Sheet, T } from '@/components/ui';
export default function TipsScreen() {
  const { state, commit } = useApp(); const [editingId, setEditingId] = useState<string>(); const [text, setText] = useState(''); const [error, setError] = useState('');
  const entries = Object.entries(state.tips).filter(([, tip]) => !!tip.trim()).flatMap(([id, tip]) => { const place = placeById(id); return place ? [{ place, tip }] : []; });
  const collected = collectedPlaceIds(state).map(placeById).filter((item): item is NonNullable<typeof item> => item !== undefined); const place = editingId ? placeById(editingId) : undefined;
  const edit = (id: string) => { setEditingId(id); setText(state.tips[id] ?? ''); setError(''); };
  const close = () => { setEditingId(undefined); setText(''); setError(''); };
  const save = async () => { if (!editingId) return; const clean = text.trim(); if (!clean) { setError('Write a tip, or use Delete tip.'); return; } await commit({ type: 'TIP', placeId: editingId, text: clean }); close(); };
  return <Screen><Header back title="My tips" subtitle="Private notes · Only you" />
    <T muted>Keep the practical detail you want to remember. Tips never appear in the friend feed.</T>
    <ChipRow>{collected.map(item => <Chip key={item.id} label={state.tips[item.id] ? `Edit ${item.name}` : `Add ${item.name}`} icon="edit" onPress={() => edit(item.id)} />)}</ChipRow>
    {entries.length === 0 ? <EmptyState icon="edit" title="No private tips yet" message="Add a note to one of your collected places. You can write up to 280 characters." /> : <View>{entries.map(({ place: item, tip }) => <PlaceRow key={item.id} place={item} subtitle={`“${tip}”\nOnly you · Updated date unavailable`} trailing={<Pressable accessibilityRole="button" onPress={() => edit(item.id)} style={{ minHeight: 44, justifyContent: 'center' }}><T variant="small" color="#144F5D">Edit</T></Pressable>} />)}</View>}
    <Sheet visible={!!place} onClose={close} title={place?.name ?? 'Private tip'}><T variant="small" muted>Only you</T><Field label="What should you remember?" value={text} onChangeText={value => { setText(value.slice(0, 280)); setError(''); }} multiline maxLength={280} placeholder="Leave time for the garden." /><T variant="small" muted>{text.length}/280</T>{Boolean(error) && <T color="#A3383C">{error}</T>}<Button label="Save private tip" onPress={save} /><Button label="Cancel" variant="ghost" onPress={close} />{state.tips[editingId ?? ''] && <Button label="Delete tip" variant="ghost" onPress={async () => { if (editingId) await commit({ type: 'TIP', placeId: editingId, text: '' }); close(); }} />}</Sheet>
  </Screen>;
}
