import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { Button, DemoLabel, Header, Icon, Screen, Sheet, T } from '@/components/ui';
import { colors } from '@/design/tokens';
import { placeById } from '@/fixtures/catalog';
import { useApp } from '@/state/AppProvider';
import { money, visitDate } from '@/state/selectors';

export default function BookingPreview() {
  const { planId } = useLocalSearchParams<{ planId?: string }>();
  const { state } = useApp();
  const plan = state.plans.find(item => item.id === planId);
  const [handoff, setHandoff] = useState(false);
  return <Screen>
    <Header title="Visit handoff" back />
    <DemoLabel label="Concept preview · not connected to Visa or venues" />
    <T variant="title" style={{ marginTop: 20 }}>From a saved afternoon{'\n'}to the venue itself.</T>
    <T muted style={{ marginTop: 10 }}>A future release could hand an accepted plan to official ticket and payment providers. Souvenir would still show the venue, price, cancellation terms, and provider before you leave the app.</T>
    <View style={{ marginVertical: 24, padding: 18, backgroundColor: colors.surface, borderRadius: 16, gap: 12 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}><Icon name="info" /><T variant="heading" style={{ flex: 1 }}>{plan?.title ?? 'No accepted plan selected'}</T></View>
      {plan ? <><T>{visitDate(`${plan.constraints.date}T12:00:00Z`)} · {money(plan.totalCostCents)} sample cost per person</T>{plan.stops.map(stop => <T key={stop.placeId} variant="small">• {placeById(stop.placeId)?.name ?? 'Unavailable destination'}</T>)}</> : <T muted>Accept a planner proposal to preview a contextual handoff. You can still inspect the disclosure below.</T>}
    </View>
    <View style={{ borderWidth: 1, borderColor: colors.border, borderRadius: 16, padding: 18, gap: 10 }}><T variant="label">Before any future handoff</T>{['Official provider is named', 'Full price and cancellation terms are shown', 'Nothing is reserved until you confirm outside Souvenir', 'Your card details never enter this prototype'].map(item => <View key={item} style={{ flexDirection: 'row', gap: 9 }}><Icon name="check" size={17} color={colors.positive} /><T variant="small" style={{ flex: 1 }}>{item}</T></View>)}</View>
    <Button label={plan ? 'Preview provider disclosure' : 'Create a plan first'} icon="arrow" disabled={!plan} onPress={() => setHandoff(true)} style={{ marginTop: 20 }} />
    <Button label="Close without continuing" variant="ghost" onPress={() => router.back()} />
    <Sheet visible={handoff} title="You would leave Souvenir" onClose={() => setHandoff(false)}>
      <T>This is where a future version would show the official venue or payment provider, itemized price, data shared, and cancellation policy.</T>
      <View style={{ backgroundColor: '#FFF7DF', borderRadius: 12, padding: 14 }}><T variant="label">Prototype stop</T><T variant="small">No provider request was made. No ticket, payment, hold, reservation, or confirmation exists.</T></View>
      <Button label="Cancel handoff" variant="outline" onPress={() => setHandoff(false)} />
    </Sheet>
  </Screen>;
}
