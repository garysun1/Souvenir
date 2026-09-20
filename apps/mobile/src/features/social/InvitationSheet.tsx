import { useState } from 'react';
import { Platform, Share, View } from 'react-native';
import { Button, DemoLabel, Field, Sheet, T } from '@/components/ui';
import type { Wishlist } from '@/domain/types';
import { colors } from '@/design/tokens';
import { invitationToken, resolveInvitation } from '@/domain/social';
import { useApp } from '@/state/AppProvider';
import { openWishlist, styles } from './components';

export function InvitationSheet({ list, visible, onClose }: { list: Wishlist; visible: boolean; onClose: () => void }) {
  const { state } = useApp();
  const token = invitationToken(list.id);
  const [enteredToken, setEnteredToken] = useState(token);
  const [notice, setNotice] = useState('');
  const [failed, setFailed] = useState(false);

  async function copyToken() {
    setFailed(false);
    try {
      if (Platform.OS === 'web' && typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(token);
        setNotice('Demo token copied. Nothing has been sent to a friend.');
      } else {
        setNotice('Select and copy the token below, or use your device’s share sheet. No invitation has been sent.');
      }
    } catch {
      setFailed(true);
      setNotice('Clipboard access was unavailable. Select the token below to copy it instead.');
    }
  }

  async function shareToken() {
    setFailed(false);
    try {
      const result = await Share.share({ title: `Preview: ${list.title}`, message: `Souvenir invitation preview: ${list.title}\n${token}\nLocal demo only. This token opens the sample list only inside this installation. It does not connect accounts or send an in-app invitation.` });
      setNotice(result.action === Share.dismissedAction ? 'Share canceled. No in-app invitation was sent.' : 'Share sheet closed. Souvenir does not track message delivery or invite a member.');
    } catch {
      setFailed(true);
      setNotice('The share sheet is unavailable here. Copy or select the demo token instead.');
    }
  }

  return <Sheet title="An invitation preview" visible={visible} onClose={onClose}>
    <DemoLabel label="Local demo · Not a real invitation" />
    <T>This is a fictional shared list, not a messaging service. The token only resolves a list that already exists in this installation. It cannot connect two devices.</T>
    <View style={styles.callout}><T variant="label">Demo invitation token</T><T selectable>{token}</T></View>
    {Platform.OS === 'web' && <Button label="Copy demo token" icon="share" variant="outline" onPress={copyToken} />}
    {Platform.OS !== 'web' && <Button label="Open device share sheet" variant="outline" onPress={shareToken} />}
    {!!notice && <T accessibilityLiveRegion="polite" color={failed ? colors.error : undefined}>{notice}</T>}
    <Field label="Try a local demo token" value={enteredToken} onChangeText={setEnteredToken} autoCapitalize="none" autoCorrect={false} />
    <Button label="Open local list preview" onPress={() => {
      const resolved = resolveInvitation(state, enteredToken);
      if (!resolved) { setFailed(true); setNotice('That token does not match a list on this device. Try the sample token above.'); return; }
      setFailed(false); setNotice(''); onClose();
      if (resolved.id !== list.id) openWishlist(resolved.id);
    }} />
    <T variant="small" muted>{list.memberIds.includes('maya') ? 'Maya is already a member of Saturday with Maya. No new membership or visit is created by previewing this invitation.' : 'Previewing a token does not add a member or create a visit.'}</T>
    <Button label="Done" variant="ghost" onPress={onClose} />
  </Sheet>;
}
