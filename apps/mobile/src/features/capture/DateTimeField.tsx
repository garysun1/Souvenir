import DateTimePicker, { type DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { T } from '@/components/ui';
import { CAPTURE_TIMEZONE, localVisitInput, parseLocalVisit } from '@/domain/capture';
import { colors } from '@/design/tokens';

export function DateTimeField({ value, onChange }: { value: string; onChange: (iso: string) => void }) {
  const [mode, setMode] = useState<'date' | 'time'>();
  const date = Number.isFinite(Date.parse(value)) ? new Date(value) : new Date();
  const handle = (_event: DateTimePickerEvent, selected?: Date) => {
    setMode(undefined);
    if (!selected) return;
    const existing = localVisitInput(value).split('T');
    const chosen = localVisitInput(selected.toISOString()).split('T');
    const next = parseLocalVisit(mode === 'date' ? `${chosen[0]}T${existing[1]}` : `${existing[0]}T${chosen[1]}`);
    if (next) onChange(next);
  };
  return <View style={{ gap: 8 }}><T variant="label">Visit date and time</T><View style={{ flexDirection: 'row', gap: 8 }}>
    <Pressable accessibilityRole="button" onPress={() => setMode('date')} style={field}><T>{new Intl.DateTimeFormat('en-US', { timeZone: CAPTURE_TIMEZONE, month: 'short', day: 'numeric', year: 'numeric' }).format(date)}</T></Pressable>
    <Pressable accessibilityRole="button" onPress={() => setMode('time')} style={field}><T>{new Intl.DateTimeFormat('en-US', { timeZone: CAPTURE_TIMEZONE, hour: 'numeric', minute: '2-digit' }).format(date)}</T></Pressable>
  </View>{mode && <DateTimePicker value={date} mode={mode} timeZoneName={CAPTURE_TIMEZONE} onChange={handle} />}</View>;
}
const field = { flex: 1, minHeight: 48, borderWidth: 1, borderColor: colors.border, borderRadius: 12, justifyContent: 'center' as const, paddingHorizontal: 13 };
