import { router } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { View } from 'react-native';
import { Button, DemoLabel, Icon, Screen, T } from '@/components/ui';
import { PlacePhoto } from '@/components/cards/PlacePhoto';
import { useApp } from '@/state/AppProvider';
import { colors } from '@/design/tokens';
export default function Welcome() {
  const { commit } = useApp();
  const start = async (mode: 'sample' | 'empty') => { await commit({ type: 'RESET', mode }); router.push('/onboarding/tastes'); };
  return <Screen padded={false}><View style={{ paddingHorizontal: 26, paddingTop: 18, paddingBottom: 18, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}><T variant="wordmark" color={colors.brand}>souvenir</T><DemoLabel label="Los Angeles edition" /></View>
    <PlacePhoto placeId="la-echo-park" style={{ height: 330, borderRadius: 0 }}>
      <LinearGradient colors={['transparent', '#082C3899']} style={{ flex: 1, padding: 26, justifyContent: 'flex-end' }}><View style={{ flexDirection: 'row', gap: 6 }}><Icon name="pin" size={16} color="#fff" /><T variant="small" color="#fff">Echo Park Lake · Los Angeles</T></View></LinearGradient>
    </PlacePhoto>
    <View style={{ padding: 26, gap: 18 }}><T variant="title" style={{ fontSize: 36, lineHeight: 44 }}>A place becomes{'\n'}a part of you.</T><T muted>Find your next favorite corner. Make a little memory. Keep a souvenir.</T>
      <View style={{ flexDirection: 'row', gap: 22, marginVertical: 5 }}>{(['Discover', 'Experience', 'Collect'] as const).map((label, index) => <View key={label} style={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}><T variant="small" color={colors.brand}>0{index + 1}</T><T variant="small">{label}</T></View>)}</View>
      <Button label="Explore the sample collection" onPress={() => start('sample')} icon="arrow" />
      <Button label="Start with an empty collection" onPress={() => start('empty')} variant="outline" />
      <T variant="small" muted style={{ textAlign: 'center' }}>A local demo. Your memories stay on this device.</T>
    </View></Screen>;
}
