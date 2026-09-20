import Svg, { Circle, Path, Rect } from 'react-native-svg';
import { colors } from '@/design/tokens';
const paths = {
  compass: 'M16.2 7.8l-3 5.4-5.4 3 3-5.4 5.4-3Z',
  bookmark: 'M6 4h12v17l-6-4-6 4V4Z',
  camera: 'M4 7h4l2-3h4l2 3h4v13H4V7Z',
  people: 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2m20 0v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75',
  user: 'M20 21a8 8 0 0 0-16 0', search: 'm21 21-5-5',
  pin: 'M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 1 1 16 0Z',
  chevron: 'm9 5 7 7-7 7', down: 'm6 9 6 6 6-6', back: 'm14 5-7 7 7 7M7 12h14',
  plus: 'M12 5v14M5 12h14', close: 'm6 6 12 12M18 6 6 18', check: 'm5 12 4 4L19 6',
  heart: 'M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z',
  map: 'm9 18-6 3V6l6-3 6 3 6-3v15l-6 3-6-3Zm0-15v15m6-12v15',
  list: 'M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01',
  grid: 'M3 3h7v7H3V3Zm11 0h7v7h-7V3ZM3 14h7v7H3v-7Zm11 0h7v7h-7v-7Z',
  sparkles: 'm12 3 2.6 6.4L21 12l-6.4 2.6L12 21l-2.6-6.4L3 12l6.4-2.6L12 3Z',
  sun: 'M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5',
  clock: 'M12 6v6l4 2', arrow: 'M4 12h16m-6-6 6 6-6 6', info: 'M12 11v6m0-10h.01',
  settings: 'M12 3v3m0 12v3M3 12h3m12 0h3M5.6 5.6l2.1 2.1m8.6 8.6 2.1 2.1M5.6 18.4l2.1-2.1m8.6-8.6 2.1-2.1',
  upload: 'M12 16V3m-5 5 5-5 5 5M4 16v5h16v-5', edit: 'm16 3 5 5L8 21H3v-5L16 3Z',
  more: 'M5 12h.01M12 12h.01M19 12h.01', leaf: 'M20 3c-8-1-17 4-14 12s14 4 14-12ZM4 21 15 9',
  building: 'M3 21h18M4 9h16L12 3 4 9Zm2 3v6m6-6v6m6-6v6', image: 'M3 3h18v18H3V3Zm0 14 6-6 4 4 3-3 5 5',
  cloud: 'M6 18a5 5 0 1 1 0-10 7 7 0 0 1 13 3 3.5 3.5 0 0 1 0 7H6Z',
  globe: 'M2 12h20M12 2c6 6 6 14 0 20-6-6-6-14 0-20Z', share: 'M12 16V3m-5 5 5-5 5 5M5 12v9h14v-9',
} as const;
export type IconName = keyof typeof paths;
export function Icon({ name, size = 22, color = colors.brand, filled = false }: { name: IconName; size?: number; color?: string; filled?: boolean }) {
  return <Svg width={size} height={size} viewBox="0 0 24 24" fill={filled ? color : 'none'} stroke={color} strokeWidth={1.65} strokeLinecap="round" strokeLinejoin="round">
    {['compass', 'sun', 'clock', 'info', 'globe'].includes(name) && <Circle cx="12" cy="12" r={name === 'sun' ? 4 : 10} />}
    {name === 'settings' && <Circle cx="12" cy="12" r="5" />}
    {name === 'search' && <Circle cx="10.5" cy="10.5" r="7.5" />}
    {name === 'camera' && <Circle cx="12" cy="13" r="3.5" />}
    {name === 'pin' && <Circle cx="12" cy="10" r="2.5" />}
    {name === 'user' && <Circle cx="12" cy="7" r="4" />}
    {name === 'people' && <Circle cx="9" cy="7" r="4" />}
    {name === 'image' && <Rect x="6" y="6" width="2" height="2" rx="1" />}
    <Path d={paths[name]} />
  </Svg>;
}
