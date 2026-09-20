import { randomUUID } from 'expo-crypto';
import { router } from 'expo-router';
import { useRef, useState } from 'react';
import { Button, Field, Header, Screen, SectionHeading, T } from '@/components/ui';
import { useApp } from '@/state/AppProvider';
import { OutingRow, WishlistCard } from './components';

export function AccountFriends() {
  const { state, commit } = useApp();
  const [name, setName] = useState('');
  const [locked, setLocked] = useState(false);
  const requestId = useRef(randomUUID());
  const create = async () => {
    setLocked(true);
    await commit({ type: 'CREATE_WISHLIST', requestId: requestId.current, name: name.trim(), isShared: true });
    requestId.current = randomUUID(); setName(''); setLocked(false);
  };
  return <Screen><Header title="Friends" subtitle="Shared places, separate memories." />
    <T muted>Share a list with an existing account by handle. Members can see shared saves and plans; your visit photos, notes and tips stay private.</T>
    <SectionHeading title="Your lists" />
    {state.wishlists.map(list => <WishlistCard key={list.id} list={list} account />)}
    <SectionHeading title="Create a shared list" />
    <Field label="List name" value={name} editable={!locked} onChangeText={setName} maxLength={120} />
    <Button label={locked ? 'Retry creating list' : 'Create shared list'} disabled={!name.trim()} onPress={create} />
    <SectionHeading title="Shared outings" />
    {state.outings.filter(outing => outing.participantIds.length > 1).map(outing => <OutingRow key={outing.id} outing={outing} state={state} />)}
    <Button label="All saved plans" variant="outline" onPress={() => router.push('/plans')} />
  </Screen>;
}
