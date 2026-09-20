import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { PlacePhoto } from '@/components/cards/PlacePhoto';
import { Button, DemoLabel, EmptyState, Field, Header, Icon, IconButton, Screen, SectionHeading, Sheet, T } from '@/components/ui';
import { colors } from '@/design/tokens';
import { appealFor, availabilityLabel } from '@/domain/search';
import { categoryLabels, placeById, users } from '@/fixtures/catalog';
import { useApp } from '@/state/AppProvider';
import { money, visitDate } from '@/state/selectors';
import { PlaceSignal } from '@/features/discovery/PlaceSignals';
import { AccountPlaceDetail } from '@/features/discovery/AccountPlaceDetail';

export default function PlaceDetail() {
  const { mode } = useApp();
  const { placeId } = useLocalSearchParams<{ placeId: string }>();
  if (mode === 'account') return <AccountPlaceDetail key={placeId} placeId={placeId} />;
  return <DemoPlaceDetail />;
}
function DemoPlaceDetail() {
  const { placeId } = useLocalSearchParams<{ placeId: string }>();
  const place = typeof placeId === 'string' ? placeById(placeId) : undefined;
  const { state, commit, error } = useApp();
  const [saveOpen, setSaveOpen] = useState(false);
  const [savingList, setSavingList] = useState<string>();
  const [tipOpen, setTipOpen] = useState(false);
  const [signal, setSignal] = useState<'appeal' | 'frequency' | 'availability' | null>(null);
  const [tip, setTip] = useState(place ? state.tips[place.id] ?? '' : '');
  const ownEditions = useMemo(() => place ? state.editions.filter(edition => edition.ownerId === 'you' && edition.placeId === place.id).sort((a, b) => b.visitedAt.localeCompare(a.visitedAt)) : [], [place, state.editions]);
  if (!place) return <Screen><Header title="Place unavailable" back /><EmptyState title="This place isn’t available" message="The destination may have been removed from the sample catalog." action="Back to Discover" onPress={() => router.replace('/discover')} /></Screen>;
  const appeal = appealFor(place, state);
  const favorite = state.favorites.includes(place.id);
  const discoveryPercent = Math.round((place.discoveryCount / place.cohort) * 100);
  const availability = availabilityLabel(place, state);
  const availabilitySignal = state.preferences.sourceStatus !== 'sample' ? 'Unknown' : place.bookingRequired ? 'Sample timed entry' : place.tags.includes('indoors') ? 'Sample interior hours' : 'Sample regular grounds hours';
  const saveMembership = (wishlistId: string) => state.wishlists.find(list => list.id === wishlistId)?.entries.find(entry => entry.placeId === place.id)?.saverIds ?? [];
  const toggleList = async (wishlistId: string) => {
    setSavingList(wishlistId);
    try { await commit({ type: 'SAVE_PLACE', placeId: place.id, wishlistId }); } catch { /* Shared error is displayed inside this sheet. */ } finally { setSavingList(undefined); }
  };
  const signalContent = signal === 'appeal' ? { title: 'Your personal appeal', body: appeal.explanation, note: 'This is calculated from your local preferences, visits and recommendations. It is not a public rating or rarity claim.' }
    : signal === 'frequency' ? { title: 'Discovery frequency', body: place.canonical ? 'Discovery frequency is unavailable. No verified collector counts are provided.' : `${place.discoveryCount} of ${place.cohort} seeded demo collector profiles include this destination (${discoveryPercent}%).`, note: 'Demo counts are synthetic fixtures, not observed users or attendance.' }
      : { title: 'Sample availability', body: state.preferences.sourceStatus === 'sample' ? `${availabilitySignal}: ${String(place.openHour).padStart(2, '0')}:00–${String(place.closeHour).padStart(2, '0')}:00 Los Angeles, in the daily demo fixture. At the demo clock: ${availability}.${place.bookingRequired ? ' Timed admission is required in this sample; no ticket has been checked or booked.' : ''}` : 'The configured source is unavailable or stale, so current hours are unknown.', note: `${place.tags.includes('indoors') ? 'This describes the interior fixture.' : 'This describes the grounds/exterior fixture.'} It is not checked live. Open source details before planning a real visit.` };
  return <Screen>
    <Header back right={<View style={styles.headerActions}><IconButton name="bookmark" filled={state.wishlists.some(list => saveMembership(list.id).includes('you'))} label="Choose a save list" onPress={() => setSaveOpen(true)} /><IconButton name="heart" filled={favorite} label={favorite ? 'Remove favorite' : 'Add favorite'} onPress={() => { void commit({ type: 'FAVORITE', placeId: place.id }).catch(() => undefined); }} /></View>} />
    <PlacePhoto placeId={place.id} style={styles.hero} />
    <View style={styles.identity}><T variant="title">{place.name}</T><T muted>{categoryLabels[place.category]} · {place.neighborhood}</T></View>
    <T style={styles.summary}>{place.summary}</T>
    <T variant="small" muted style={{ marginTop: 10 }}>{place.canonical ? 'Admission cost, visit duration and hours are unknown.' : `Sample admission · ${money(place.priceCents)} · Allow about ${place.durationMinutes} minutes`}</T>
    <View style={styles.signals}>
      <PlaceSignal icon="sparkles" eyebrow="Personal appeal" value={appeal.label} onPress={() => setSignal('appeal')} />
      <PlaceSignal icon="people" eyebrow="In-app discovery frequency" value={place.canonical ? 'Unavailable' : `${discoveryPercent}% of demo collectors`} onPress={() => setSignal('frequency')} />
      <PlaceSignal icon="clock" eyebrow="Documented availability" value={availabilitySignal} onPress={() => setSignal('availability')} />
    </View>
    <Pressable accessibilityRole="button" onPress={() => router.push({ pathname: '/settings/sources', params: { placeId: place.id } })} style={styles.sourceLink}><DemoLabel label={`${state.preferences.sourceStatus === 'sample' ? 'Sample sources' : 'Source status: ' + state.preferences.sourceStatus}`} /><View style={{ flex: 1 }} /><T variant="small" color={colors.brand}>Source details</T><Icon name="chevron" size={15} /></Pressable>
    <SectionHeading title="Your place" />
    <View style={styles.actionsGrid}>
      <Button label={favorite ? 'Favorited' : 'Favorite'} variant="outline" icon="heart" onPress={() => commit({ type: 'FAVORITE', placeId: place.id })} style={styles.half} />
      <Button label={state.tips[place.id] ? 'Edit private tip' : 'Add private tip'} variant="outline" icon="edit" onPress={() => { setTip(state.tips[place.id] ?? ''); setTipOpen(true); }} style={styles.half} />
    </View>
    {state.tips[place.id] && <Pressable accessibilityRole="button" onPress={() => { setTip(state.tips[place.id]); setTipOpen(true); }} style={styles.tip}><View style={{ flex: 1, gap: 3 }}><T variant="small" muted>Only you · Private tip</T><T>{state.tips[place.id]}</T></View><Icon name="edit" size={17} /></Pressable>}
    <SectionHeading title="Your editions" />
    {ownEditions.length ? <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.editions}>{ownEditions.map(edition => <Pressable key={edition.id} accessibilityRole="button" accessibilityLabel={`Open edition ${edition.sequence} from ${visitDate(edition.visitedAt, edition.timezone)}`} onPress={() => router.push(`/edition/${edition.id}`)} style={styles.edition}>
      <PlacePhoto placeId={place.id} uri={edition.photoUri} style={styles.editionPhoto} /><T variant="label">Edition {String(edition.sequence).padStart(2, '0')}</T><T variant="small" muted>{visitDate(edition.visitedAt, edition.timezone)}</T>{edition.companions.length > 0 && <T variant="small" muted>With {edition.companions.map(id => users.find(user => user.id === id)?.name ?? id).join(', ')}</T>}
    </Pressable>)}</ScrollView> : <View style={styles.noEditions}><T variant="place">No personal editions yet</T><T muted>Capture a visit to keep your own photo, moment and recommendation.</T></View>}
    <View style={styles.ctas}>
      <Button label={ownEditions.length ? 'Capture another visit' : 'Capture a visit'} icon="camera" onPress={() => router.push({ pathname: '/capture', params: { placeId: place.id } })} />
      <Button label="Add to plan" variant="outline" icon="sparkles" onPress={() => router.push({ pathname: '/planner', params: { placeIds: place.id } })} />
      {ownEditions.length > 0 && <Button label="Your recommendation" variant="ghost" onPress={() => router.push({ pathname: '/recommend/[placeId]', params: { placeId: place.id, editionId: ownEditions[0].id } })} />}
    </View>
    <Sheet visible={saveOpen} onClose={() => setSaveOpen(false)} title="Save to a list">
      <T muted>Choose each list separately. Toggling your save never removes another member’s save.</T>
      {error && <T color={colors.error}>{error} Tap the list again to retry.</T>}
      {state.wishlists.filter(list => list.memberIds.includes('you')).map(list => {
        const savers = saveMembership(list.id); const checked = savers.includes('you'); const others = savers.filter(id => id !== 'you').map(id => users.find(user => user.id === id)?.name ?? id);
        return <Pressable key={list.id} accessibilityRole="checkbox" accessibilityState={{ checked, busy: savingList === list.id, disabled: !!savingList }} disabled={!!savingList} onPress={() => { void toggleList(list.id); }} style={styles.listChoice}>
          <View style={[styles.checkbox, checked && styles.checked]}>{checked && <Icon name="check" size={16} color="#fff" />}</View><View style={{ flex: 1 }}><T variant="label">{savingList === list.id ? 'Saving…' : list.title}</T><T variant="small" muted>{list.memberIds.length > 1 ? `${list.memberIds.length} members` : 'Personal list'}{others.length ? ` · Also saved by ${others.join(', ')}` : ''}</T></View>
        </Pressable>;
      })}
      <Button label="Done" onPress={() => setSaveOpen(false)} />
    </Sheet>
    <Sheet visible={tipOpen} onClose={() => setTipOpen(false)} title={`Private tip · ${place.name}`}>
      <T variant="small" muted>{state.mode === 'account' ? 'Only you · synced privately to your account.' : 'Only you · stored locally.'}</T>{error && <T color={colors.error}>{error} Your draft is still here; try Save again.</T>}<Field label="Tip" value={tip} onChangeText={setTip} multiline maxLength={280} placeholder="What should you remember next time?" /><T variant="small" muted style={{ textAlign: 'right' }}>{tip.length}/280</T>
      <Button label="Save private tip" onPress={async () => { await commit({ type: 'TIP', placeId: place.id, text: tip.trim() }); setTipOpen(false); }} />
      {state.tips[place.id] && <Button label="Delete tip" variant="ghost" onPress={async () => { await commit({ type: 'TIP', placeId: place.id, text: '' }); setTip(''); setTipOpen(false); }} />}
    </Sheet>
    <Sheet visible={signal !== null} onClose={() => setSignal(null)} title={signalContent.title}><T>{signalContent.body}</T><T variant="small" muted>{signalContent.note}</T>{signal === 'availability' && <Button label="Open source details" variant="outline" onPress={() => { setSignal(null); router.push({ pathname: '/settings/sources', params: { placeId: place.id } }); }} />}</Sheet>
  </Screen>;
}

const styles = StyleSheet.create({
  headerActions: { flexDirection: 'row' }, hero: { width: '100%', height: 270, borderRadius: 14 }, identity: { marginTop: 19, gap: 2 }, summary: { marginTop: 11 }, signals: { marginTop: 17, borderTopWidth: 1, borderTopColor: colors.divider }, sourceLink: { minHeight: 50, flexDirection: 'row', alignItems: 'center', gap: 5 },
  actionsGrid: { flexDirection: 'row', gap: 10 }, half: { flex: 1, paddingHorizontal: 9 }, tip: { marginTop: 12, borderWidth: 1, borderColor: colors.border, borderRadius: 12, padding: 13, flexDirection: 'row', alignItems: 'center', gap: 8 },
  editions: { gap: 12, paddingBottom: 5 }, edition: { width: 150, gap: 3 }, editionPhoto: { width: 150, height: 115, borderRadius: 9 }, noEditions: { backgroundColor: colors.surface, borderRadius: 13, padding: 17, gap: 4 }, ctas: { gap: 10, marginTop: 24 },
  listChoice: { minHeight: 62, flexDirection: 'row', alignItems: 'center', gap: 12, borderBottomWidth: 1, borderBottomColor: colors.divider }, checkbox: { width: 24, height: 24, borderRadius: 6, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' }, checked: { backgroundColor: colors.brand, borderColor: colors.brand },
});
