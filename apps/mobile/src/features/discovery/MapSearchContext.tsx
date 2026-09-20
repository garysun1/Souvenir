import { createContext, useContext } from 'react';
import type { Coordinates, MapBounds } from '@/domain/search';

interface DiscoveryMapOptions { origin: Coordinates; onSearchArea?: (bounds: MapBounds) => void }
const Context = createContext<DiscoveryMapOptions | null>(null);
export const DiscoveryMapProvider = Context.Provider;
export const useDiscoveryMapOptions = () => useContext(Context);
