import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Button } from '../../components/Button';
import { useScreenStyles } from '../../theme/screenStyles';
import { watchProjects } from '../projects/projects';
import type { Project } from '../projects/projects';
import { SettingsSwitch } from './SettingsSwitch';

const title = 'Xem trao đổi và tệp dự án';

export function ProjectAccessSettings({ accountEmail, inheritsPermissions, disabled, changes, onChange }: {
  accountEmail: string;
  inheritsPermissions: boolean;
  disabled: boolean;
  changes: ReadonlyMap<string, boolean>;
  onChange: (projects: { id: string; persisted: boolean }[], checked: boolean) => void;
}) {
  const styles = useScreenStyles();
  const [projects, setProjects] = useState<Project[]>();
  const [error, setError] = useState(false);
  const [retry, setRetry] = useState(0);

  useEffect(() => watchProjects(setProjects, () => setError(true)), [retry]);

  const rows = (projects ?? []).map(project => {
    const inherited = inheritsPermissions || (accountEmail !== '' && project.ownerEmail === accountEmail);
    const persisted = project.collaborators?.includes(accountEmail) ?? false;
    return { id: project.id, name: project.name, inherited, persisted,
      checked: inherited || (changes.get(project.id) ?? persisted) };
  });
  const editable = rows.filter(project => !project.inherited);
  const allChecked = inheritsPermissions || (rows.length > 0 && rows.every(project => project.checked));

  return <View role="region" accessibilityLabel={title}>
    <View style={styles.listHeader}>
      <Text accessibilityRole="header" style={[styles.label, styles.listHeading]}>{title}</Text>
      <SettingsSwitch label={title} checked={allChecked} disabled={disabled || error || !editable.length}
        onChange={checked => onChange(editable, checked)} />
    </View>
    {error ? <>
      <Text accessibilityRole="alert" style={styles.error}>Không tải được danh sách dự án.</Text>
      <Button label="Tải lại danh sách dự án" secondary disabled={disabled} onPress={() => {
        setError(false);
        setProjects(undefined);
        setRetry(current => current + 1);
      }} />
    </> : !projects ? <Text style={styles.muted}>Đang tải danh sách dự án…</Text>
      : !projects.length ? <Text style={styles.muted}>Chưa có dự án.</Text>
      : rows.length > 1 ? rows.map(project => <View key={project.id} style={[styles.listHeader, layout.projectRow]}>
        <Text style={[styles.label, styles.listHeading, layout.projectLabel]}>{project.name}</Text>
        <SettingsSwitch label={project.name} checked={project.checked}
          disabled={disabled || project.inherited} onChange={checked => onChange([project], checked)} />
      </View>) : null}
  </View>;
}

const layout = StyleSheet.create({
  projectRow: { paddingLeft: 16, marginBottom: 0 },
  projectLabel: { fontWeight: '400' },
});
