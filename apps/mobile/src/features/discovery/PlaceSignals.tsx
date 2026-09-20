import { Pressable, StyleSheet, View } from 'react-native';
import { Icon, T } from '@/components/ui';
import { colors } from '@/design/tokens';

export function PlaceSignal({ icon, eyebrow, value, onPress }: { icon: 'sparkles' | 'people' | 'clock'; eyebrow: string; value: string; onPress: () => void }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={`${eyebrow}: ${value}. Learn more`} onPress={onPress} style={styles.row}>
    <View style={styles.icon}><Icon name={icon} size={19} /></View><View style={{ flex: 1 }}><T variant="small" muted>{eyebrow}</T><T variant="label">{value}</T></View><Icon name="info" size={18} color={colors.muted} />
  </Pressable>;
}
const styles = StyleSheet.create({ row: { minHeight: 63, paddingVertical: 9, flexDirection: 'row', alignItems: 'center', gap: 11, borderBottomWidth: 1, borderBottomColor: colors.divider }, icon: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.brandSoft } });
