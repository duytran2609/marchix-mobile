import { ActivityIndicator, Text, View } from 'react-native';
import { PageHeader } from '../components/PageHeader';
import { Button } from '../components/Button';
import { useToast } from '../components/Toast';
import type { ReminderWindow } from '../features/settings/reminderSettings';
import { DueTaskReminders } from '../features/tasks/DueTaskReminders';
import { TaskAssignmentForm } from '../features/tasks/TaskAssignmentForm';
import { TaskBoard } from '../features/tasks/TaskBoard';
import type { TaskBoardOptions } from '../features/tasks/TaskBoard';
import type { Task } from '../features/tasks/tasks';
import { taskAssignmentEnabled } from '../services/firebase/firebase';
import { useTheme } from '../theme/theme';
import { useScreenStyles } from '../theme/screenStyles';

export function TasksScreen({
  email, name, tasks, error, sentError, onRetry, options, onOptionsChange, onOpenTask, reminderWindow,
  showAssignment, setShowAssignment, onDragChange,
}: {
  email: string; name: string; tasks: Task[] | null; error: boolean; sentError: boolean; onRetry: () => void;
  reminderWindow: ReminderWindow;
  options: TaskBoardOptions; onOptionsChange: (options: TaskBoardOptions) => void; onOpenTask: (task: Task) => void;
  showAssignment: boolean; setShowAssignment: (open: boolean) => void; onDragChange: (dragging: boolean) => void;
}) {
  const { colors } = useTheme();
  const screenStyles = useScreenStyles();
  const showToast = useToast();

  return (
    <View style={screenStyles.stack}>
      <PageHeader title="CÔNG VIỆC">
        {taskAssignmentEnabled ? <Button label="+ Giao việc" onPress={() => setShowAssignment(true)} /> : null}
      </PageHeader>
      {error ? <View style={screenStyles.panel}>
          <Text accessibilityRole="alert" style={screenStyles.error}>Không tải được công việc. Kiểm tra kết nối và quyền truy cập.</Text>
          <Button label="Thử lại" secondary onPress={onRetry} />
        </View>
        : !tasks ? <ActivityIndicator accessibilityLabel="Đang tải công việc" color={colors.accent} />
        : <>
            {sentError ? <View style={screenStyles.panel}>
              <Text accessibilityRole="alert" style={screenStyles.error}>Chưa tải được việc bạn đã giao.</Text>
              <Button label="Thử lại" secondary onPress={onRetry} />
            </View> : null}
            <DueTaskReminders tasks={tasks} email={email} window={reminderWindow} onOpen={onOpenTask} />
            <TaskBoard tasks={tasks} member={{ email, name }} options={options} onOptionsChange={onOptionsChange} onDragChange={onDragChange}
              onOpen={onOpenTask} />
          </>}
      {showAssignment && taskAssignmentEnabled ? (
        <TaskAssignmentForm email={email} onClose={() => setShowAssignment(false)}
          onSaved={assignees => {
            setShowAssignment(false);
            const assignedTo = assignees.length === 1 ? assignees[0] : `${assignees.length} người`;
            showToast(`Đã giao việc cho ${assignedTo}.`);
          }} />
      ) : null}
    </View>
  );
}
