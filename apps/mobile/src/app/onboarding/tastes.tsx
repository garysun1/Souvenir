import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { Button, Header, Icon, Screen, T, type IconName } from '@/components/ui';
import { colors } from '@/design/tokens';
import type { Category } from '@/domain/types';
import { useApp } from '@/state/AppProvider';
const options: { id: Category; title: string; description: string; icon: IconName }[] = [
  { id: 'cultural', title: 'A little culture', description: 'Art, quiet galleries, and a new perspective.', icon: 'building' },
  { id: 'park', title: 'Room to breathe', description: 'Gardens, green spaces, and golden hours.', icon: 'leaf' },
  { id: 'landmark', title: 'Stories of the city', description: 'Architecture, icons, and hidden history.', icon: 'pin' },
];
export default function Tastes() {
  const { state, commit } = useApp();
  const [selected, setSelected] = useState(state.preferences.tastes);
  return <Screen><Header back /><View style={{ gap: 18, paddingTop: 20 }}><T variant="small" color={colors.brand}>MAKE IT YOURS</T><T variant="title">What draws you out?</T><T muted>Choose a few things you love. We’ll find places that feel like you.</T>
    {options.map(option => <Pressable key={option.id} accessibilityRole="checkbox" accessibilityState={{ checked: selected.includes(option.id) }} onPress={() => setSelected(current => current.includes(option.id) ? current.filter(id => id !== option.id) : [...current, option.id])} style={{ borderWidth: 1, borderColor: selected.includes(option.id) ? colors.brand : colors.border, borderRadius: 14, padding: 20, flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: selected.includes(option.id) ? colors.brandSoft : '#fff' }}><Icon name={option.icon} size={28} /><View style={{ flex: 1, gap: 6 }}><T variant="heading">{option.title}</T><T variant="small" muted>{option.description}</T></View>{selected.includes(option.id) && <Icon name="check" size={18} />}</Pressable>)}
    <Button label="Find my next memory" disabled={!selected.length} onPress={async () => { await commit({ type: 'PREFERENCES', patch: { tastes: selected, onboardingComplete: true } }); router.replace('/discover'); }} />
  </View></Screen>;
}
