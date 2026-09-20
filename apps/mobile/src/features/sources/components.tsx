import { router } from 'expo-router';
import { useState } from 'react';
import { Linking, Pressable, StyleSheet, View } from 'react-native';
import { Button, Icon, T, type IconName } from '@/components/ui';
import { colors } from '@/design/tokens';

export function SettingsRow({ title, subtitle, icon, onPress }: { title: string; subtitle: string; icon: IconName; onPress: () => void }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={`${title}. ${subtitle}`} onPress={onPress} style={({ pressed }) => [styles.row, pressed && styles.pressed]}>
    <Icon name={icon} /><View style={styles.grow}><T variant="label">{title}</T><T variant="small" muted>{subtitle}</T></View><Icon name="chevron" size={18} />
  </Pressable>;
}

/** Opening documentation is explicit and optional; the app never fetches source feeds. */
export function SourceLink({ url, label = 'View source documentation' }: { url: string; label?: string }) {
  const [failed, setFailed] = useState(false);
  const open = async () => {
    setFailed(false);
    try {
      if (!/^https?:\/\//i.test(url)) throw new Error('Unsupported source link');
      await Linking.openURL(url);
    } catch { setFailed(true); }
  };
  return <View style={{ gap: 5 }}>
    <Button label={failed ? `Retry: ${label}` : label} variant="outline" icon="arrow" onPress={open} />
    {failed && <T accessibilityRole="alert" color={colors.error}>Could not open the link. Try again when a browser and connection are available.</T>}
    <T variant="small" muted selectable>{url}</T>
  </View>;
}

export function CatalogDocumentationLink({ onBeforeNavigate }: { onBeforeNavigate?: () => void }) {
  return <Button label="Read catalog documentation" variant="outline" icon="info" onPress={() => { onBeforeNavigate?.(); router.push('/settings/about'); }} />;
}

export function DetailLine({ label, value }: { label: string; value: string }) {
  return <View style={{ gap: 3 }}><T variant="small" muted>{label}</T><T selectable>{value}</T></View>;
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 14, alignItems: 'center', minHeight: 80, paddingVertical: 18, borderBottomWidth: 1, borderBottomColor: colors.divider },
  grow: { flex: 1, gap: 3 }, pressed: { backgroundColor: colors.surface },
});
