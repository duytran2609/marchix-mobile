import { useState } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import { colors } from '../theme/theme';

export function MemberAvatar({ name, photoURL }: { name: string; photoURL?: string | null }) {
  const [failedPhoto, setFailedPhoto] = useState<string>();
  const parts = name.trim().split(/\s+/);
  const initials = parts.length > 1 ? parts[0][0] + parts[parts.length - 1][0] : parts[0].slice(0, 2);
  return (
    <View style={styles.avatar} accessible={false} aria-hidden>
      <Text style={styles.initials}>{initials.toLocaleUpperCase('vi')}</Text>
      {photoURL && photoURL !== failedPhoto ? <Image source={{ uri: photoURL }} style={styles.image}
        onError={() => setFailedPhoto(photoURL)} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  avatar: { width: 34, height: 34, borderRadius: 17, overflow: 'hidden', alignItems: 'center',
    justifyContent: 'center', backgroundColor: colors.accentSoft },
  initials: { color: colors.accent, fontSize: 12, fontWeight: '800' },
  image: { position: 'absolute', width: '100%', height: '100%' },
});
