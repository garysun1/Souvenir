import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { Avatar, Button, DemoLabel, Divider, Field, Header, Icon, IconButton, Screen, SectionHeading, Sheet, T } from '@/components/ui';
import { PlacePhoto } from '@/components/cards/PlacePhoto';
import { colors } from '@/design/tokens';
import { downtownSet, placeById } from '@/fixtures/catalog';
import { useApp } from '@/state/AppProvider';
import { collectedPlaceIds, ownEditions, setProgress } from '@/state/selectors';
import { AccountSets } from '@/features/collection/AccountSets';
import { AccountProfileStats } from '@/features/social/AccountSocial';

export default function Profile() {
  const { state, commit } = useApp();
  const editions = useMemo(() => [...ownEditions(state)].sort((a, b) => b.visitedAt.localeCompare(a.visitedAt)), [state]);
  const collected = collectedPlaceIds(state);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(state.preferences.name);
  const [handle, setHandle] = useState(state.preferences.handle);
  const [bio, setBio] = useState(state.preferences.bio);
  const [homeCity, setHomeCity] = useState(state.preferences.homeCity ?? '');
  const assessed = state.assessments.filter(item => collected.includes(item.placeId)).length;
  return <Screen>
    <Header right={<IconButton name="settings" label="Open settings" onPress={() => router.push('/settings')} />} />
    <View style={{ alignItems: 'center', gap: 9, paddingVertical: 10 }}>
      <Avatar userId="you" size={76} />
      <T variant="title">{state.preferences.name}</T>
      <T variant="small" color={colors.brand}>{state.preferences.handle}</T>
      <T muted style={{ textAlign: 'center', maxWidth: 290 }}>{state.preferences.bio}</T>
      <Button label="Edit profile" variant="outline" icon="edit" onPress={() => setEditing(true)} style={{ minHeight: 42 }} />
    </View>
    {state.mode === 'account' ? <AccountProfileStats /> : <View style={{ flexDirection: 'row', marginVertical: 22, borderTopWidth: 1, borderBottomWidth: 1, borderColor: colors.divider, paddingVertical: 17 }}>
      {[['Places', collected.length], ['Editions', editions.length], ['Recommended', assessed]].map(([label, value], index) => <View key={label} style={{ flex: 1, alignItems: 'center', gap: 4, borderLeftWidth: index ? 1 : 0, borderColor: colors.divider }}><T variant="heading">{value}</T><T variant="small" muted>{label}</T></View>)}
    </View>}
    <DemoLabel label={state.mode === 'account' ? 'Your private account collection' : `${state.mode === 'sample' ? 'Sample collection' : 'Your collection'} · Stored locally`} />
    <SectionHeading title="Recent memories" action={editions.length ? 'See collection' : undefined} onPress={() => router.push('/collection')} />
    {editions.length ? <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 12 }}>
      {editions.slice(0, 6).map(edition => { const place = placeById(edition.placeId); return place ? <Pressable key={edition.id} accessibilityRole="button" accessibilityLabel={`Open your ${place.name} edition`} onPress={() => router.push({ pathname: '/edition/[editionId]', params: { editionId: edition.id } })} style={{ width: 142 }}>
        <PlacePhoto placeId={edition.placeId} uri={edition.photoUri} style={{ height: 156 }} />
        <T variant="place" numberOfLines={1} style={{ marginTop: 8 }}>{place.name}</T><T variant="small" muted>Edition {edition.sequence}</T>
      </Pressable> : null; })}
    </ScrollView> : <View style={{ backgroundColor: colors.brandSoft, borderRadius: 14, padding: 20, gap: 10 }}><T variant="place">Your first memory starts outside.</T><T variant="small" muted>Capture a place you visit, or bring in an old travel photo.</T><Button label="Capture a visit" icon="camera" onPress={() => router.push('/capture')} /></View>}
    <SectionHeading title="Your collection" />
    {state.mode === 'account' ? <AccountSets /> : <ProfileRow icon="sparkles" title="Downtown Firsts" subtitle={`${setProgress(state)}/${downtownSet.placeIds.length} places collected`} onPress={() => router.push('/sets/downtown-firsts')} />}
    <ProfileRow icon="heart" title="Favorites" subtitle={`${state.favorites.length} places you want close`} onPress={() => router.push('/profile/favorites')} />
    <ProfileRow icon="edit" title="Private tips" subtitle={`${Object.values(state.tips).filter(Boolean).length} notes only you can see`} onPress={() => router.push('/profile/tips')} />
    <ProfileRow icon="clock" title="Saved plans" subtitle={`${state.plans.length} accepted afternoons`} onPress={() => router.push('/plans')} />
    <Divider />
    {state.mode !== 'account' && <><SectionHeading title="Bring your past along" />
    <View style={{ borderRadius: 16, backgroundColor: colors.surface, padding: 18, gap: 10 }}><View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}><Icon name="upload" /><T variant="heading" style={{ flex: 1 }}>Photo import</T></View><T muted>Review a local Dropbox-style sample and turn old travel photos into personal editions.</T><Button label="Try the sample import" variant="outline" onPress={() => router.push('/import/dropbox')} /></View>
    <SectionHeading title="A glimpse ahead" />
    <View style={{ gap: 10 }}>
      <ProfileRow icon="image" title="Pocket diorama" subtitle="Preview one memory in depth" onPress={() => editions.length ? router.push({ pathname: '/previews/diorama/[editionId]', params: { editionId: editions[0].id } }) : router.push('/capture')} />
      <ProfileRow icon="globe" title="New city editions" subtitle="See how the collection could travel" onPress={() => router.push('/previews/cities')} />
      <ProfileRow icon="share" title="Visit handoff" subtitle="Explore a clearly labeled booking preview" onPress={() => router.push({ pathname: '/previews/booking/[planId]', params: { planId: state.plans[0]?.id ?? 'preview' } })} />
    </View></>}
    <Sheet visible={editing} title="Your profile" onClose={() => setEditing(false)}>
      <Field label="Name" value={name} onChangeText={setName} maxLength={40} />
      {state.mode === 'account' ? <><T selectable>Account handle: {state.preferences.handle}</T><Field label="Home city" value={homeCity} onChangeText={setHomeCity} maxLength={100} /></> : <Field label="Handle" value={handle} onChangeText={setHandle} autoCapitalize="none" maxLength={28} />}
      <Field label="Bio (this device only)" value={bio} onChangeText={setBio} multiline maxLength={160} />
      <Button label="Save profile" disabled={!name.trim() || !handle.trim()} onPress={async () => { await commit({ type: 'PREFERENCES', patch: { name: name.trim(), ...(state.mode === 'account' ? { homeCity } : { handle: handle.trim().startsWith('@') ? handle.trim() : `@${handle.trim()}` }), bio: bio.trim() } }); setEditing(false); }} />
    </Sheet>
  </Screen>;
}

function ProfileRow({ icon, title, subtitle, onPress }: { icon: 'sparkles' | 'heart' | 'edit' | 'clock' | 'image' | 'globe' | 'share'; title: string; subtitle: string; onPress: () => void }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={`${title}. ${subtitle}`} onPress={onPress} style={{ minHeight: 66, flexDirection: 'row', alignItems: 'center', gap: 13, borderBottomWidth: 1, borderBottomColor: colors.divider }}>
    <View style={{ height: 38, width: 38, borderRadius: 19, backgroundColor: colors.brandSoft, alignItems: 'center', justifyContent: 'center' }}><Icon name={icon} size={19} /></View>
    <View style={{ flex: 1, gap: 2 }}><T variant="label">{title}</T><T variant="small" muted>{subtitle}</T></View><Icon name="chevron" size={16} color="#999" />
  </Pressable>;
}
