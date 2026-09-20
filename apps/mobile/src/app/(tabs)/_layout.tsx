import { router, usePathname } from 'expo-router';
import { Tabs, TabList, TabSlot, TabTrigger } from 'expo-router/ui';
import { Fragment } from 'react';
import { Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon, T, type IconName } from '@/components/ui';
import { colors } from '@/design/tokens';
const items: { name: string; href: '/discover' | '/collection' | '/friends' | '/profile'; icon: IconName; label: string }[] = [
  { name: 'discover', href: '/discover', icon: 'compass', label: 'Discover' },
  { name: 'collection', href: '/collection', icon: 'bookmark', label: 'Collection' },
  { name: 'friends', href: '/friends', icon: 'people', label: 'Friends' },
  { name: 'profile', href: '/profile', icon: 'user', label: 'Profile' },
];
export default function TabLayout() {
  const pathname = usePathname();
  const insets = useSafeAreaInsets();
  return <Tabs style={{ flex: 1 }}><TabSlot style={{ flex: 1 }} /><TabList style={{ backgroundColor: '#fff', flexDirection: 'row', alignItems: 'center', borderTopWidth: 1, borderTopColor: colors.divider, paddingBottom: Math.max(insets.bottom, 10), paddingTop: 9 }}>
    {items.map((item, index) => <Fragment key={item.name}>
      {index === 2 && <Pressable accessibilityRole="button" accessibilityLabel="Capture a visit" onPress={() => router.push('/capture')} style={{ flex: 1, alignItems: 'center', gap: 4 }}><View style={{ width: 45, height: 45, marginTop: -11, backgroundColor: colors.brand, borderRadius: 24, alignItems: 'center', justifyContent: 'center', borderWidth: 4, borderColor: '#fff' }}><Icon name="plus" color="#fff" size={26} /></View><T variant="small" style={{ fontSize: 10 }}>Capture</T></Pressable>}
      <TabTrigger name={item.name} href={item.href} asChild><Pressable accessibilityLabel={item.label} accessibilityRole="tab" style={{ flex: 1, flexDirection: 'column', alignItems: 'center', minHeight: 45, gap: 5 }}><Icon name={item.icon} color={pathname === item.href ? colors.brand : '#8A8A8A'} /><T variant="small" color={pathname === item.href ? colors.brand : '#737373'} style={{ fontSize: 10 }}>{item.label}</T></Pressable></TabTrigger>
    </Fragment>)}
  </TabList></Tabs>;
}
