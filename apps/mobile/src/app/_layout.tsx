import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useFonts, Inter_400Regular, Inter_500Medium, Inter_700Bold } from '@expo-google-fonts/inter';
import { PlayfairDisplay_700Bold, PlayfairDisplay_800ExtraBold } from '@expo-google-fonts/playfair-display';
import { useEffect } from 'react';
import { Platform, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AppProvider } from '@/state/AppProvider';
import '../global.css';

void SplashScreen.preventAutoHideAsync();
export default function RootLayout() {
  const [loaded, error] = useFonts({ Inter: Inter_400Regular, InterMedium: Inter_500Medium, InterBold: Inter_700Bold, Playfair: PlayfairDisplay_700Bold, PlayfairBold: PlayfairDisplay_800ExtraBold });
  useEffect(() => { if (loaded || error) void SplashScreen.hideAsync(); }, [loaded, error]);
  if (!loaded && !error) return null;
  return <SafeAreaProvider><AppProvider><View style={{ flex: 1, backgroundColor: '#F0F2EF' }}><View style={{ flex: 1, width: '100%', maxWidth: Platform.OS === 'web' ? 480 : undefined, alignSelf: 'center', backgroundColor: '#fff', boxShadow: Platform.OS === 'web' ? '0 0 60px #144F5D10' : undefined }}>
    <StatusBar style="dark" /><Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: '#fff' }, animation: 'slide_from_right' }}><Stack.Screen name="(tabs)" /><Stack.Screen name="capture" options={{ presentation: 'modal' }} /></Stack>
  </View></View></AppProvider></SafeAreaProvider>;
}
