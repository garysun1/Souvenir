import { randomUUID } from 'expo-crypto';
import { useState } from 'react';
import { View } from 'react-native';
import type { Category, PlaceDto } from '../../../../../shared/api-contract';
import type { PlaceCreate, Visibility } from '../../../../../shared/worldwide-contract';
import { Button, Chip, ChipRow, Field, T } from '@/components/ui';
import { useApp } from '@/state/AppProvider';
import { useAccountMutation } from '@/lib/useAccountMutation';
import { duplicatePlace } from '@/lib/worldwide';
import { validTimezone } from '@/domain/capture';

export function CreatePlace({ onChoose }: { onChoose: (id: string) => void }) {
  const { mergePlaces } = useApp();
  const mutation = useAccountMutation();
  const [name, setName] = useState('');
  const [lat, setLat] = useState('');
  const [lng, setLng] = useState('');
  const [city, setCity] = useState('');
  const [country, setCountry] = useState('');
  const [timezone, setTimezone] = useState('');
  const [category, setCategory] = useState<Category>('landmark');
  const [visibility, setVisibility] = useState<Visibility>('private');
  const [existing, setExisting] = useState<PlaceDto>();
  const [created, setCreated] = useState<PlaceDto>();
  const valid = name.trim() && lat.trim() && lng.trim() && Number.isFinite(Number(lat)) && Math.abs(Number(lat)) <= 90
    && Number.isFinite(Number(lng)) && Math.abs(Number(lng)) <= 180 && (!country || /^[A-Za-z]{2}$/.test(country)) && (!timezone.trim() || validTimezone(timezone.trim()));
  const submit = async () => {
    try {
      const result = await mutation.run<PlaceDto>('/api/places', 'POST', {
        requestId: randomUUID(), name: name.trim(), category, lat: Number(lat), lng: Number(lng),
        city: city.trim() || null, country: country.trim().toUpperCase() || null, timezone: timezone.trim() || null, visibility,
      } satisfies PlaceCreate);
      mergePlaces([result]); setCreated(result);
    } catch (reason) {
      const duplicate = duplicatePlace(reason);
      if (duplicate) { mergePlaces([duplicate]); setExisting(duplicate); }
    }
  };
  const choice = created ?? existing;
  return <View style={{ gap: 12 }}>
    <T variant="heading">Add a place</T>
    <T muted>Confirm the exact coordinates. City, country and timezone are optional; blank values stay unknown. Visibility defaults to private.</T>
    <Field label="Place name" value={name} editable={!mutation.locked} onChangeText={setName} maxLength={200} />
    <Field label="Latitude (−90 to 90)" value={lat} editable={!mutation.locked} onChangeText={setLat} keyboardType="numbers-and-punctuation" />
    <Field label="Longitude (−180 to 180)" value={lng} editable={!mutation.locked} onChangeText={setLng} keyboardType="numbers-and-punctuation" />
    <Field label="City (optional)" value={city} editable={!mutation.locked} onChangeText={setCity} maxLength={200} />
    <Field label="Country code (optional, e.g. JP)" value={country} editable={!mutation.locked} onChangeText={setCountry} maxLength={2} />
    <Field label="Timezone (optional, e.g. Asia/Tokyo)" value={timezone} editable={!mutation.locked} onChangeText={setTimezone} autoCapitalize="none" />
    <ChipRow>{(['nature', 'culture', 'food', 'landmark', 'hidden_gem'] as const).map(value => <Chip key={value} label={value} selected={category === value} onPress={mutation.locked ? undefined : () => setCategory(value)} />)}</ChipRow>
    <ChipRow>{(['private', 'friends', 'public'] as const).map(value => <Chip key={value} label={value} selected={visibility === value} onPress={mutation.locked ? undefined : () => setVisibility(value)} />)}</ChipRow>
    {mutation.error && <T accessibilityRole="alert">{mutation.error}</T>}
    {mutation.locked && <T muted>Retry keeps the same submitted details. Keep this form open until the result is confirmed.</T>}
    {!choice && <Button label={mutation.locked ? 'Retry adding place' : 'Create place'} disabled={!valid} loading={mutation.busy} onPress={submit} />}
    {choice && <><T>{created ? 'Created' : 'An accessible place already exists'}: {choice.name} · {choice.lat}, {choice.lng}</T><Button label={`Choose ${choice.name}`} onPress={() => onChoose(choice.id)} /></>}
  </View>;
}
