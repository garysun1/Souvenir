import { createElement } from 'react';
import { View } from 'react-native';
import { T } from '@/components/ui';
import { localVisitInput, parseLocalVisit } from '@/domain/capture';
import { colors, fonts } from '@/design/tokens';
export function DateTimeField({ value, onChange }: { value: string; onChange: (iso: string) => void }) {
  return <View style={{ gap: 8 }}><T variant="label">Visit date and time</T>{createElement('input', { type: 'datetime-local', value: localVisitInput(value), onChange: (event: React.ChangeEvent<HTMLInputElement>) => { const next = parseLocalVisit(event.currentTarget.value); if (next) onChange(next); }, 'aria-label': 'Visit date and time in Los Angeles', style: { minHeight: 48, border: `1px solid ${colors.border}`, borderRadius: 12, padding: 13, color: colors.text, fontFamily: fonts.body, fontSize: 14, boxSizing: 'border-box', width: '100%' } })}<T variant="small" muted>Los Angeles time</T></View>;
}
