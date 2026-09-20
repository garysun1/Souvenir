import type { Place } from '@/domain/types';
import SchematicPlaceMap from './SchematicPlaceMap';

/** Fixed cross-flow map contract. Platform resolution selects PlaceMap.native on devices. */
export interface PlaceMapProps { places: Place[]; onSelect: (placeId: string) => void; selectedId?: string; height?: number; showPreview?: boolean }
export default SchematicPlaceMap;
