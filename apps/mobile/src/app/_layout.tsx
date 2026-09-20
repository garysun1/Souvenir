import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useFonts, Inter_400Regular, Inter_500Medium, Inter_700Bold } from '@expo-google-fonts/inter';
import { PlayfairDisplay_700Bold, PlayfairDisplay_800ExtraBold } from '@expo-google-fonts/playfair-display';
import { useEffect } from 'react';
import { ActivityIndicator, Platform, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AppProvider, useApp } from '@/state/AppProvider';
import { Button, Screen, T } from '@/components/ui';
import Welcome from './welcome';
import '../global.css';

void SplashScreen.preventAutoHideAsync();
export default function RootLayout() {
  const [loaded, error] = useFonts({ Inter: Inter_400Regular, InterMedium: Inter_500Medium, InterBold: Inter_700Bold, Playfair: PlayfairDisplay_700Bold, PlayfairBold: PlayfairDisplay_800ExtraBold });
  useEffect(() => { if (loaded || error) void SplashScreen.hideAsync(); }, [loaded, error]);
  if (!loaded && !error) return null;
  return <SafeAreaProvider><AppProvider><View style={{ flex: 1, backgroundColor: '#F0F2EF' }}><View style={{ flex: 1, width: '100%', maxWidth: Platform.OS === 'web' ? 480 : undefined, alignSelf: 'center', backgroundColor: '#fff', boxShadow: Platform.OS === 'web' ? '0 0 60px #144F5D10' : undefined }}>
    <StatusBar style="dark" /><AccountBoundary />
  </View></View></AppProvider></SafeAreaProvider>;
}
function AccountBoundary() {
  const { mode, userId, authReady, ready, refresh, signOut, error } = useApp();
  if (!authReady) return <View style={{ flex: 1, justifyContent: 'center' }}><ActivityIndicator accessibilityLabel="Restoring session" /></View>;
  if (mode === 'signedOut') return <Welcome />;
  if (!ready) return <Screen><T variant="title">Your account</T>{error ? <><Button label="Retry loading" onPress={refresh} /><Button label="Sign out" variant="outline" onPress={signOut} /></> : <ActivityIndicator accessibilityLabel="Loading your account" />}</Screen>;
  return <Stack key={`${mode}:${userId ?? 'demo'}`} screenOptions={{ headerShown: false, contentStyle: { backgroundColor: '#fff' }, animation: 'slide_from_right' }}><Stack.Screen name="(tabs)" /><Stack.Screen name="capture" options={{ presentation: 'modal' }} /></Stack>;
}
