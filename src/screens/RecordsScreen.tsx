import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { Button } from '../components/Button';
import { Dropdown } from '../components/Dropdown';
import { PageHeader } from '../components/PageHeader';
import { SearchInput } from '../components/SearchInput';
import { useToast } from '../components/Toast';
import { bookStatuses, recordActions, recordBooks, recordIsLate, recordIsOpen, recordKinds,
  recordNumber, recordSortTime, recordStates, recordSystemCode, watchRecords } from '../features/records/records';
import type { Correspondence, RecordBook, RecordStatus } from '../features/records/records';
import { RecordForm } from '../features/records/RecordForm';
import { RecordPdfButton } from '../features/records/RecordPdf';
import { watchRecordEvents } from '../features/records/recordStore';
import type { RecordEvent } from '../features/records/recordStore';
import { todayInVietnam } from '../features/tasks/taskDates';
import { watchPlanningTeam } from '../features/weekly-plan/weeklyPlanStore';
import { useScreenStyles } from '../theme/screenStyles';
import { useTheme } from '../theme/theme';
import { searchByName } from '../utils/search';
import { formatVietnamDateTime } from '../utils/dateTime';

const books = ['in', 'out'] as const;
const kindChoices = [{ value: '', label: 'Tất cả' },
  ...Object.entries(recordKinds).map(([value, label]) => ({ value, label }))];

function displayDate(date?: string) {
  return date?.split('-').reverse().join('/') || '—';
}

export function RecordsScreen({ email, isAdmin, recordId, onSelect, onScrollTop, onBackToReview }: {
  email: string;
  isAdmin: boolean;
  recordId?: string;
  onSelect: (id?: string) => void;
  onScrollTop: () => void;
  onBackToReview?: () => void;
}) {
  const styles = useScreenStyles();
  const { colors } = useTheme();
  const toast = useToast();
  const [rows, setRows] = useState<Correspondence[] | null>(null);
  const [names, setNames] = useState<Map<string, string>>(() => new Map());
  const [error, setError] = useState(false);
  const [retry, setRetry] = useState(0);
  const [book, setBook] = useState<RecordBook>('in');
  const [term, setTerm] = useState('');
  const [status, setStatus] = useState('');
  const [kind, setKind] = useState('');
  const [late, setLate] = useState(false);
  const [watching, setWatching] = useState(false);
  const [actionOnly, setActionOnly] = useState(false);
  const [form, setForm] = useState<{ direction: RecordBook; existing?: Correspondence;
    action?: { status: RecordStatus; label: string } }>();
  const today = todayInVietnam();
  const selected = rows?.find(row => row.id === recordId);

  useEffect(() => watchRecords(email, isAdmin, setRows, () => {
    setRows(null);
    setError(true);
  }), [email, isAdmin, retry]);
  useEffect(() => watchPlanningTeam(team => setNames(new Map(team.map(member => [member.email, member.name]))),
    () => setNames(new Map())), [email]);

  const current = rows?.filter(row => row.direction === book) ?? [];
  const follows = (row: Correspondence) => row.watchers?.includes(email) ?? false;
  const actions = (row: Correspondence) => recordActions(row, email, isAdmin);
  const overdue = (row: Correspondence) => recordIsLate(row, today);
  const assignee = (row: Correspondence) => row.assigneeEmail
    ? names.get(row.assigneeEmail) || row.assigneeEmail : 'Chưa giao';
  const filtered = searchByName(current.filter(row => (!watching || follows(row)) &&
    (!actionOnly || actions(row).length) && (!late || overdue(row)) &&
    (!kind || kind === (row.kind || 'letter')) && (!status || status === row.status)), term,
  row => [recordNumber(row), recordSystemCode(row, today), row.externalNumber, row.subject,
    row.partner, assignee(row), row.assigneeEmail].filter(Boolean).join(' '));
  filtered.sort((a, b) => recordSortTime(b, watching) - recordSortTime(a, watching));

  function closeRecord() {
    if (onBackToReview) return onBackToReview();
    if (selected && book !== selected.direction) {
      setBook(selected.direction);
      setStatus('');
    }
    onSelect();
  }

  function openForm(value: NonNullable<typeof form>) {
    setForm(value);
    onScrollTop();
  }

  if (form && (form.existing?.id === recordId) && (!form.existing || selected)) {
    return <View style={styles.stack}>
      <PageHeader title="Văn thư" />
      <RecordForm {...form} names={names} email={email} isAdmin={isAdmin} onCancel={() => setForm(undefined)}
        onSaved={({ id, code, notificationFailed }) => {
          setForm(undefined);
          onSelect(id);
          toast(notificationFailed ? 'Đã lưu hồ sơ. Chưa gửi được thông báo cho người theo dõi.'
            : code ? `Đã lưu và cấp số ${code}.` : 'Đã lưu hồ sơ.', notificationFailed ? 'error' : 'success');
        }} />
    </View>;
  }

  return (
    <View style={styles.stack}>
      <PageHeader title="Văn thư" />
      {recordId ? <Button label={onBackToReview ? 'Về Phê duyệt' : 'Về sổ văn thư'} secondary onPress={closeRecord} /> : (
        <View style={styles.panel}>
          <View style={local.row}>
            {books.map(value => <Button key={value} label={recordBooks[value]} secondary
              selected={value === book} style={local.flex}
              onPress={() => { setBook(value); setStatus(''); }} />)}
          </View>
          {isAdmin && rows && <Button label={book === 'in' ? 'Vào sổ văn bản đến' : 'Lập bản nháp văn bản đi'}
            onPress={() => openForm({ direction: book })} />}
          {rows && <>
            <View style={styles.choices}>
              <Text style={styles.badge}>{current.filter(recordIsOpen).length} đang mở</Text>
              <Text style={styles.badge}>{current.filter(overdue).length} quá hạn</Text>
              <Text style={styles.badge}>{current.filter(row => row.status === 'archived').length} đã lưu</Text>
            </View>
            <View style={styles.choices}>
              <Button label={`Đang theo dõi (${current.filter(follows).length})`} secondary
                selected={watching} onPress={() => setWatching(value => !value)} />
              <Button label={`Cần tôi xử lý (${current.filter(row => actions(row).length).length})`} secondary
                selected={actionOnly} onPress={() => setActionOnly(value => !value)} />
              <Button label="Chỉ quá hạn" secondary selected={late} onPress={() => setLate(value => !value)} />
            </View>
          </>}
        </View>
      )}
      {error ? <View style={styles.panel}>
        <Text accessibilityRole="alert" style={styles.error}>Không tải được sổ văn thư.</Text>
        <Button label="Thử lại" secondary onPress={() => { setError(false); setRetry(value => value + 1); }} />
      </View> : !rows ? (
        <ActivityIndicator accessibilityLabel="Đang tải sổ văn thư" color={colors.accent} />
      ) : recordId ? (
        selected ? <View style={styles.panel}>
          <Text style={styles.badge}>{recordBooks[selected.direction]}</Text>
          <Text accessibilityRole="header" style={styles.cardTitle}>{selected.subject || 'Hồ sơ văn thư'}</Text>
          {[
            ['Số văn bản', recordNumber(selected)],
            ['Mã hồ sơ', recordSystemCode(selected, today)],
            ['Loại văn bản', recordKinds[selected.kind ?? 'letter']],
            ['Trạng thái', recordStates[selected.status]],
            [selected.direction === 'in' ? 'Nơi gửi' : 'Nơi nhận', selected.partner],
            ['Số bên gửi', selected.direction === 'in' ? selected.externalNumber : undefined],
            ['Phụ trách', assignee(selected)],
            ['Ngày văn bản', displayDate(selected.documentOn)],
            ['Ngày vào sổ', displayDate(selected.registeredOn)],
            ['Hạn xử lý', displayDate(selected.dueOn)],
            ['Người ký', selected.signedByName],
            ['Ngày ký', selected.signedOn ? displayDate(selected.signedOn) : undefined],
            ['PDF đính kèm', selected.fileId ? selected.fileName || 'PDF đã lưu' : 'Chưa lưu tệp'],
          ].filter(([, value]) => value).map(([label, value]) => (
            <View key={label} style={styles.detailRow}>
              <Text style={styles.label}>{label}</Text>
              <Text selectable style={styles.body}>{value}</Text>
            </View>
          ))}
          {selected.fileId && <RecordPdfButton key={selected.fileId} recordId={selected.id} fileId={selected.fileId} />}
          {actions(selected).map(action => <Button key={action.status} label={action.label}
            secondary={action.status === 'void' || action.status === 'draft'}
            onPress={() => openForm({ direction: selected.direction, existing: selected, action })} />)}
          <RecordHistory key={selected.id} id={selected.id} names={names} />
        </View> : <Text accessibilityRole="alert" style={styles.muted}>Hồ sơ không có trong phạm vi truy cập của bạn.</Text>
      ) : (
        <>
          <View style={styles.panel}>
            <Text accessibilityRole="header" style={styles.cardTitle}>{recordBooks[book]} · {filtered.length} hồ sơ</Text>
            <SearchInput accessibilityLabel="Tìm văn bản" placeholder="Số, mã hồ sơ, trích yếu, đơn vị"
              value={term} onChangeText={setTerm} style={styles.input} placeholderTextColor={colors.muted} />
            <View style={local.row}>
              <Dropdown label="Loại văn bản" value={kind} choices={kindChoices} onChange={setKind} style={local.flex} />
              <Dropdown label="Trạng thái" value={status} onChange={setStatus} style={local.flex}
                choices={[{ value: '', label: 'Tất cả' }, ...bookStatuses[book].map(value => ({ value, label: recordStates[value] }))]} />
            </View>
            {!filtered.length && <Text style={styles.muted}>{current.length
              ? 'Không có văn bản khớp bộ lọc.' : 'Sổ chưa có văn bản.'}</Text>}
          </View>
          {filtered.map(row => (
            <Pressable key={row.id} accessibilityRole="button" onPress={() => onSelect(row.id)}
              style={({ pressed }) => [styles.panel, local.record, pressed && styles.dimmed]}>
              <Text style={styles.muted}>{recordNumber(row)} · {recordKinds[row.kind ?? 'letter']}</Text>
              <Text style={styles.cardTitle}>{row.subject || 'Hồ sơ văn thư'}</Text>
              <Text style={styles.muted}>{row.partner || '—'} · {assignee(row)}</Text>
              <View style={styles.choices}>
                <Text style={styles.badge}>{recordStates[row.status]}</Text>
                {row.priority === 'urgent' && <Text style={styles.badge}>Khẩn</Text>}
                {row.fileId && <Text style={styles.badge}>PDF đã lưu</Text>}
                {overdue(row) && <Text style={styles.error}>Quá hạn</Text>}
              </View>
              {!!row.dueOn && <Text style={styles.muted}>Hạn {displayDate(row.dueOn)}</Text>}
            </Pressable>
          ))}
        </>
      )}
    </View>
  );
}

function RecordHistory({ id, names }: { id: string; names: Map<string, string> }) {
  const styles = useScreenStyles();
  const [events, setEvents] = useState<RecordEvent[]>();
  const [error, setError] = useState(false);
  useEffect(() => watchRecordEvents(id, setEvents, () => { setEvents(undefined); setError(true); }), [id]);
  return <View style={styles.stack}>
    <Text accessibilityRole="header" style={styles.cardTitle}>Nhật ký xử lý</Text>
    {error ? <Text style={styles.error}>Không tải được nhật ký.</Text>
      : !events?.length ? <Text style={styles.muted}>{events ? 'Chưa có nhật ký.' : 'Đang tải nhật ký…'}</Text>
        : events.map(event => <View key={event.id} style={styles.detailRow}>
          <Text style={styles.label}>{recordStates[event.to]}</Text>
          <Text style={styles.muted}>{names.get(event.actor) ?? event.actor} · {formatVietnamDateTime(event.at.toISOString())}</Text>
          <Text style={styles.body}>{event.note}</Text>
        </View>)}
  </View>;
}

const local = StyleSheet.create({
  row: { flexDirection: 'row', gap: 8 },
  flex: { flex: 1, minWidth: 0 },
  record: { gap: 7 },
});
