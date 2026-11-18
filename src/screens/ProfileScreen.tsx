import { useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { MemberAvatar } from '../components/MemberAvatar';
import { PageHeader } from '../components/PageHeader';
import { useToast } from '../components/Toast';
import { pickMemberAvatar } from '../features/auth/memberAvatar';
import type { MemberSession } from '../features/auth/useSession';
import { useScreenStyles } from '../theme/screenStyles';
import { createThemedStyles, useTheme } from '../theme/theme';

export function ProfileScreen({ name, email, photoURL, isAdmin }: Pick<MemberSession, 'name' | 'email' | 'photoURL' | 'isAdmin'>) {
  const styles = useScreenStyles();
  const editStyles = useEditStyles();
  const { colors } = useTheme();
  const showToast = useToast();
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);

  async function changeAvatar() {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    try {
      if (await pickMemberAvatar(email)) showToast('Đã cập nhật ảnh đại diện.');
    } catch (error) {
      showToast(error instanceof Error && !('code' in error) ? error.message
        : 'Chưa lưu được ảnh đại diện. Vui lòng thử lại.', 'error');
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }

  return (
    <>
      <PageHeader title="Thông tin cá nhân" />
      <View style={[styles.panel, layout.identity]}>
        <View style={layout.avatar}>
          <MemberAvatar name={name} photoURL={photoURL} large />
          <Pressable accessibilityRole="button" accessibilityLabel="Đổi ảnh đại diện"
            accessibilityState={{ disabled: busy, busy }} disabled={busy} onPress={() => void changeAvatar()}
            style={({ pressed }) => [layout.editButton, pressed && styles.dimmed]}>
            <View aria-hidden style={editStyles.badge}>
              {busy ? <ActivityIndicator size="small" color={colors.onAccent} />
                : <Text style={editStyles.pencil}>✎</Text>}
            </View>
          </Pressable>
        </View>
        <Text style={[styles.cardTitle, layout.name]}>{name}</Text>
      </View>
      <View style={styles.panel}>
        <View style={layout.detail}>
          <Text style={[styles.label, layout.label]}>Email Google</Text>
          <Text selectable style={[styles.body, layout.value]}>{email}</Text>
        </View>
        <View style={[styles.detailRow, layout.detail]}>
          <Text style={[styles.label, layout.label]}>Vai trò</Text>
          <Text style={[styles.body, layout.value]}>{isAdmin ? 'Quản trị viên' : 'Nhân viên'}</Text>
        </View>
      </View>
    </>
  );
}

const layout = StyleSheet.create({
  identity: { alignItems: 'center', paddingVertical: 28, gap: 12 },
  avatar: { position: 'relative', padding: 4 },
  editButton: { position: 'absolute', right: 0, bottom: 0, width: 44, height: 44,
    alignItems: 'flex-end', justifyContent: 'flex-end', borderRadius: 22 },
  name: { maxWidth: '100%', textAlign: 'center', fontSize: 22 },
  detail: { flexDirection: 'row', alignItems: 'baseline', gap: 12 },
  label: { maxWidth: '45%' },
  value: { flex: 1, minWidth: 0, textAlign: 'right' },
});

const useEditStyles = createThemedStyles(colors => StyleSheet.create({
  badge: { width: 34, height: 34, borderRadius: 17, borderWidth: 2, borderColor: colors.paper,
    backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' },
  pencil: { color: colors.onAccent, fontSize: 19, lineHeight: 22 },
}));
