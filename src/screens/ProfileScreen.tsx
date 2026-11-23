import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { Button } from '../components/Button';
import { FieldLabel } from '../components/FieldLabel';
import { MemberAvatar } from '../components/MemberAvatar';
import { PageHeader } from '../components/PageHeader';
import { TextInput } from '../components/TextInput';
import { useToast } from '../components/Toast';
import { pickMemberAvatar } from '../features/auth/memberAvatar';
import { saveMemberProfile, watchContactEmail } from '../features/auth/memberProfile';
import type { MemberSession } from '../features/auth/useSession';
import { useScreenStyles } from '../theme/screenStyles';
import { createThemedStyles, useTheme } from '../theme/theme';

const millisecondsPerDay = 24 * 60 * 60 * 1000;

export function ProfileScreen({ name, email, photoURL, isAdmin, accountCreatedAt }:
  Pick<MemberSession, 'name' | 'email' | 'photoURL' | 'isAdmin' | 'accountCreatedAt'>) {
  const styles = useScreenStyles();
  const editStyles = useEditStyles();
  const { colors } = useTheme();
  const showToast = useToast();
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);
  const [contactEmail, setContactEmail] = useState<string | null>();
  const [loadFailed, setLoadFailed] = useState(false);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [draft, setDraft] = useState<{
    name: string; contactEmail: string; original: { name: string; contactEmail: string };
  } | null>(null);
  const [saving, setSaving] = useState(false);
  const savingProfile = useRef(false);
  const [profileError, setProfileError] = useState('');
  const address = contactEmail ?? email;
  const createdAt = Date.parse(accountCreatedAt ?? '');
  const activityDays = Number.isFinite(createdAt)
    ? Math.max(0, Math.floor((Date.now() - createdAt) / millisecondsPerDay))
    : null;

  useEffect(() => watchContactEmail(email, setContactEmail, () => setLoadFailed(true)), [email, loadAttempt]);

  async function saveProfile() {
    if (!draft || savingProfile.current) return;
    savingProfile.current = true;
    setSaving(true);
    setProfileError('');
    try {
      await saveMemberProfile(email, draft.original, draft);
      setDraft(null);
      showToast('Đã cập nhật thông tin cá nhân.');
    } catch (error) {
      setProfileError(error instanceof Error && !('code' in error) ? error.message
        : 'Chưa lưu được thông tin cá nhân. Vui lòng thử lại.');
    } finally {
      savingProfile.current = false;
      setSaving(false);
    }
  }

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
        <View style={layout.identityText}>
          <Text style={[styles.cardTitle, layout.name]}>{name}</Text>
          <Text style={[styles.body, styles.metadataValue, layout.role]}>{isAdmin ? 'Quản trị viên' : 'Nhân viên'}</Text>
        </View>
      </View>
      <View style={styles.panel}>
        <View style={layout.detail}>
          <Text style={[styles.label, styles.metadataLabel, layout.label]}>Email liên hệ</Text>
          <Text selectable style={[styles.body, styles.metadataValue, layout.value]}>{address}</Text>
        </View>
        {address !== email && <View style={[styles.detailRow, layout.detail]}>
          <Text style={[styles.label, styles.metadataLabel, layout.label]}>Email đăng nhập</Text>
          <Text selectable style={[styles.body, styles.metadataValue, layout.value]}>{email}</Text>
        </View>}
        <View style={[styles.detailRow, layout.detail]}>
          <Text style={[styles.label, styles.metadataLabel, layout.label]}>Thời gian hoạt động</Text>
          <Text style={[styles.body, styles.metadataValue, layout.value]}>
            {activityDays === null ? 'Chưa có dữ liệu' : `${activityDays.toLocaleString('vi-VN')} ngày`}
          </Text>
        </View>
        {draft ? <View style={styles.stack}>
          <FieldLabel required style={styles.label}>Tên hiển thị</FieldLabel>
          <TextInput accessibilityLabel="Tên hiển thị" value={draft.name} editable={!saving}
            maxLength={250} autoComplete="name" style={styles.input}
            onChangeText={value => setDraft(current => current && { ...current, name: value })} />
          <FieldLabel required style={styles.label}>Email liên hệ</FieldLabel>
          <TextInput accessibilityLabel="Email liên hệ" value={draft.contactEmail} editable={!saving}
            inputMode="email" autoCapitalize="none" autoCorrect={false} autoComplete="email" maxLength={254}
            style={styles.input} onChangeText={value => setDraft(current => current && { ...current, contactEmail: value })} />
          {profileError ? <Text accessibilityRole="alert" style={styles.error}>{profileError}</Text> : null}
          <Button label="Lưu thông tin" disabled={saving || (draft.name.trim() === draft.original.name &&
            draft.contactEmail.trim() === draft.original.contactEmail)}
            onPress={() => void saveProfile()} />
          <Button label="Hủy" secondary disabled={saving} onPress={() => setDraft(null)} />
        </View> : loadFailed ? <>
          <Text accessibilityRole="alert" style={styles.error}>Chưa tải được email liên hệ.</Text>
          <Button label="Tải lại thông tin" secondary onPress={() => {
            setLoadFailed(false);
            setLoadAttempt(attempt => attempt + 1);
          }} />
        </> : <Button label="Chỉnh sửa thông tin cá nhân" secondary disabled={contactEmail === undefined}
          onPress={() => {
            setProfileError('');
            const original = { name, contactEmail: address };
            setDraft({ ...original, original });
          }} />}
      </View>
    </>
  );
}

const layout = StyleSheet.create({
  identity: { alignItems: 'center', paddingVertical: 28, gap: 12 },
  avatar: { position: 'relative', padding: 4 },
  editButton: { position: 'absolute', right: 0, bottom: 0, width: 44, height: 44,
    alignItems: 'flex-end', justifyContent: 'flex-end', borderRadius: 22 },
  identityText: { alignItems: 'center', gap: 4, maxWidth: '100%' },
  name: { maxWidth: '100%', textAlign: 'center', fontSize: 22 },
  role: { textAlign: 'center' },
  detail: { flexDirection: 'row', alignItems: 'baseline', gap: 12 },
  label: { maxWidth: '45%' },
  value: { flex: 1, minWidth: 0, textAlign: 'right' },
});

const useEditStyles = createThemedStyles(colors => StyleSheet.create({
  badge: { width: 34, height: 34, borderRadius: 17, borderWidth: 2, borderColor: colors.paper,
    backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' },
  pencil: { color: colors.onAccent, fontSize: 19, lineHeight: 22 },
}));
