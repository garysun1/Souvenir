import * as Location from 'expo-location';
import { DOWNTOWN_ORIGIN, type Coordinates } from '@/domain/search';

export interface DiscoveryLocation { origin: Coordinates; label: string; message: string; device: boolean }
export const downtownLocation = (message = 'A sample Downtown starting point. Your location is never requested automatically.'): DiscoveryLocation => ({
  origin: DOWNTOWN_ORIGIN, label: 'Downtown · sample origin', message, device: false,
});

/** Foreground-only, called exclusively after the explicit Use my location action. */
export async function requestDiscoveryLocation(): Promise<DiscoveryLocation> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const permission = await Location.requestForegroundPermissionsAsync();
    if (permission.status !== 'granted') return downtownLocation('Location was not allowed. Using the labeled Downtown sample origin instead.');
    const result = await Promise.race([
      Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }),
      new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error('Location timed out')), 10000); }),
    ]);
    return { origin: { latitude: result.coords.latitude, longitude: result.coords.longitude }, label: 'Your device location', device: true, message: 'Distances use your device location. The catalog, hours and recommendations are still sample data.' };
  } catch {
    return downtownLocation('Location is unavailable right now. You can retry or explore from the Downtown sample origin.');
  } finally {
    if (timer) clearTimeout(timer);
  }
}
