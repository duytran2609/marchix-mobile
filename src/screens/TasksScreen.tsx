import { ActivityIndicator, Text, View } from 'react-native';
import { Button } from '../components/Button';
import { useToast } from '../components/Toast';
import { TaskAssignmentForm } from '../features/tasks/TaskAssignmentForm';
import { TaskBoard } from '../features/tasks/TaskBoard';
import type { TaskBoardOptions } from '../features/tasks/TaskBoard';
import type { Task } from '../features/tasks/tasks';
import { taskAssignmentEnabled } from '../services/firebase/firebase';
import { colors } from '../theme/theme';
import { screenStyles } from '../theme/screenStyles';

export function TasksScreen({
  email, name, tasks, error, sentError, onRetry, options, onOptionsChange, onOpenTask,
  showAssignment, setShowAssignment, onDragChange,
}: {
  email: string; name: string; tasks: Task[] | null; error: boolean; sentError: boolean; onRetry: () => void;
  options: TaskBoardOptions; onOptionsChange: (options: TaskBoardOptions) => void; onOpenTask: (task: Task) => void;
  showAssignment: boolean; setShowAssignment: (open: boolean) => void; onDragChange: (dragging: boolean) => void;
}) {
  const showToast = useToast();

  return (
    <View style={screenStyles.stack}>
      <View style={screenStyles.listHeader}>
        <Text accessibilityRole="header" style={[screenStyles.heading, screenStyles.listHeading]}>CÔNG VIỆC</Text>
        {taskAssignmentEnabled ? <Button label="+ Giao việc" onPress={() => setShowAssignment(true)} /> : null}
      </View>
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
