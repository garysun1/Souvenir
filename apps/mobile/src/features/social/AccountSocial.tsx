import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { View } from 'react-native';
import type { FeedDto, FriendsDto, LeaderboardDto, ProfileStatsDto, SetCompletionDto, SocialProfileDto, UserDetailDto, UserStatsDto } from '../../../../../shared/worldwide-contract';
import { Button, Chip, ChipRow, Field, Header, Screen, SectionHeading, T } from '@/components/ui';
import { placeById, sets } from '@/fixtures/catalog';
import { useApp } from '@/state/AppProvider';
import { useAccountResource } from '@/lib/useAccountResource';
import { useAccountMutation } from '@/lib/useAccountMutation';
import { queryString } from '@/lib/worldwide';
import { ResourceStatus } from '@/features/discovery/AccountPlaceDetail';

export function SocialPerson({ user }: { user: SocialProfileDto }) {
  return <Button label={`${user.displayName} · @${user.handle.replace(/^@/, '')}`} variant="ghost" onPress={() => router.push({ pathname: '/friend/[userId]', params: { userId: user.id } })} />;
}
export function FriendshipActions({ userId, relationship, onSaved }: { userId: string; relationship: UserDetailDto['relationship']; onSaved: () => void }) {
  const mutation = useAccountMutation();
  const [remove, setRemove] = useState(false);
  if (relationship === 'self') return null;
  const write = async (deleting: boolean) => { setRemove(deleting); await mutation.run(`/api/friends/${encodeURIComponent(userId)}`, deleting ? 'DELETE' : 'PUT', deleting ? undefined : {}); onSaved(); };
  return <View style={{ gap: 6 }}>
    {mutation.error && <T accessibilityRole="alert">{mutation.error}</T>}
    {mutation.locked ? <Button label="Retry relationship change" loading={mutation.busy} onPress={() => write(remove)} />
      : <>
        {['none', 'incoming'].includes(relationship) && <Button label={relationship === 'incoming' ? 'Accept request' : 'Send friend request'} onPress={() => write(false)} />}
        {relationship !== 'none' && <Button label={relationship === 'accepted' ? 'Remove friend' : relationship === 'incoming' ? 'Decline request' : 'Cancel request'} variant="outline" onPress={() => write(true)} />}
      </>}
  </View>;
}
export function StatsView({ stats }: { stats: UserStatsDto | null }) {
  if (!stats) return <T muted>Statistics are private or unavailable.</T>;
  return <View style={{ gap: 8 }}>
    <T>{stats.placesVisited} places · {stats.editions} editions · {stats.citiesVisited} cities</T>
    <T>Weekly streak: {stats.currentStreakWeeks} current · {stats.longestStreakWeeks} longest</T>
    <T>Global rank: {stats.globalRank === null ? 'unavailable' : `#${stats.globalRank}`}</T>
    {stats.cityRanks.map(city => <T key={`${city.country}:${city.city}`}>{city.city}, {city.country}: #{city.rank} · {city.placesVisited} places</T>)}
    <T variant="small" muted>Souvenir activity · {stats.sampleStatus} · computed {stats.computedAt}</T>
  </View>;
}
export function SetCompletions({ completion }: { completion: SetCompletionDto[] }) {
  return <View style={{ gap: 8 }}>{completion.map(item => {
    const set = sets.find(set => set.id === item.setId);
    const label = `${set?.title ?? 'Catalog set'} · ${item.visited}/${item.total} visited${item.rate === null ? '' : ` · ${Math.round(item.rate * 100)}%`}`;
    return set ? <Button key={item.setId} label={label} variant="outline" onPress={() => router.push({ pathname: '/sets/[setId]', params: { setId: item.setId } })} /> : <T key={item.setId}>{label}</T>;
  })}{!completion.length && <T muted>No set completion data visible.</T>}</View>;
}
export function AccountProfileStats() {
  const { userId } = useApp();
  const profile = useAccountResource<ProfileStatsDto>('/api/me/stats');
  const detail = useAccountResource<UserDetailDto>(userId ? `/api/users/${encodeURIComponent(userId)}` : undefined);
  return <><SectionHeading title="Your activity" /><ResourceStatus {...profile} />{profile.data && <StatsView stats={profile.data.stats} />}
    <SectionHeading title="Set completion" /><ResourceStatus {...detail} />{detail.data && <SetCompletions completion={detail.data.setCompletion} />}
    <SectionHeading title="Leaderboard" /><AccountLeaderboard /></>;
}
function AccountLeaderboard() {
  const [scope, setScope] = useState<'friends' | 'city' | 'global'>('friends');
  const [city, setCity] = useState('');
  const [country, setCountry] = useState('');
  const [offset, setOffset] = useState(0);
  const [filter, setFilter] = useState<{ city: string; country: string }>();
  const path = scope === 'city' && !filter ? undefined : `/api/leaderboard?${queryString({ scope, ...(scope === 'city' ? filter : {}), offset, limit: 25 })}`;
  const resource = useAccountResource<LeaderboardDto>(path);
  return <View style={{ gap: 10 }}>
    <ChipRow>{(['friends', 'city', 'global'] as const).map(value => <Chip key={value} label={value} selected={scope === value} onPress={() => { setScope(value); setOffset(0); }} />)}</ChipRow>
    {scope === 'city' && <><Field label="Leaderboard city" value={city} onChangeText={setCity} maxLength={200} /><Field label="Leaderboard country code" value={country} onChangeText={setCountry} maxLength={2} /><Button label="Apply city" disabled={!city.trim() || !/^[a-z]{2}$/i.test(country)} onPress={() => { setFilter({ city: city.trim(), country: country.toUpperCase() }); setOffset(0); }} /></>}
    <ResourceStatus {...resource} />
    {resource.data && <>
      <T variant="small" muted>{resource.data.city ? `${resource.data.city}, ${resource.data.country} · ` : ''}Ranked by places visited · computed {resource.data.computedAt ?? 'unavailable'}</T>
      {resource.data.entries.map(entry => <View key={entry.user.id}><T>#{entry.rank} · {entry.placesVisited} places</T><SocialPerson user={entry.user} /></View>)}
      {!resource.data.entries.length && <T muted>No visible rankings for this scope.</T>}
      {offset > 0 && <Button label="Previous rankings" variant="outline" onPress={() => setOffset(value => Math.max(0, value - 25))} />}
      {resource.data.entries.length === 25 && <Button label="More rankings" variant="outline" onPress={() => setOffset(value => value + 25)} />}
    </>}
  </View>;
}
export function AccountFriendProfile({ userId }: { userId: string }) {
  const resource = useAccountResource<UserDetailDto>(`/api/users/${encodeURIComponent(userId)}`);
  const detail = resource.data;
  return <Screen><Header title={detail?.user.displayName ?? 'Profile'} back /><ResourceStatus {...resource} />
    {detail && <>
      <T>@{detail.user.handle.replace(/^@/, '')} · {detail.relationship}</T>
      <FriendshipActions userId={userId} relationship={detail.relationship} onSaved={resource.reload} />
      <SectionHeading title="Activity statistics" /><StatsView stats={detail.stats} />
      <T>Taste overlap (shared visits): {detail.tasteOverlap === null ? 'unavailable or not visible' : `${Math.round(detail.tasteOverlap * 100)}%`}</T>
      <SectionHeading title="Set completion" /><SetCompletions completion={detail.setCompletion} />
      <SectionHeading title="Visible visits" />
      {!detail.editions.length && <T muted>{detail.relationship === 'accepted' || detail.relationship === 'self' ? 'No visits shared with you.' : 'Visits are available to accepted friends when shared.'}</T>}
      {detail.editions.map(edition => {
        const place = placeById(edition.placeId);
        return <View key={edition.id} style={{ paddingVertical: 8 }}><T>{place?.name ?? 'Destination not in current catalog'} · {new Date(edition.capturedAt).toISOString().slice(0, 10)} · {edition.variant}</T>{place && <Button label={`View ${place.name}`} variant="ghost" onPress={() => router.push({ pathname: '/place/[placeId]', params: { placeId: place.id } })} />}</View>;
      })}
      <T variant="small" muted>Only server-authorized visits are shown. Personal Capture photographs and private tips are not included.</T>
    </>}
  </Screen>;
}
export function AccountFriendDirectory() {
  const friends = useAccountResource<FriendsDto>('/api/friends');
  const [query, setQuery] = useState('');
  const [search, setSearch] = useState('');
  const results = useAccountResource<SocialProfileDto[]>(search.length >= 2 ? `/api/friends/search?${queryString({ q: search, limit: 25 })}` : undefined);
  return <>
    <SectionHeading title="Find people" /><Field label="Name or handle prefix" value={query} onChangeText={setQuery} maxLength={80} />
    <Button label="Search people" disabled={query.trim().length < 2} onPress={() => { setSearch(query.trim()); results.reload(); }} />
    <ResourceStatus {...results} />
    {results.data?.map(user => <View key={user.id}><SocialPerson user={user} />{friends.data && <FriendshipActions userId={user.id} relationship={friends.data.friends.find(friend => friend.user.id === user.id)?.status ?? 'none'} onSaved={() => { friends.reload(); results.reload(); }} />}</View>)}
    {results.data && !results.data.length && <T muted>No accounts found.</T>}
    <SectionHeading title="Friends and requests" /><ResourceStatus {...friends} />
    {friends.data?.friends.map(friend => <View key={friend.user.id} style={{ gap: 6, paddingVertical: 12 }}>
      <SocialPerson user={friend.user} /><T>{friend.status}{friend.tasteOverlap === null ? '' : ` · ${Math.round(friend.tasteOverlap * 100)}% taste overlap`}</T>
      <FriendshipActions userId={friend.user.id} relationship={friend.status} onSaved={friends.reload} />
    </View>)}
    {friends.data && !friends.data.friends.length && <T muted>No friends or pending requests yet. Search for a real account above.</T>}
  </>;
}
export function AccountFeed() {
  const { mergePlaces } = useApp();
  const [cursor, setCursor] = useState<string>();
  const resource = useAccountResource<FeedDto>(`/api/feed?${queryString({ limit: 25, cursor })}`);
  const data = resource.data;
  useEffect(() => { if (data) mergePlaces(data.events.flatMap(event => 'place' in event ? [event.place] : [])); }, [data, mergePlaces]);
  return <><SectionHeading title="Friend activity feed" /><ResourceStatus {...resource} />
    {data?.events.map(event => <View key={event.id} style={{ gap: 6, paddingVertical: 12 }}>
      <SocialPerson user={event.user} /><T variant="small" muted>{event.createdAt}</T>
      {event.kind === 'edition' ? <T>Visited {event.place.name}</T>
        : event.kind === 'ranking' ? <T>{event.sentiment} · {event.place.name}</T>
        : event.kind === 'note' ? <><T>{event.note.kind} · {event.place.name} · {event.note.visibility}</T><T>{event.note.body}</T></>
        : event.kind === 'friend' ? <><T>Became friends with</T><SocialPerson user={event.friend} /></>
        : <SetCompletions completion={[event.completion]} />}
      {'place' in event && <Button label={`Open ${event.place.name}`} variant="ghost" onPress={() => { mergePlaces([event.place]); router.push({ pathname: '/place/[placeId]', params: { placeId: event.place.id } }); }} />}
    </View>)}
    {data && !data.events.length && <T muted>No activity shared with you yet.</T>}
    {data?.nextCursor && <Button label="Older activity" variant="outline" onPress={() => setCursor(data.nextCursor ?? undefined)} />}
    {cursor && <Button label="Latest activity" variant="ghost" onPress={() => setCursor(undefined)} />}
  </>;
}
