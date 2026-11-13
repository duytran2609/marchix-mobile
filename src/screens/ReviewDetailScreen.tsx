import { useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { Button } from '../components/Button';
import { FieldLabel } from '../components/FieldLabel';
import { useToast } from '../components/Toast';
import { formatDue } from '../features/tasks/taskDates';
import { TaskProgress } from '../features/tasks/TaskProgress';
import { checklistWeight } from '../features/tasks/checklistProgress';
import { commentMaxLength, reviewRatings, reviewTaskCompletion, submissionVersion } from '../features/tasks/tasks';
import type { ReviewRating, Task } from '../features/tasks/tasks';
import { taskAssignmentEnabled } from '../services/firebase/firebase';
import { formatVietnamDateTime } from '../utils/dateTime';
import { useScreenStyles } from '../theme/screenStyles';

export function ReviewDetailScreen({ task, active, needsReviewer, onBack, onReviewed }: {
  task: Task; active: boolean; needsReviewer: boolean; onBack: () => void; onReviewed: () => void;
}) {
  const screenStyles = useScreenStyles();
  const showToast = useToast();
  const [rating, setRating] = useState<ReviewRating | ''>('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState<'approve' | 'rework' | null>(null);
  const result = task.comments?.find(comment => comment.by === task.assigneeEmail && comment.at === submissionVersion(task));
  const submittedAt = formatVietnamDateTime(submissionVersion(task));

  async function decide(decision: 'approve' | 'rework') {
    if (busy || !active || needsReviewer || !taskAssignmentEnabled || (decision === 'approve' ? !rating : !note.trim())) return;
    setBusy(decision);
    try {
      await reviewTaskCompletion({ taskId: task.id, submission: submissionVersion(task), decision, rating, note });
      onReviewed();
      showToast(decision === 'approve' ? 'Đã duyệt công việc.' : 'Đã trả lại công việc.');
    } catch (err) {
      const code = err && typeof err === 'object' && 'code' in err ? err.code : null;
      showToast(err instanceof Error && (!code || code === 'functions/failed-precondition' || code === 'functions/invalid-argument' ||
        code === 'functions/permission-denied')
        ? err.message : 'Chưa xử lý được công việc. Kiểm tra kết nối hoặc quyền duyệt.', 'error');
    } finally {
      setBusy(null);
    }
  }

  return (
    <View style={screenStyles.stack}>
      <Button label="‹ Việc chờ duyệt" secondary onPress={onBack} disabled={!!busy} />
      <View style={screenStyles.panel}>
        <Text accessibilityRole="header" style={screenStyles.heading}>{task.title}</Text>
        <Text style={screenStyles.muted}>Người thực hiện · {task.assignee || task.assigneeEmail}</Text>
        <Text style={screenStyles.muted}>{formatDue(task.due)}</Text>
        {submittedAt ? <Text style={screenStyles.muted}>Gửi duyệt lúc {submittedAt}</Text> : null}
        <TaskProgress task={task} />
        {task.note ? <Text style={screenStyles.body}>{task.note}</Text> : null}
        {task.checklist?.map((item, index) => (
          <Text key={index} style={screenStyles.body}>
            {item.done ? '✓' : '○'} {item.t || item.text || `Việc con ${index + 1}`} · Khối lượng {checklistWeight(item.weight)}
          </Text>
        ))}
        <View style={screenStyles.detailRow}>
          <Text style={screenStyles.label}>Kết quả nhân viên gửi</Text>
          <Text style={result?.text ? screenStyles.body : screenStyles.muted}>{result?.text || 'Không có ghi chú kết quả.'}</Text>
        </View>
      </View>
      {!active ? <Text style={screenStyles.muted}>Lượt gửi duyệt này đã thay đổi. Quay về danh sách để kiểm tra lại.</Text>
        : needsReviewer ? <Text style={screenStyles.muted}>Cần chỉ định người có quyền duyệt công việc này.</Text>
        : !taskAssignmentEnabled ? <Text style={screenStyles.muted}>Bản này chỉ cho xem kết quả gửi duyệt.</Text> : (
        <View style={screenStyles.panel}>
          <Text accessibilityRole="header" style={screenStyles.cardTitle}>Đánh giá kết quả</Text>
          <FieldLabel style={screenStyles.label} required>Mức đánh giá khi duyệt</FieldLabel>
          <View accessibilityRole="radiogroup" accessibilityLabel="Mức đánh giá" style={screenStyles.choices}>
            {reviewRatings.map(value => (
              <Pressable key={value} accessibilityRole="radio" aria-checked={value === rating}
                accessibilityState={{ checked: value === rating, disabled: !!busy }} disabled={!!busy}
                onPress={() => setRating(value)} style={[screenStyles.choice, value === rating && screenStyles.selected]}>
                <Text style={screenStyles.label}>{value}</Text>
              </Pressable>
            ))}
          </View>
          <FieldLabel style={screenStyles.label} required>Nhận xét khi trả lại</FieldLabel>
          <TextInput accessibilityLabel="Nhận xét" placeholder="Nhập nhận xét hoặc lý do trả lại"
            style={[screenStyles.input, screenStyles.messageInput]} value={note} onChangeText={setNote}
            multiline maxLength={commentMaxLength} editable={!busy} />
          <Button label={busy === 'approve' ? 'Đang duyệt…' : 'Duyệt'} disabled={!!busy || !rating}
            onPress={() => void decide('approve')} />
          <Button label={busy === 'rework' ? 'Đang trả lại…' : 'Trả lại'} secondary
            disabled={!!busy || !note.trim()} onPress={() => void decide('rework')} />
        </View>
      )}
    </View>
  );
}
