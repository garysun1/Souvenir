import { StyleSheet } from 'react-native';
import { colors, fonts } from '@/design/tokens';

export const captureStyles = StyleSheet.create({
  camera: { height: 480, marginHorizontal: -22, backgroundColor: '#102D33', overflow: 'hidden' },
  cameraControls: { position: 'absolute', bottom: 24, left: 0, right: 0, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around' },
  roundControl: { width: 54, height: 54, borderRadius: 27, backgroundColor: '#FFFFFFE8', alignItems: 'center', justifyContent: 'center' },
  shutterOuter: { width: 72, height: 72, borderRadius: 36, borderWidth: 3, borderColor: '#fff', padding: 5 },
  shutterInner: { flex: 1, borderRadius: 29, backgroundColor: '#fff' },
  notice: { borderRadius: 12, backgroundColor: colors.brandSoft, padding: 14, gap: 4 },
  error: { borderRadius: 12, backgroundColor: '#FFF1F1', padding: 14, gap: 6 },
  photo: { height: 280, marginHorizontal: -22, borderRadius: 0 },
  photoRounded: { height: 300, borderRadius: 18 },
  scanLine: { position: 'absolute', left: 16, right: 16, height: 2, backgroundColor: '#FFFFFFCC', shadowColor: '#fff', shadowOpacity: 0.9, shadowRadius: 7 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  choice: { borderWidth: 1, borderColor: colors.border, borderRadius: 12, padding: 14, minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: 10 },
  choiceSelected: { borderColor: colors.brand, backgroundColor: colors.brandSoft },
  avatarChoice: { alignItems: 'center', gap: 5, minWidth: 62, paddingVertical: 6 },
  cardBack: { height: 410, borderRadius: 22, backgroundColor: colors.brand, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  cardFront: { minHeight: 420, borderRadius: 22, backgroundColor: '#fff', borderWidth: 1, borderColor: colors.border, overflow: 'hidden' },
  editionPhoto: { height: 275, borderRadius: 0 },
  stamp: { alignSelf: 'flex-start', borderRadius: 20, backgroundColor: colors.brandSoft, paddingHorizontal: 12, paddingVertical: 6 },
  overlay: { position: 'absolute', inset: 0, backgroundColor: '#FFFFFF66' },
  tinyCaps: { fontFamily: fonts.medium, color: colors.brand, textTransform: 'uppercase', letterSpacing: 1.5, fontSize: 10 },
  actionRow: { gap: 10, marginTop: 12 },
  detailCard: { borderWidth: 1, borderColor: colors.border, borderRadius: 14, padding: 16, gap: 8 },
});
