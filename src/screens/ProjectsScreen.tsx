import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { PageHeader } from '../components/PageHeader';
import { Button } from '../components/Button';
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
        : <View style={styles.choices}>
          {projects.map(item => <Choice key={item.id} label={item.name} selected={item.id === project?.id}
            onPress={() => { setBoard({ ...initialTaskBoardOptions, view: 'kanban' }); navigate({ projectId: item.id }); }} />)}
        </View>}
    </View>
    {project && <>
      <View role="region" accessibilityLabel="Thông tin dự án" style={styles.panel}>
        <Text accessibilityRole="header" style={styles.heading}>{project.name}</Text>
        <Text style={styles.badge}>{project.status || 'Chưa cập nhật trạng thái'}</Text>
        <View style={local.metadata}>
          <Text selectable style={styles.muted}><Text style={local.metaLabel}>Mã dự án: </Text>DA-{project.id}</Text>
          <Text selectable style={styles.muted}>
            <Text style={local.metaLabel}>Thời gian: </Text>
            {project.startDate ? formatTaskDate(project.startDate) : 'Chưa có ngày bắt đầu'} → {
              project.deadline ? formatTaskDate(project.deadline) : 'Chưa có ngày kết thúc'}
          </Text>
          <Text selectable style={styles.muted}>
            <Text style={local.metaLabel}>Người phụ trách: </Text>{project.owner || project.ownerEmail || 'Chưa có'}
          </Text>
        </View>
        {isAdmin && <Button label="Chỉnh sửa dự án" secondary onPress={() => setEditor(project)} />}
        <View accessibilityLabel="Mục trong hồ sơ dự án" style={styles.choices}>
          {sections.map(([id, label]) => <Choice key={id} label={label} selected={section === id}
            onPress={() => navigate({ projectId: project.id, section: id })} />)}
        </View>
      </View>
      <View role="region" accessibilityLabel={sections.find(([id]) => id === section)?.[1]} style={styles.panel}>
        {section === 'finance' ? <ProjectFinance key={`${project.id}-${canReadCash}`} project={project}
          canReadCash={canReadCash} isAdmin={isAdmin} /> : <>
          {section === 'overview' && <View style={styles.stack}>
            <Detail label="Mục tiêu / kết quả bàn giao" value={project.goal || project.note} divider={false} />
            <Detail label="Giai đoạn hiện tại" value={project.phase} />
            <Detail label="Rủi ro / cần quyết định" value={project.risks} />
            {project.goal && project.note ? <Detail label="Mô tả ngắn" value={project.note} /> : null}
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

function Detail({ label, value, divider = true }: { label: string; value?: string; divider?: boolean }) {
  const styles = useScreenStyles();
  return <View style={[styles.detailRow, !divider && local.firstDetail]}>
    <Text style={styles.label}>{label}</Text>
    <Text selectable style={styles.body}>{value || 'Chưa cập nhật'}</Text>
  </View>;
}

function Choice({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  const styles = useScreenStyles();
  return <Pressable accessibilityRole="button" accessibilityState={{ selected }} onPress={onPress}
    style={[styles.choice, local.choice, selected && styles.selected]}>
    <Text style={styles.label}>{label}</Text>
  </Pressable>;
}

function Metric({ label, value }: { label: string; value: number | string }) {
  const styles = useScreenStyles();
  return <View style={[styles.panel, local.metric]}>
    <Text style={styles.muted}>{label}</Text>
    <Text style={styles.heading}>{value}</Text>
  </View>;
}

const local = StyleSheet.create({
  choice: { maxWidth: '100%' },
  metadata: { gap: 4 },
  metaLabel: { fontWeight: '700' },
  firstDetail: { borderTopWidth: 0, paddingTop: 0 },
  metrics: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  metric: { flexBasis: 132, flexGrow: 1, padding: 14, gap: 4 },
});
