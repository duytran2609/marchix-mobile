import { useState } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import { createThemedStyles } from '../theme/theme';

export const avatarBorderStyle = { borderWidth: 1, borderColor: '#000000' };

export function MemberAvatar({ name, photoURL, compact = false, large = false }: {
  name: string; photoURL?: string | null; compact?: boolean; large?: boolean;
}) {
  const styles = useStyles();
  const [failedPhoto, setFailedPhoto] = useState<string>();
  const parts = name.trim().split(/\s+/);
  const initials = parts.length > 1 ? parts[0][0] + parts[parts.length - 1][0] : parts[0].slice(0, 2);
  return (
    <View style={[styles.avatar, compact && styles.compactAvatar, large && styles.largeAvatar]}
      testID="member-avatar" accessible={false} aria-hidden>
      {photoURL && photoURL !== failedPhoto ? <Image source={{ uri: photoURL }} style={styles.image}
        onError={() => setFailedPhoto(photoURL)} /> :
        <Text style={[styles.initials, compact && styles.compactInitials, large && styles.largeInitials]}>
          {initials.toLocaleUpperCase('vi')}
        </Text>}
    </View>
  );
}

const useStyles = createThemedStyles(colors => StyleSheet.create({
  avatar: { width: 34, height: 34, borderRadius: 17, overflow: 'hidden', alignItems: 'center',
    justifyContent: 'center', flexShrink: 0, backgroundColor: colors.accentSoft, ...avatarBorderStyle },
  compactAvatar: { width: 22, height: 22, borderRadius: 11 },
  largeAvatar: { width: 88, height: 88, borderRadius: 44 },
  initials: { color: colors.accent, fontSize: 12, fontWeight: '800' },
  compactInitials: { fontSize: 10 },
  largeInitials: { fontSize: 30 },
  image: { width: '100%', height: '100%' },
}));
