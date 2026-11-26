import { useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { TextInput } from '../components/TextInput';
import { EmptyState } from '../components/EmptyState';
import { SafeAreaView } from 'react-native-safe-area-context';
import { PopupAction, PopupBody } from '../components/PopupBody';
import { KeyboardViewport } from '../components/KeyboardViewport';
import { FieldLabel } from '../components/FieldLabel';
import { PopupHeader } from '../components/PopupHeader';
import { ToastLayer, useToast } from '../components/Toast';
import { formatTaskDate } from '../features/tasks/taskDates';
import { taskUnsetLabel } from '../features/tasks/taskLabels';
import { TaskProgress } from '../features/tasks/TaskProgress';
import { checklistWeight } from '../features/tasks/checklistProgress';
import { commentMaxLength, reviewRatings, reviewTaskCompletion, submissionVersion } from '../features/tasks/tasks';
import type { ReviewRating, Task } from '../features/tasks/tasks';
import { taskAssignmentEnabled } from '../services/firebase/firebase';
import { formatVietnamDateTime } from '../utils/dateTime';
import { createThemedStyles } from '../theme/theme';
import { useScreenStyles } from '../theme/screenStyles';

export function ReviewDetailScreen({ task, active, needsReviewer, onBack, onReviewed, onAssignReviewer }: {
  task: Task; active: boolean; needsReviewer: boolean; onBack: () => void; onReviewed: () => void;
  onAssignReviewer?: () => void;
}) {
  const screenStyles = useScreenStyles();
  const styles = useStyles();
  const showToast = useToast();
  const [rating, setRating] = useState<ReviewRating | ''>('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState<'approve' | 'rework' | null>(null);
  const result = task.comments?.find(comment => comment.by === task.assigneeEmail && comment.at === submissionVersion(task));
  const due = task.due?.trim();
  const metadata = [
    ['Người thực hiện', task.assignee?.trim() || task.assigneeEmail?.trim()],
    ['Hạn chót', due && formatTaskDate(due)],
    ['Gửi duyệt lúc', formatVietnamDateTime(submissionVersion(task))],
  ];

  async function decide(decision: 'approve' | 'rework') {
    if (busy || !active || needsReviewer || !taskAssignmentEnabled || (decision === 'approve' ? !rating : !note.trim())) return;
    setBusy(decision);
    try {
      await reviewTaskCompletion({ taskId: task.id, submission: submissionVersion(task), decision, rating, note });
      onReviewed();
      showToast(decision === 'approve' ? `Đã duyệt công việc với mức đánh giá ${rating}.`
        : 'Đã yêu cầu người thực hiện làm lại công việc.');
    } catch (err) {
      const code = err && typeof err === 'object' && 'code' in err ? err.code : null;
      const fallback = decision === 'approve' ? 'Chưa duyệt được công việc. Kiểm tra kết nối hoặc quyền duyệt.'
        : 'Chưa gửi được yêu cầu làm lại. Kiểm tra kết nối hoặc quyền duyệt.';
      showToast(err instanceof Error && (!code || code === 'functions/failed-precondition' || code === 'functions/invalid-argument' ||
        code === 'functions/permission-denied')
        ? err.message : fallback, 'error');
    } finally {
      setBusy(null);
    }
  }

  return <Modal transparent animationType="fade" statusBarTranslucent navigationBarTranslucent
    onRequestClose={() => { if (!busy) onBack(); }}>
    <SafeAreaView style={styles.overlay}>
      <KeyboardViewport style={styles.center}>
        <View role="dialog" accessibilityLabel="Chi tiết phê duyệt công việc" accessibilityViewIsModal style={styles.popup}>
          <PopupHeader title="Chi tiết phê duyệt công việc" closeLabel="Đóng chi tiết phê duyệt"
            onClose={onBack} disabled={!!busy} />
          <PopupBody contentContainerStyle={[styles.content, screenStyles.stack]}
            footer={active && taskAssignmentEnabled && (needsReviewer ? onAssignReviewer &&
              <PopupAction label="Chỉ định người duyệt" onPress={onAssignReviewer} /> : <>
              <PopupAction label={busy === 'approve' ? 'Đang duyệt…' : 'Duyệt'} disabled={!!busy || !rating}
                onPress={() => void decide('approve')} />
              <PopupAction label={busy === 'rework' ? 'Đang trả lại…' : 'Trả lại'} secondary
                disabled={!!busy || !note.trim()} onPress={() => void decide('rework')} />
            </>)}>
            <View style={screenStyles.panel}>
              <Text accessibilityRole="header" style={screenStyles.heading}>{task.title}</Text>
              {metadata.map(([label, value]) => <Text key={label} style={[screenStyles.muted, screenStyles.metadataValue]}>
                <Text style={screenStyles.metadataLabel}>{label}: </Text>
                {value || <Text style={screenStyles.unsetValue}>{taskUnsetLabel}</Text>}
              </Text>)}
              <TaskProgress task={task} />
              {task.note ? <Text style={screenStyles.body}>{task.note}</Text> : null}
              {task.checklist?.map((item, index) => (
                <Text key={index} style={screenStyles.body}>
                  {item.done ? '✓' : '○'} {item.t || item.text || `Việc con ${index + 1}`} · <Text style={screenStyles.metadataValue}>
                    <Text style={screenStyles.metadataLabel}>Khối lượng </Text>{checklistWeight(item.weight)}
                  </Text>
                </Text>
              ))}
              <View style={screenStyles.detailRow}>
                <Text style={[screenStyles.label, screenStyles.metadataLabel]}>Kết quả nhân viên gửi</Text>
                {result?.text?.trim() ? <Text style={[screenStyles.body, screenStyles.metadataValue]}>{result.text}</Text>
                  : <EmptyState icon="note" message={taskUnsetLabel} />}
              </View>
            </View>
            {!active ? <Text style={screenStyles.muted}>Lượt gửi duyệt này đã thay đổi. Quay về danh sách để kiểm tra lại.</Text>
              : needsReviewer ? <>
                <Text style={screenStyles.muted}>Cần chỉ định người có quyền duyệt công việc này.</Text>
              </>
              : !taskAssignmentEnabled ? <Text style={screenStyles.muted}>Bản này chỉ cho xem kết quả gửi duyệt.</Text> : (
              <View style={screenStyles.panel}>
                <Text accessibilityRole="header" style={screenStyles.cardTitle}>Đánh giá kết quả</Text>
                <FieldLabel style={screenStyles.label} required>Mức đánh giá khi duyệt</FieldLabel>
                <View accessibilityRole="radiogroup" accessibilityLabel="Mức đánh giá" style={screenStyles.choices}>
                  {reviewRatings.map(value => (
                    <Pressable key={value} accessibilityRole="radio" aria-checked={value === rating}
                      accessibilityState={{ checked: value === rating, disabled: !!busy }} disabled={!!busy}
                      onPress={() => setRating(value)} style={[screenStyles.choice, value === rating && screenStyles.selected]}>
                      <Text style={[screenStyles.label, screenStyles.metadataValue]}>{value}</Text>
                    </Pressable>
                  ))}
                </View>
                <FieldLabel style={screenStyles.label} required>Nhận xét khi trả lại</FieldLabel>
                <TextInput accessibilityLabel="Nhận xét" placeholder="Nhập nhận xét hoặc lý do trả lại"
                  style={[screenStyles.input, screenStyles.messageInput]} value={note} onChangeText={setNote}
                  multiline maxLength={commentMaxLength} editable={!busy} />
              </View>
            )}
          </PopupBody>
        </View>
      </KeyboardViewport>
      <ToastLayer safeAreaApplied />
    </SafeAreaView>
  </Modal>;
}

const useStyles = createThemedStyles(colors => StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(33, 25, 53, 0.45)' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 12 },
  popup: { width: '100%', maxWidth: 560, flexShrink: 1, overflow: 'hidden', borderRadius: 16, backgroundColor: colors.paper },
  content: { padding: 16 },
}));
