import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import imageCredits from '../../../assets/places/credits.json';
import { EmptyState, Field, Header, Screen, SectionHeading, T } from '@/components/ui';
import { colors } from '@/design/tokens';
import { SourceLink } from '@/features/sources/components';
import { fontCredits } from '@/fixtures/sources';

export default function CreditsScreen() {
  const [query, setQuery] = useState('');
  const matches = imageCredits.filter(credit => `${credit.title} ${credit.author} ${credit.license}`.toLowerCase().includes(query.trim().toLowerCase()));
  return <Screen>
    <Header title="Credits" back subtitle="Places, through someone else’s lens." />
    <T muted>Bundled images retain their individual licenses and attributions. The entries below come directly from the image-credit manifest, including any display modifications.</T>
    <SectionHeading title="Photography" />
    <Field label="Find an image credit" placeholder="Place, author or license" value={query} onChangeText={setQuery} autoCorrect={false} />
    <T variant="small" muted style={{ marginTop: 12 }}>{matches.length} of {imageCredits.length} bundled image credits</T>
    {matches.map(credit => <View key={`${credit.id}:${credit.file}`} style={styles.credit}>
      <T variant="place">{credit.title}</T>
      <T>By {credit.author.trim() || 'Author not recorded in the manifest — see the original source'}</T>
      <T variant="label" color={colors.brand}>{credit.license || 'License not recorded — see the original source'}</T>
      <T variant="small" muted>{credit.modifications}</T>
      <T variant="small" muted selectable>Bundled file: {credit.file}</T>
      <SourceLink label="View original source & attribution" url={credit.source} />
      {credit.licenseUrl !== '' && <SourceLink label="Read image license" url={credit.licenseUrl} />}
    </View>)}
    {!matches.length && <EmptyState title={imageCredits.length ? 'No matching credits' : 'No bundled image credits'} message={imageCredits.length ? 'Try a destination, photographer or license name.' : 'The local manifest has no entries. User-selected photos are not included in this catalog.'} action={query ? 'Clear search' : undefined} onPress={() => setQuery('')} icon="image" />}
    <SectionHeading title="Typography" />
    {fontCredits.map(font => <View key={font.name} style={styles.credit}>
      <T variant="place">{font.name}</T><T>{font.author}</T><T variant="label" color={colors.brand}>{font.license}</T><T variant="small" muted>{font.usage}</T>
      <SourceLink label="Visit font project" url={font.source} /><SourceLink label="Read font license" url={font.licenseUrl} />
    </View>)}
    <T variant="small" muted style={{ marginTop: 18 }}>Photos you choose or take remain your own local media. They are not supplied by the providers in the data-source directory. Provider documentation does not confer rights to someone else’s photography.</T>
  </Screen>;
}

const styles = StyleSheet.create({
  credit: { paddingVertical: 22, gap: 10, borderBottomWidth: 1, borderBottomColor: colors.divider },
});
