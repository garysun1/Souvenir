import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { Avatar, Button, DemoLabel, EmptyState, Header, Icon, Screen, SectionHeading, Sheet, T } from '@/components/ui';
import { PlacePhoto } from '@/components/cards/PlacePhoto';
import { PlaceRow } from '@/components/cards/PlaceRow';
import { colors } from '@/design/tokens';
import { clockTime, matchingEditions, mayaConfirmation, outingDetails } from '@/domain/social';
import { placeById, users } from '@/fixtures/catalog';
import { openFriend, PersonalEditionTile, SocialUnavailable, styles } from '@/features/social/components';
import { useApp } from '@/state/AppProvider';
import { money } from '@/state/selectors';

export default function OutingScreen() {
  const { outingId } = useLocalSearchParams<{ outingId: string }>();
  const { state, commit, error } = useApp();
  const [confirmPlaceId, setConfirmPlaceId] = useState<string>();
  const [notice, setNotice] = useState('');
  const [simulationError, setSimulationError] = useState('');
  const details = outingDetails(state, outingId);
  if (!details) return <SocialUnavailable title="This outing is unavailable" message="The outing or its accepted plan was not found on this device. Start a new shared plan from Friends." />;
  const { outing, plan } = details;
  const coverPlace = plan.stops.find(stop => placeById(stop.placeId));
  const completed = plan.stops.filter(stop => matchingEditions(state, outing.id, stop.placeId).some(member => member.ownerId === 'you' && member.edition)).length;
  const simulation = confirmPlaceId ? mayaConfirmation(state, outing.id, confirmPlaceId) : undefined;
  const hasYou = outing.participantIds.includes('you');

  return <Screen>
    <Header back subtitle="Your shared afternoon" />
    {coverPlace && <PlacePhoto placeId={coverPlace.placeId} style={{ height: 180, marginBottom: 20 }} />}
    <T variant="title">{outing.title}</T>
    <T muted style={{ marginTop: 8 }}>{plan.constraints.date} · {clockTime(plan.constraints.startMinute)}–{clockTime(plan.constraints.endMinute)} Los Angeles</T>
    <View style={[styles.wrap, { marginVertical: 18 }]}>{outing.participantIds.map(userId => <Pressable key={userId} accessibilityRole="button" accessibilityLabel={`View ${users.find(user => user.id === userId)?.name ?? 'member'} profile`} onPress={() => openFriend(userId)} style={[styles.row, { minHeight: 44 }]}>
      <Avatar userId={userId} size={32} /><T variant="small">{users.find(user => user.id === userId)?.name ?? 'Member'}</T>
    </Pressable>)}</View>
    <DemoLabel label={state.mode === 'account' ? 'Shared account outing · unverified estimates' : 'Local outing · Sample times & costs'} />
    <T variant="small" muted style={{ marginTop: 8 }}>{state.mode === 'account' ? 'Saved to the account. ' : 'Accepted locally. '}No reservation or location tracking. Each person keeps their own private memory.</T>
    <View style={[styles.callout, { marginTop: 20 }]}>
      <View style={styles.row}><Icon name={completed === plan.stops.length && completed > 0 ? 'check' : 'camera'} /><T variant="label">{completed} of {plan.stops.length} stops in your album</T></View>
      <T variant="small" muted>{money(plan.totalCostCents)} per person · {plan.totalMinutes} minutes · {plan.constraints.transport === 'walk' ? 'Walking' : 'Transit'} estimates</T>
      <T variant="small" muted>Meals and optional purchases are not included. Hours and access are sample inputs, not live verification.</T>
      <Button label="View accepted plan" variant="outline" onPress={() => router.push({ pathname: '/plans/[planId]', params: { planId: plan.id } })} />
    </View>
    {state.preferences.sourceStatus !== 'sample' && <View style={[styles.quietCard, { marginTop: 14 }]}><T variant="label">{state.preferences.sourceStatus === 'unavailable' ? 'Source information is unavailable' : 'Source information is stale'}</T><T variant="small" muted>Your saved itinerary remains available. Check venue details before a real visit.</T><Button label="View sources" variant="ghost" onPress={() => router.push('/settings/sources')} /></View>}
    {!!notice && <T accessibilityLiveRegion="polite" color={colors.brand} style={{ marginTop: 18 }}>{notice}</T>}
    <SectionHeading title="The afternoon, one stop at a time" />
    {plan.stops.length ? plan.stops.map((stop, index) => {
      const place = placeById(stop.placeId);
      const members = matchingEditions(state, outing.id, stop.placeId);
      const yourVisit = members.find(member => member.ownerId === 'you')?.edition;
      const mayaVisit = members.find(member => member.ownerId === 'maya')?.edition;
      const eligible = !!mayaConfirmation(state, outing.id, stop.placeId);
      return <View key={`${index}-${stop.placeId}`} style={{ paddingBottom: 24, marginBottom: 20, borderBottomWidth: 1, borderBottomColor: colors.divider, gap: 14 }}>
        <View style={styles.row}><View style={{ height: 32, width: 32, borderRadius: 16, backgroundColor: colors.brandSoft, alignItems: 'center', justifyContent: 'center' }}><T variant="label" color={colors.brand}>{index + 1}</T></View><View style={styles.flex}><T variant="label">{clockTime(stop.arrivalMinute)}–{clockTime(stop.departureMinute)}</T><T variant="small" muted>{stop.travelMinutes} min {plan.constraints.transport === 'walk' ? 'walk' : 'transit'} {index ? 'from previous stop' : 'from sample start'} · Estimate</T></View></View>
        {place ? <PlaceRow place={place} subtitle={`${stop.departureMinute - stop.arrivalMinute} min visit · Sample cost: ${money(stop.costCents)}`} /> : <T muted>This destination is no longer available in the catalog.</T>}
        {place?.bookingRequired && <T variant="small" muted>Ticket or advance access may be required. This plan does not book it.</T>}
        {place && hasYou && <Button label={yourVisit ? 'Capture another memory here' : 'Capture this stop'} icon="camera" variant={yourVisit ? 'outline' : 'primary'} onPress={() => router.push({ pathname: '/capture', params: { placeId: stop.placeId, outingId: outing.id, planId: plan.id } })} />}
        <View style={styles.row}><Icon name="people" size={17} /><T variant="small" color={colors.brand} style={styles.flex}>{outing.title} · Shared outing stamp</T></View>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>{members.map(member => <PersonalEditionTile key={member.ownerId} ownerId={member.ownerId} edition={member.edition} placeId={stop.placeId} />)}</View>
        {eligible && <Button label="Simulate Maya confirming her visit" variant="outline" onPress={() => { setSimulationError(''); setConfirmPlaceId(stop.placeId); }} />}
        {mayaVisit && <T variant="small" color={colors.brand}>Maya confirmed in this local simulation. Your counters are unchanged.</T>}
        {!yourVisit && outing.participantIds.includes('maya') && <T variant="small" muted>Capture your visit first to unlock the explicit Maya confirmation simulation. Selecting a companion does not confirm their visit.</T>}
      </View>;
    }) : <EmptyState title="No stops to show" message="This saved outing has no itinerary stops. Open your accepted plans or start another shared plan." action="View plans" onPress={() => router.push('/plans')} />}
    <Button label="Plan another afternoon" icon="plus" variant="outline" onPress={() => router.push({ pathname: '/planner', params: { participantIds: outing.participantIds.join(','), placeIds: outing.placeIds.join(',') } })} />
    <Sheet visible={!!confirmPlaceId} onClose={() => setConfirmPlaceId(undefined)} title="Maya’s own little memory">
      <DemoLabel label="Explicit simulation · Not a message to Maya" />
      <T>This adds one fictional visit to Maya’s collection, linked to this outing and place. It never adds an edition, place, or set to your own totals.</T>
      {simulation ? <>
        <PlacePhoto placeId={simulation.placeId} uri={simulation.photoUri} style={{ height: 170 }} />
        <T variant="place">{placeById(simulation.placeId)?.name}</T>
        <T>“{simulation.moment}”</T>
        <T variant="small" muted>Maya gets an independent sample-photo reference and moment, not a copy of your personal photo. This demo currently uses the destination’s catalog photograph.</T>
        <Button label="Confirm Maya’s sample visit" onPress={async () => {
          const edition = mayaConfirmation(state, outing.id, simulation.placeId);
          if (!edition) { setSimulationError('The visit changed. Close this preview and check the outing before trying again.'); return; }
          await commit({ type: 'ADD_EDITION', edition });
          setNotice(`Maya’s sample visit at ${placeById(edition.placeId)?.name} is confirmed. Your collection totals have not changed.`);
          setConfirmPlaceId(undefined);
        }} />
      </> : <T>This visit can no longer be simulated. Maya may have already confirmed, or your visit was removed.</T>}
      {!!(simulationError || error) && <T accessibilityLiveRegion="polite" color={colors.error}>{simulationError || error}</T>}
      <Button label="Cancel" variant="ghost" onPress={() => setConfirmPlaceId(undefined)} />
    </Sheet>
  </Screen>;
}
