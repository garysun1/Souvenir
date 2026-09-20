import { router } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { ActivityIndicator, Modal, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View, type StyleProp, type TextProps, type ViewStyle, type TextInputProps } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, fonts } from '@/design/tokens';
import { useApp } from '@/state/AppProvider';
import { users } from '@/fixtures/catalog';
import { Icon, type IconName } from './Icon';
export { Icon, type IconName } from './Icon';

export function T({ variant = 'body', muted, color, style, ...props }: TextProps & { variant?: 'body' | 'small' | 'label' | 'title' | 'heading' | 'place' | 'wordmark'; muted?: boolean; color?: string }) {
  return <Text {...props} style={[styles.text, textVariants[variant], muted && { color: colors.muted }, color && { color }, style]} />;
}
export function Screen({ children, scroll = true, padded = true, style }: { children: ReactNode; scroll?: boolean; padded?: boolean; style?: StyleProp<ViewStyle> }) {
  const { error, clearError, mode, refresh, refreshing, ready } = useApp();
  return <SafeAreaView edges={['top', 'left', 'right']} style={[styles.screen, style]}>
    {error && <Pressable accessibilityRole="button" accessibilityLabel="Dismiss error" onPress={clearError} style={styles.error}><T color={colors.error}>{error}</T></Pressable>}
    {mode === 'account' && ready && <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 22 }}><T variant="small" muted>Account · synced visits</T><Button label={refreshing ? 'Refreshing…' : 'Refresh'} loading={refreshing} variant="ghost" onPress={refresh} /></View>}
    {scroll ? <ScrollView refreshControl={mode === 'account' && ready ? <RefreshControl refreshing={refreshing} onRefresh={() => { void refresh().catch(() => undefined); }} /> : undefined} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} contentContainerStyle={[styles.content, padded && styles.padding]}>{children}</ScrollView> : <View style={[{ flex: 1 }, padded && styles.padding]}>{children}</View>}
  </SafeAreaView>;
}
export function Header({ title, back = false, right, subtitle }: { title?: string; back?: boolean; right?: ReactNode; subtitle?: string }) {
  return <View style={styles.header}>
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 }}>
      {back && <IconButton name="back" label="Go back" onPress={() => router.canGoBack() ? router.back() : router.replace('/discover')} />}
      <View style={{ flex: 1 }}><T variant={title ? 'title' : 'wordmark'} color={colors.brand}>{title ?? 'souvenir'}</T>{subtitle && <T variant="small" muted>{subtitle}</T>}</View>
    </View>{right}
  </View>;
}
export function Button({ label, onPress, variant = 'primary', disabled, loading, icon, style }: { label: string; onPress: () => void | Promise<unknown>; variant?: 'primary' | 'outline' | 'ghost'; disabled?: boolean; loading?: boolean; icon?: IconName; style?: StyleProp<ViewStyle> }) {
  const [pending, setPending] = useState(false);
  const busy = loading || pending;
  return <Pressable accessibilityRole="button" accessibilityState={{ disabled: !!disabled || !!busy, busy: !!busy }} disabled={disabled || busy}
    onPress={async () => { setPending(true); try { await onPress(); } catch { /* The shared store exposes persistence failures. */ } finally { setPending(false); } }}
    style={({ pressed }) => [styles.button, variant === 'primary' ? styles.primary : variant === 'outline' ? styles.outline : styles.ghost, (disabled || busy) && { opacity: 0.5 }, pressed && { opacity: 0.75 }, style]}>
    {busy ? <ActivityIndicator color={variant === 'primary' ? '#fff' : colors.brand} /> : icon && <Icon name={icon} size={18} color={variant === 'primary' ? '#fff' : colors.brand} />}
    <T variant="label" color={variant === 'primary' ? '#fff' : colors.brand}>{label}</T>
  </Pressable>;
}
export function IconButton({ name, label, onPress, color, filled = false }: { name: IconName; label: string; onPress: () => void; color?: string; filled?: boolean }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} hitSlop={5} style={({ pressed }) => [styles.iconButton, pressed && { backgroundColor: colors.surface }]}><Icon name={name} color={color} filled={filled} /></Pressable>;
}
export function Chip({ label, selected = false, onPress, icon }: { label: string; selected?: boolean; onPress?: () => void; icon?: IconName }) {
  return <Pressable accessibilityRole={onPress ? 'button' : undefined} accessibilityState={{ selected }} onPress={onPress} style={[styles.chip, selected && { backgroundColor: colors.brand, borderColor: colors.brand }]}>
    {icon && <Icon name={icon} size={15} color={selected ? '#fff' : colors.brand} />}<T variant="small" color={selected ? '#fff' : colors.text}>{label}</T>
  </Pressable>;
}
export function ChipRow({ children }: { children: ReactNode }) {
  return <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingVertical: 8, alignItems: 'center' }}>{children}</ScrollView>;
}
export function Tabs<TValue extends string>({ options, value, onChange, underline = false }: { options: { value: TValue; label: string }[]; value: TValue; onChange: (value: TValue) => void; underline?: boolean }) {
  return <View style={underline ? styles.underlineGroup : styles.segmentGroup}>{options.map(option => <Pressable key={option.value} accessibilityRole="tab" accessibilityState={{ selected: value === option.value }} onPress={() => onChange(option.value)} style={[underline ? styles.underlineTab : styles.segment, value === option.value && (underline ? styles.underlineActive : styles.segmentActive)]}>
    <T variant="label" color={value === option.value ? (underline ? colors.brand : '#fff') : colors.muted}>{option.label}</T>
  </Pressable>)}</View>;
}
export function SectionHeading({ title, action, onPress }: { title: string; action?: string; onPress?: () => void }) {
  return <View style={styles.sectionHeading}><T variant="heading" style={{ flex: 1 }}>{title}</T>{action && <Pressable accessibilityRole="button" onPress={onPress} style={{ minHeight: 44, justifyContent: 'center' }}><T variant="small" color={colors.brand}>{action} →</T></Pressable>}</View>;
}
export function Field({ label, ...props }: TextInputProps & { label?: string }) {
  return <View style={{ gap: 8 }}>{label && <T variant="label">{label}</T>}<TextInput accessibilityLabel={label ?? props.placeholder} placeholderTextColor="#808080" {...props} style={[styles.input, props.multiline && { minHeight: 100, textAlignVertical: 'top' }, props.style]} /></View>;
}
export function EmptyState({ title, message, action, onPress, icon = 'compass' }: { title: string; message: string; action?: string; onPress?: () => void; icon?: IconName }) {
  return <View style={styles.empty}><View style={styles.emptyIcon}><Icon name={icon} size={32} /></View><T variant="heading" style={{ textAlign: 'center' }}>{title}</T><T muted style={{ textAlign: 'center' }}>{message}</T>{action && onPress && <Button label={action} onPress={onPress} />}</View>;
}
export function Sheet({ visible, onClose, title, children }: { visible: boolean; onClose: () => void; title: string; children: ReactNode }) {
  return <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
    <View style={styles.modal}><Pressable accessibilityLabel="Close sheet" onPress={onClose} style={StyleSheet.absoluteFill} /><View accessibilityViewIsModal style={styles.sheet}><View style={styles.handle} /><View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 16 }}><T variant="heading" style={{ flex: 1 }}>{title}</T><IconButton name="close" label="Close" onPress={onClose} /></View><ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ gap: 16, paddingBottom: 20 }}>{children}</ScrollView></View></View>
  </Modal>;
}
export function Avatar({ userId, size = 34 }: { userId: string; size?: number }) {
  const user = users.find(person => person.id === userId) ?? { name: userId, color: '#D5E3DC', initials: userId.slice(0, 1).toUpperCase() };
  return <View accessibilityLabel={user.name} style={{ height: size, width: size, borderRadius: size / 2, backgroundColor: user.color, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: '#fff' }}><T variant="label" color={colors.brand} style={{ fontSize: size * 0.36 }}>{user.initials}</T></View>;
}
export function AvatarStack({ ids }: { ids: string[] }) {
  return <View style={{ flexDirection: 'row', paddingLeft: 6 }}>{ids.slice(0, 3).map(id => <View key={id} style={{ marginLeft: -6 }}><Avatar userId={id} size={28} /></View>)}{ids.length > 3 && <T variant="small">+{ids.length - 3}</T>}</View>;
}
export function DemoLabel({ label = 'Demo data', small = false }: { label?: string; small?: boolean }) {
  return <View style={{ flexDirection: 'row', gap: 5, alignItems: 'center' }}><View style={{ width: 5, height: 5, borderRadius: 3, backgroundColor: colors.positive }} /><T variant="small" muted style={small ? { fontSize: 10 } : undefined}>{label}</T></View>;
}
export function Divider() { return <View style={{ height: 1, backgroundColor: colors.divider, marginVertical: 16 }} />; }
const textVariants = StyleSheet.create({
  body: { fontSize: 14, lineHeight: 22 }, small: { fontSize: 12, lineHeight: 18 },
  label: { fontFamily: fonts.medium, fontSize: 13, lineHeight: 20 },
  title: { fontFamily: fonts.serifBold, fontSize: 29, lineHeight: 38, letterSpacing: -0.65 },
  heading: { fontFamily: fonts.serif, fontSize: 22, lineHeight: 30, letterSpacing: -0.3 },
  place: { fontFamily: fonts.serif, fontSize: 17, lineHeight: 24 },
  wordmark: { fontFamily: fonts.serifBold, fontSize: 30, lineHeight: 40, letterSpacing: -1.2 },
});
const styles = StyleSheet.create({
  text: { fontFamily: fonts.body, color: colors.text }, screen: { flex: 1, backgroundColor: '#fff' },
  content: { paddingBottom: 36, flexGrow: 1 }, padding: { paddingHorizontal: 22 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingTop: 14, paddingBottom: 20 },
  button: { minHeight: 48, paddingHorizontal: 20, paddingVertical: 12, borderRadius: 25, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 8 },
  primary: { backgroundColor: colors.brand }, outline: { borderWidth: 1, borderColor: colors.brand, backgroundColor: '#fff' }, ghost: {},
  iconButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 22 },
  chip: { minHeight: 38, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, borderWidth: 1, borderColor: colors.border, flexDirection: 'row', gap: 6, alignItems: 'center' },
  underlineGroup: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: colors.divider, marginBottom: 16, gap: 24 },
  underlineTab: { minHeight: 48, justifyContent: 'center', borderBottomWidth: 2, borderBottomColor: 'transparent' },
  underlineActive: { borderBottomColor: colors.brand },
  segmentGroup: { borderRadius: 22, borderWidth: 1, borderColor: colors.border, flexDirection: 'row', padding: 3, alignSelf: 'flex-start' },
  segment: { paddingHorizontal: 18, paddingVertical: 7, borderRadius: 19, minHeight: 36, justifyContent: 'center' }, segmentActive: { backgroundColor: colors.brand },
  sectionHeading: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 23, marginBottom: 12 },
  input: { borderWidth: 1, borderColor: colors.border, backgroundColor: '#fff', borderRadius: 12, minHeight: 48, padding: 13, fontFamily: fonts.body, fontSize: 14, color: colors.text },
  empty: { paddingVertical: 42, paddingHorizontal: 18, alignItems: 'center', gap: 14 },
  emptyIcon: { height: 72, width: 72, borderRadius: 36, backgroundColor: colors.brandSoft, alignItems: 'center', justifyContent: 'center' },
  modal: { flex: 1, backgroundColor: '#00000060', justifyContent: 'flex-end', alignItems: 'center' },
  sheet: { backgroundColor: '#fff', borderTopLeftRadius: 26, borderTopRightRadius: 26, width: '100%', maxWidth: 540, maxHeight: '90%', padding: 22 },
  handle: { alignSelf: 'center', width: 36, height: 4, borderRadius: 2, backgroundColor: colors.border, marginBottom: 16 },
  error: { padding: 12, backgroundColor: '#FFF0F0' },
});
