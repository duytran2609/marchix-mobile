import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { PageHeader } from '../components/PageHeader';
import { Button } from '../components/Button';
import { Dropdown } from '../components/Dropdown';
import { ProjectEditor } from '../features/projects/ProjectEditor';
import { ProjectFinance } from '../features/projects/ProjectFinance';
import { projectMetrics, watchPilotProjectTasks, watchProjects } from '../features/projects/projects';
import type { Project } from '../features/projects/projects';
import { initialTaskBoardOptions, TaskBoard } from '../features/tasks/TaskBoard';
import { formatTaskDate } from '../features/tasks/taskDates';
import type { Task } from '../features/tasks/tasks';
import type { ProjectRoute } from '../navigation/workspaceRoutes';
import { pilotMode } from '../services/firebase/firebase';
import { useScreenStyles } from '../theme/screenStyles';
import { useTheme } from '../theme/theme';

const sections = [
  ['overview', 'Tổng quan'], ['work', 'Công việc đính kèm'], ['finance', 'Tài chính'],
] as const;

export function ProjectsScreen({ route, onNavigate, onOpenTask, onDragChange, email, name, isAdmin, canReadCash,
  tasks, tasksError, onRetryTasks }: {
  route: ProjectRoute; onNavigate: (route: ProjectRoute) => void; onOpenTask: (task: Task) => void;
  onDragChange: (dragging: boolean) => void; email: string; name: string; isAdmin: boolean;
  canReadCash: boolean; tasks: Task[] | null; tasksError: boolean; onRetryTasks: () => void;
}) {
  const styles = useScreenStyles();
  const { colors } = useTheme();
  const [projects, setProjects] = useState<Project[] | null>(null);
  const [projectError, setProjectError] = useState(false);
  const [projectRetry, setProjectRetry] = useState(0);
  const [pilotTasks, setPilotTasks] = useState<Task[] | null>(null);
  const [pilotError, setPilotError] = useState(false);
  const [pilotRetry, setPilotRetry] = useState(0);
  const [board, setBoard] = useState({ ...initialTaskBoardOptions, view: 'kanban' as const });
  const [editor, setEditor] = useState<Project | 'new' | null>(null);
  useEffect(() => watchProjects(setProjects, () => { setProjects(null); setProjectError(true); }), [projectRetry]);
  useEffect(() => {
    if (pilotMode) return watchPilotProjectTasks(email, isAdmin, setPilotTasks, () => {
      setPilotTasks(null);
      setPilotError(true);
    });
  }, [email, isAdmin, pilotRetry]);

  const project = projects?.find(item => item.id === route.projectId) ?? projects?.[0];
  const section = route.section ?? 'overview';
  const visibleTasks = pilotMode ? pilotTasks : tasks;
  const taskError = pilotMode ? pilotError : tasksError;
  const projectTasks = project && visibleTasks?.filter(task => task.projectId === project.id);
  const metrics = projectMetrics(projectTasks ?? []);

  function navigate(update: Omit<ProjectRoute, 'screen'>) {
    onNavigate({ screen: 'du-an', ...update });
  }

  const resolvedRoute = { ...route, projectId: project?.id };
  return <>
    <PageHeader title="DỰ ÁN">
      {isAdmin && <Button label="+ Thêm dự án" onPress={() => setEditor('new')} />}
    </PageHeader>
    <View role="region" accessibilityLabel="Danh sách dự án" style={styles.panel}>
      <Text accessibilityRole="header" style={styles.cardTitle}>Danh sách dự án</Text>
      {projectError ? <>
        <Text accessibilityRole="alert" style={styles.error}>Không tải được danh sách dự án.</Text>
        <Button label="Thử lại" secondary onPress={() => { setProjectError(false); setProjectRetry(value => value + 1); }} />
      </> : projects === null ? <ActivityIndicator accessibilityLabel="Đang tải dự án" color={colors.accent} />
        : !projects.length ? <Text style={styles.muted}>Chưa có dự án.</Text>
        : <Dropdown label="Chọn dự án" hideLabel value={project?.id ?? ''}
          choices={projects.map(item => ({ value: item.id, label: item.name }))}
          onChange={projectId => {
            if (projectId === project?.id) return;
            setBoard({ ...initialTaskBoardOptions, view: 'kanban' });
            navigate({ projectId });
          }} />}
    </View>
    {project && <>
      <View role="region" accessibilityLabel="Thông tin dự án" style={styles.panel}>
        <View style={local.projectTitleRow}>
          <Text accessibilityRole="header" style={[styles.heading, local.projectTitle]}>{project.name}</Text>
          {isAdmin && <Button label="Chỉnh sửa" secondary style={local.editButton}
            onPress={() => setEditor(project)} />}
        </View>
        <Text style={styles.badge}>{project.status || 'Chưa cập nhật trạng thái'}</Text>
        <View style={local.metadata}>
          <Text selectable style={styles.muted}><Text style={[local.metaLabel, styles.metadataLabel]}>Mã dự án: </Text>DA-{project.id}</Text>
          <Text selectable style={styles.muted}>
            <Text style={[local.metaLabel, styles.metadataLabel]}>Thời gian: </Text>
            {project.startDate ? formatTaskDate(project.startDate) : 'Chưa có ngày bắt đầu'} → {
              project.deadline ? formatTaskDate(project.deadline) : 'Chưa có ngày kết thúc'}
          </Text>
          <Text selectable style={styles.muted}>
            <Text style={[local.metaLabel, styles.metadataLabel]}>Người phụ trách: </Text>{project.owner || project.ownerEmail || 'Chưa có'}
          </Text>
        </View>
        <View accessibilityRole="tablist" accessibilityLabel="Mục trong hồ sơ dự án"
          style={[local.tabs, { backgroundColor: colors.surfaceMuted }]}>
          {sections.map(([id, label]) => <Pressable key={id} accessibilityRole="tab"
            accessibilityState={{ selected: section === id }}
            onPress={() => navigate({ projectId: project.id, section: id })}
            style={[local.tab, id === 'work' && local.workTab, section === id && { backgroundColor: colors.paper }]}>
            <Text style={[local.tabLabel, { color: colors.muted }, section === id && { color: colors.accent, fontWeight: '800' }]}>
              {label}
            </Text>
          </Pressable>)}
        </View>
      </View>
      <View role="region" accessibilityLabel={sections.find(([id]) => id === section)?.[1]} style={styles.panel}>
        {section === 'finance' ? <ProjectFinance key={`${project.id}-${canReadCash}`} project={project}
          canReadCash={canReadCash} isAdmin={isAdmin} /> : <>
          {section === 'overview' && <View style={local.metadata}>
            <Detail label="Mục tiêu / kết quả bàn giao" value={project.goal} />
            <Detail label="Giai đoạn hiện tại" value={project.phase} />
            <Detail label="Rủi ro / cần quyết định" value={project.risks} />
            <Detail label="Mô tả ngắn" value={project.note} />
          </View>}
          {taskError ? <View style={styles.stack}>
            <Text accessibilityRole="alert" style={styles.error}>Không tải được đầy đủ công việc dự án.</Text>
            <Button label="Thử lại" secondary onPress={() => {
              if (pilotMode) { setPilotError(false); setPilotRetry(value => value + 1); }
              else onRetryTasks();
            }} />
          </View> : !projectTasks ? <ActivityIndicator accessibilityLabel="Đang tải công việc dự án" color={colors.accent} />
            : section === 'overview' ? <View style={local.metrics}>
              <Metric label={pilotMode && isAdmin ? 'Tiến độ thực hiện' : 'Tiến độ việc tôi được xem'}
                value={metrics.progress === null ? '–' : `${metrics.progress}%`} />
              <Metric label="Việc đã duyệt / tổng việc" value={`${metrics.done}/${projectTasks.length}`} />
              <Metric label="Việc chờ duyệt" value={metrics.review} />
              <Metric label="Việc quá hạn" value={metrics.overdue} />
              <Metric label="Việc đang vướng" value={metrics.blocked} />
            </View> : <View style={styles.stack}>
              <Text accessibilityRole="header" style={styles.cardTitle}>Việc trong dự án</Text>
              {projectTasks.length === 0 ? <Text style={styles.muted}>Chưa có việc trong phạm vi truy cập.</Text>
                : <TaskBoard tasks={projectTasks} member={{ email, name }}
                  options={route.kanban ? board : { ...board, view: 'list' }}
                  onOptionsChange={next => {
                    setBoard({ ...next, view: 'kanban' });
                    if ((next.view === 'kanban') !== !!route.kanban) {
                      onNavigate({ ...resolvedRoute, kanban: next.view === 'kanban' });
                    }
                  }} onOpen={onOpenTask} onDragChange={onDragChange} />}
            </View>}
        </>}
      </View>
    </>}
    {isAdmin && editor && <ProjectEditor project={editor === 'new' ? undefined : editor}
      onCancel={() => setEditor(null)} onSaved={projectId => {
        setEditor(null);
        if (editor === 'new') navigate({ projectId, section: 'overview' });
      }} />}
  </>;
}

function Detail({ label, value }: { label: string; value?: string }) {
  const styles = useScreenStyles();
  return <Text selectable style={styles.muted}>
    <Text style={[local.metaLabel, styles.metadataLabel]}>{label}: </Text>{value || 'Chưa cập nhật'}
  </Text>;
}

function Metric({ label, value }: { label: string; value: number | string }) {
  const styles = useScreenStyles();
  return <View style={[styles.panel, local.metric]}>
    <Text style={styles.muted}>{label}</Text>
    <Text style={styles.heading}>{value}</Text>
  </View>;
}

const local = StyleSheet.create({
  projectTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  projectTitle: { flex: 1, minWidth: 0 },
  editButton: { flexShrink: 0 },
  tabs: { flexDirection: 'row', gap: 4, padding: 3, borderRadius: 10 },
  tab: { flex: 1, minWidth: 0, minHeight: 44, paddingHorizontal: 4, paddingVertical: 8, borderRadius: 8,
    justifyContent: 'center' },
  workTab: { flex: 1.65 },
  tabLabel: { fontSize: 13, fontWeight: '700', textAlign: 'center' },
  metadata: { gap: 4 },
  metaLabel: { fontWeight: '700' },
  metrics: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  metric: { flexBasis: 132, flexGrow: 1, padding: 14, gap: 4 },
});
