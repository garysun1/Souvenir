import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { PlacePhoto } from '@/components/cards/PlacePhoto';
import PlaceMap from '@/components/map/PlaceMap';
import { Button, DemoLabel, Icon, Sheet, T } from '@/components/ui';
import { colors } from '@/design/tokens';
import { minuteLabel, restoredConstraints, type Proposal } from '@/domain/planner';
import type { Plan, PlanConstraints, PlanStop } from '@/domain/types';
import { placeById } from '@/fixtures/catalog';
import { PLANNER_ORIGIN, PLANNER_ORIGIN_LABEL, PLANNING_SOURCE, sampleAccess, sampleTravel, travelKey } from '@/fixtures/travel';
import { money } from '@/state/selectors';

export const dollars = (cents: number) => `$${(cents / 100).toFixed(cents % 100 ? 2 : 0)}`;
export const duration = (minutes: number) => `${Math.floor(minutes / 60) ? `${Math.floor(minutes / 60)}h ` : ''}${minutes % 60}m`;
export function Notice({ title, children }: { title: string; children: React.ReactNode }) {
  return <View style={plannerStyles.notice}><T variant="label" color={colors.brand}>{title}</T>{children}</View>;
}
export function Unavailable({ message }: { message: string }) {
  return <Notice title="This plan is unavailable"><T muted>{message}</T><Button label="Back to saved plans" variant="outline" onPress={() => router.replace('/plans')} /></Notice>;
}

export function PlanRoute({ stops, onNavigate }: { stops: PlanStop[]; onNavigate?: () => void }) {
  const mapped = stops.map(stop => placeById(stop.placeId)).filter((place): place is NonNullable<typeof place> => !!place);
  const openPlace = (placeId: string) => { onNavigate?.(); router.push({ pathname: '/place/[placeId]', params: { placeId } }); };
  return <View style={{ gap: 12 }}>
    <DemoLabel label="Sample map · route order, not directions" />
    <PlaceMap places={mapped} height={240} showPreview={false} onSelect={openPlace} />
    <View style={plannerStyles.routeLine}>{mapped.map((place, index) => <Pressable key={place.id} accessibilityRole="button" accessibilityLabel={`Stop ${index + 1}: ${place.name}`} onPress={() => openPlace(place.id)} style={plannerStyles.routeStop}>
      <View style={plannerStyles.number}><T variant="label" color="#fff">{index + 1}</T></View><T variant="small" style={{ flex: 1 }}>{place.name}</T>
    </Pressable>)}</View>
    <T variant="small" muted>Dashed route order is schematic. Use official directions for a real visit; sample matrix times are not road routing.</T>
  </View>;
}

export function Itinerary({ stops, constraints, totalCostCents, totalMinutes, reasons, onReplace, actions }: {
  stops: PlanStop[]; constraints: PlanConstraints; totalCostCents: number; totalMinutes: number;
  reasons?: Record<string, string>; onReplace?: (placeId: string) => void; actions?: (stop: PlanStop, index: number) => React.ReactNode;
}) {
  const [sourceId, setSourceId] = useState<string | null>(null);
  const c = restoredConstraints(constraints);
  const sourcePlace = sourceId ? placeById(sourceId) : undefined;
  return <View style={{ gap: 12 }}>
    <View style={plannerStyles.row}><Icon name="pin" size={18} /><T variant="small" muted style={{ flex: 1 }}>Start {minuteLabel(c.startMinute)} · {PLANNER_ORIGIN_LABEL}</T></View>
    {stops.map((stop, index) => {
      const place = placeById(stop.placeId);
      if (!place) return <Notice key={stop.placeId} title="Place unavailable"><T>This stop is no longer in the catalog.</T></Notice>;
      const leave = index ? stops[index - 1].departureMinute : c.startMinute;
      const reachesVenue = leave + stop.travelMinutes;
      return <View key={stop.placeId} style={{ gap: 10 }}>
        <View style={plannerStyles.transfer}><Icon name="arrow" size={17} /><T variant="small" muted style={{ flex: 1 }}>{minuteLabel(leave)}–{minuteLabel(reachesVenue)} · {stop.travelMinutes} min {c.transport} · Sample estimate</T></View>
        <View style={plannerStyles.card}>
          <Pressable accessibilityRole="button" accessibilityLabel={`View ${place.name}`} onPress={() => router.push({ pathname: '/place/[placeId]', params: { placeId: place.id } })}>
            <PlacePhoto placeId={place.id} style={{ height: 154, width: '100%' }} />
          </Pressable>
          <View style={plannerStyles.cardBody}>
            <View style={plannerStyles.row}><View style={plannerStyles.number}><T variant="label" color="#fff">{index + 1}</T></View><T variant="heading" style={{ flex: 1 }}>{place.name}</T></View>
            <T variant="label" color={colors.brand}>{minuteLabel(stop.arrivalMinute)}–{minuteLabel(stop.departureMinute)} · {money(stop.costCents)} {place.canonical ? 'estimated per person' : 'admission/person'}</T>
            <T variant="small" muted>{place.canonical ? 'User-entered time and cost estimates. Venue hours, admission and travel are not verified.' : `${stop.arrivalMinute - reachesVenue} min before visit: 10-minute arrival buffer${stop.arrivalMinute - reachesVenue > 10 ? ' + opening / timed-entry wait' : ''}.`}</T>
            {reasons?.[place.id] && <T>{reasons[place.id]}</T>}
            <T variant="small" muted>{sampleAccess[place.id]?.note ?? 'Access source unavailable.'}</T>
            <Pressable accessibilityRole="button" accessibilityLabel={`Sample sources for ${place.name}`} onPress={() => setSourceId(place.id)} style={plannerStyles.sourceButton}><Icon name="info" size={16} /><T variant="small" color={colors.brand}>Sample hours · cost · access · travel</T></Pressable>
            {onReplace && <Button variant="outline" label="Replace this stop" onPress={() => onReplace(place.id)} />}
            {actions?.(stop, index)}
          </View>
        </View>
      </View>;
    })}
    {c.returnToOrigin && stops.length > 0 && <Notice title="Return to the origin included"><T variant="small">{sampleTravel[c.transport][travelKey(stops[stops.length - 1].placeId, PLANNER_ORIGIN)]?.minutes ?? 'Unknown'} min {c.transport} · sample estimate. Arrive {minuteLabel(c.startMinute + totalMinutes)}.</T></Notice>}
    <View style={plannerStyles.summary}>
      <T variant="label">{stops.length} experiences · {duration(totalMinutes)} · {dollars(totalCostCents)}/person</T>
      <T variant="small" muted>Admission + travel · Ends {minuteLabel(c.startMinute + totalMinutes)} LA time</T>
      <T variant="small" muted>{dollars(totalCostCents * c.participantIds.length)} for {c.participantIds.length} {c.participantIds.length === 1 ? 'person' : 'people'}. Meals and optional purchases excluded.</T>
      <T variant="small" muted>{c.returnToOrigin ? 'Includes return to origin.' : 'Finishes at the last stop; return travel excluded.'}</T>
    </View>
    <Sheet visible={!!sourcePlace} onClose={() => setSourceId(null)} title="Planning assumptions">
      {sourcePlace?.canonical ? <T>Hours, admission, access and travel are unknown. The saved plan contains user-entered estimates only.</T> : sourcePlace && <>
        <DemoLabel label={PLANNING_SOURCE} />
        <T variant="place">{sourcePlace.name}</T>
        <T>Sample hours: {minuteLabel(sourcePlace.openHour * 60)}–{minuteLabel(sourcePlace.closeHour * 60)} in America/Los_Angeles.</T>
        <T>Sample admission: {dollars(sourcePlace.priceCents)}/person.</T>
        <T>{sampleAccess[sourcePlace.id]?.note}</T>
        <T muted>These are authored fixtures, not current venue advice. Transit uses $1.75 per leg without transfer discounts. No reservations or payments are made.</T>
        <Button variant="outline" label="Open source details" onPress={() => { setSourceId(null); router.push({ pathname: '/settings/sources', params: { placeId: sourcePlace.id, sourceId: 'curated' } }); }} />
      </>}
    </Sheet>
  </View>;
}

/** A saved snapshot is used only for change comparison; it is never re-labeled as checked. */
export function proposalSnapshot(plan: Plan): Proposal {
  return { constraints: restoredConstraints(plan.constraints), stops: plan.stops, legs: [], totalCostCents: plan.totalCostCents, totalPartyCostCents: plan.totalCostCents * plan.constraints.participantIds.length, totalMinutes: plan.totalMinutes, finishMinute: plan.constraints.startMinute + plan.totalMinutes, checks: plan.checks, warnings: plan.checks.filter(check => /sample planning|excluded|return|timed entry|indoor visits/i.test(check)), reasons: {}, score: 0 };
}
export const plannerStyles = StyleSheet.create({
  stack: { gap: 14 }, row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  notice: { backgroundColor: colors.brandSoft, padding: 16, borderRadius: 12, gap: 8 },
  card: { borderWidth: 1, borderColor: colors.border, borderRadius: 14, overflow: 'hidden' },
  cardBody: { padding: 16, gap: 10 }, number: { width: 28, height: 28, borderRadius: 14, backgroundColor: colors.brand, alignItems: 'center', justifyContent: 'center' },
  transfer: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 10, paddingLeft: 8 },
  sourceButton: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  summary: { padding: 16, borderWidth: 1, borderColor: colors.border, borderRadius: 12, gap: 5 },
  routeLine: { borderLeftWidth: 2, borderStyle: 'dashed', borderColor: colors.brand, marginLeft: 14, gap: 24 },
  routeStop: { marginLeft: -15, flexDirection: 'row', gap: 10, alignItems: 'center', minHeight: 44 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  error: { padding: 16, backgroundColor: '#FFF1F1', borderRadius: 12, gap: 8 },
});
