import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { PlacePhoto } from '@/components/cards/PlacePhoto';
import { AvatarStack, Button, DemoLabel, EmptyState, Header, Icon, Screen, T, Tabs } from '@/components/ui';
import { colors } from '@/design/tokens';
import { associatedEdition, localDate, minuteLabel } from '@/domain/planner';
import { dollars, duration, plannerStyles } from '@/features/planner/components';
import { placeById } from '@/fixtures/catalog';
import { useApp } from '@/state/AppProvider';
import { visitDate } from '@/state/selectors';

export default function SavedPlansRoute() {
  const { state } = useApp();
  const [filter, setFilter] = useState<'all' | 'accepted' | 'completed'>('all');
  const plans = state.plans.filter(plan => filter === 'all' || plan.status === filter).slice().sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id));
  return <Screen>
    <Header title="Your plans" back right={<Button label="New" variant="ghost" onPress={() => router.push('/planner')} />} />
    <DemoLabel label={state.mode === 'account' ? 'Account plans · estimates, no reservations' : 'Saved locally · sample itineraries, not reservations'} />
    <View style={{ marginTop: 20 }}><Tabs options={[{ value: 'all', label: 'All' }, { value: 'accepted', label: 'To visit' }, { value: 'completed', label: 'Completed' }]} value={filter} onChange={setFilter} underline /></View>
    {plans.length === 0 ? <EmptyState icon="map" title={filter === 'completed' ? 'Memories still to make' : filter === 'accepted' ? 'A new afternoon awaits' : 'Make room for an afternoon'} message={filter === 'completed' ? 'Capture your own edition at each stop in an accepted outing to complete it. Friend captures do not count as yours.' : 'Build a two-stop sample plan, adjust it to suit you, then accept it here. No reservations are made.'} action={state.plans.length ? 'Show all plans' : 'Plan an afternoon'} onPress={() => state.plans.length ? setFilter('all') : router.push('/planner')} /> : <View style={{ gap: 18 }}>
      {plans.map(plan => {
        const captured = plan.stops.filter(stop => associatedEdition(state, plan.id, stop.placeId)).length;
        const isPast = plan.constraints.date < localDate(state.clock);
        return <Pressable key={plan.id} accessibilityRole="button" accessibilityLabel={`${plan.title}, ${plan.status}, ${captured} of ${plan.stops.length} captured`} onPress={() => router.push({ pathname: '/plans/[planId]', params: { planId: plan.id } })} style={plannerStyles.card}>
          <View style={{ flexDirection: 'row' }}>{plan.stops.map(stop => <PlacePhoto key={stop.placeId} placeId={stop.placeId} style={{ flex: 1, height: 128 }} />)}</View>
          <View style={plannerStyles.cardBody}>
            <View style={plannerStyles.row}><T variant="heading" style={{ flex: 1 }}>{plan.title}</T><Icon name="chevron" /></View>
            <T variant="small" muted>{plan.stops.map(stop => placeById(stop.placeId)?.name ?? 'Unavailable place').join(' + ')}</T>
            <T variant="label" color={colors.brand}>{plan.status === 'completed' ? 'Completed' : isPast ? 'Past sample · to visit' : 'Upcoming sample'} · {captured}/{plan.stops.length} captured</T>
            <T variant="small">{visitDate(`${plan.constraints.date}T12:00:00Z`)} · {minuteLabel(plan.constraints.startMinute)} LA · Version {plan.version}</T>
            <View style={plannerStyles.row}><AvatarStack ids={plan.constraints.participantIds} /><T variant="small" muted>{duration(plan.totalMinutes)} · {dollars(plan.totalCostCents)}/person</T></View>
          </View>
        </Pressable>;
      })}
    </View>}
  </Screen>;
}
