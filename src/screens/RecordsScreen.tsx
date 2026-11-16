import { PaginatedList } from '../components/PaginatedList';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ClickableCardHeader } from '../components/CardChevron';
import { Button } from '../components/Button';
import { Dropdown } from '../components/Dropdown';
import { PopupCloseButton } from '../components/PopupCloseButton';
import { PageHeader } from '../components/PageHeader';
import { SearchInput } from '../components/SearchInput';
import { SegmentedButtons } from '../components/SegmentedButtons';
import { useToast } from '../components/Toast';
import { bookStatuses, recordActions, recordBooks, recordIsLate, recordIsOpen, recordKinds,
  recordNumber, recordSortTime, recordStates, recordSystemCode, watchRecords } from '../features/records/records';
import type { Correspondence, RecordBook, RecordStatus } from '../features/records/records';
import { RecordForm } from '../features/records/RecordForm';
import { RecordAttachmentButton, RecordAttachmentPreview } from '../features/records/RecordAttachment';
import type { RecordAttachment } from '../features/records/RecordAttachment';
import { watchRecordEvents } from '../features/records/recordStore';
import type { RecordEvent } from '../features/records/recordStore';
import { todayInVietnam } from '../features/tasks/taskDates';
import { watchPlanningTeam } from '../features/weekly-plan/weeklyPlanStore';
import { useScreenStyles } from '../theme/screenStyles';
import { useTheme } from '../theme/theme';
import { searchByName } from '../utils/search';
import { formatVietnamDateTime } from '../utils/dateTime';

type RecordsTab = RecordBook | 'history';
const tabChoices: { value: RecordsTab; label: string }[] = [
  { value: 'in', label: recordBooks.in },
  { value: 'out', label: recordBooks.out },
  { value: 'history', label: 'Lịch sử' },
];
const kindChoices = [{ value: '', label: 'Tất cả' },
  ...Object.entries(recordKinds).map(([value, label]) => ({ value, label }))];

function displayDate(date?: string) {
  return date?.split('-').reverse().join('/') || '—';
}

export function RecordsScreen({ email, isAdmin, recordId: routeRecordId, onSelect, onBackToReview }: {
  email: string;
  isAdmin: boolean;
  recordId?: string;
  onSelect: (id?: string) => void;
  onBackToReview?: () => void;
}) {
  const styles = useScreenStyles();
  const { colors } = useTheme();
  const toast = useToast();
  const [rows, setRows] = useState<Correspondence[] | null>(null);
  const [names, setNames] = useState<Map<string, string>>(() => new Map());
  const [error, setError] = useState(false);
  const [retry, setRetry] = useState(0);
  const [tab, setTab] = useState<RecordsTab>('in');
  const book = tab === 'out' ? 'out' : 'in';
  const [localRecordId, setLocalRecordId] = useState<string>();
  const recordId = routeRecordId ?? localRecordId;
  const [preview, setPreview] = useState<{ recordId: string; file: RecordAttachment; downloadable: boolean }>();
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
  const activePreview = selected && preview?.recordId === selected.id ? preview : undefined;
  const openPreview = selected && ((file: RecordAttachment, downloadable: boolean) =>
    setPreview({ recordId: selected.id, file, downloadable }));

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
    setPreview(undefined);
    setForm(undefined);
    setLocalRecordId(undefined);
    if (onBackToReview) onBackToReview();
    else if (routeRecordId) onSelect();
  }

  const editor = form && (!form.existing || form.existing.id === selected?.id) &&
    <RecordForm key={form.existing?.id} {...form} names={names} email={email} isAdmin={isAdmin}
      onPreview={form.existing ? openPreview : undefined} onCancel={() => setForm(undefined)}
      onSaved={({ id, code, notificationFailed, watchersFailed }) => {
        setForm(undefined);
        if (!form.existing) setLocalRecordId(id);
        const result = code ? `Đã lưu và cấp số ${code}.` : 'Đã lưu hồ sơ.';
        const warning = watchersFailed ? ' Chưa lưu được người theo dõi.'
          : notificationFailed ? ' Chưa gửi được thông báo cho người theo dõi.' : '';
        toast(result + warning, warning ? 'error' : 'success');
      }} />;
  const editing = !!(form?.existing && editor);
  const popupTitle = activePreview ? 'Xem trước tệp' : editing ? form?.action?.label : 'Chi tiết công văn';
  const closeLabel = onBackToReview ? 'Về Phê duyệt' : 'Về sổ văn thư';

  return (
    <View style={styles.stack}>
      <PageHeader title="Văn thư" />
      <View style={styles.panel}>
        <SegmentedButtons label="Sổ văn thư" value={tab} choices={tabChoices}
          onChange={value => { setTab(value); setStatus(''); }} />
        {tab !== 'history' && <>
          {isAdmin && rows && <Button label={book === 'in' ? '+ Vào sổ' : '+ Lập bản nháp'}
            onPress={() => setForm({ direction: book })} />}
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
        </>}
      </View>
      {error ? <View style={styles.panel}>
        <Text accessibilityRole="alert" style={styles.error}>Không tải được sổ văn thư.</Text>
        <Button label="Thử lại" secondary onPress={() => { setError(false); setRetry(value => value + 1); }} />
      </View> : !rows ? (
        <ActivityIndicator accessibilityLabel="Đang tải sổ văn thư" color={colors.accent} />
      ) : tab === 'history' ? (
        <RecordHistory rows={rows} names={names} onSelect={setLocalRecordId} />
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
          <PaginatedList items={filtered} resetKey={JSON.stringify([book, term, status, kind, late, watching, actionOnly])}>
            {pageItems => pageItems.map(row => (
              <Pressable key={row.id} accessibilityRole="button" onPress={() => setLocalRecordId(row.id)}
                style={({ pressed }) => [styles.panel, local.record, pressed && styles.dimmed]}>
                <ClickableCardHeader><Text style={styles.cardTitle}>{row.subject || 'Hồ sơ văn thư'}</Text></ClickableCardHeader>
                <Text style={styles.muted}>{recordNumber(row)}</Text>
                <Text style={styles.muted}>{recordKinds[row.kind ?? 'letter']}</Text>
                <Text style={styles.muted}>
                  <Text style={[styles.label, styles.metadataLabel]}>{row.direction === 'in' ? 'Nơi gửi: ' : 'Nơi nhận: '}</Text>
                  {row.partner || '—'}
                </Text>
                <Text style={styles.muted}>
                  <Text style={[styles.label, styles.metadataLabel]}>Người phụ trách: </Text>
                  {assignee(row)}
                </Text>
                <Text style={styles.badge}>{recordStates[row.status]}</Text>
              </Pressable>
            ))}
          </PaginatedList>
        </>
      )}
      {!form?.existing && editor}
      {!!recordId && <Modal visible transparent animationType="fade" onRequestClose={() => {
        if (activePreview) setPreview(undefined);
        else if (!editing) closeRecord();
      }}>
        <SafeAreaView style={local.backdrop}>
          <View role="dialog" accessibilityViewIsModal accessibilityLabel={popupTitle}
            style={[local.dialog, { backgroundColor: colors.paper },
              (!editing || activePreview) && local.tallDialog]}>
            {activePreview && <RecordAttachmentPreview embedded file={activePreview.file}
              downloadable={activePreview.downloadable} onClose={() => setPreview(undefined)} />}
            <View style={activePreview ? local.hidden : editing ? local.formContainer : local.flex}>
              {!editing && <View style={local.header}>
                <Text accessibilityRole="header" style={[styles.cardTitle, local.flex]}>Chi tiết công văn</Text>
                <PopupCloseButton label={closeLabel} onPress={closeRecord} />
              </View>}
              <ScrollView style={editing ? local.formScroll : local.flex} keyboardShouldPersistTaps="handled"
                contentContainerStyle={local.body}>
                {editing ? editor : selected ? <View style={styles.stack}>
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
                    ['Người theo dõi', selected.watchers?.map(address => names.get(address) || address).join(', ')],
                    ['Ngày văn bản', displayDate(selected.documentOn)],
                    ['Ngày vào sổ', displayDate(selected.registeredOn)],
                    ['Hạn xử lý', displayDate(selected.dueOn)],
                    ['Người ký', selected.signedByName],
                    ['Ngày ký', selected.signedOn ? displayDate(selected.signedOn) : undefined],
                  ].filter(([, value]) => value).map(([label, value]) => (
                    <View key={label} style={[styles.detailRow, local.detailInset]}>
                      <Text style={[styles.label, styles.metadataLabel]}>{label}</Text>
                      <Text selectable style={styles.body}>{value}</Text>
                    </View>
                  ))}
                  <View style={[styles.detailRow, local.detailInset]}>
                    <Text style={styles.label}>Tài liệu đính kèm</Text>
                    {selected.fileId ? <RecordAttachmentButton key={selected.fileId} recordId={selected.id} fileId={selected.fileId}
                      fileName={selected.fileName} onPreview={file => openPreview?.(file, true)} /> : <Text style={styles.muted}>Chưa lưu tệp</Text>}
                  </View>
                  {actions(selected).map(action => <Button key={action.status} label={action.label}
                    secondary={action.status === 'void' || action.status === 'draft'}
                    onPress={() => setForm({ direction: selected.direction, existing: selected, action })} />)}
                </View>
                : rows ? <Text accessibilityRole="alert" style={styles.muted}>Hồ sơ không có trong phạm vi truy cập của bạn.</Text>
                  : error ? <Text accessibilityRole="alert" style={styles.error}>Không tải được hồ sơ.</Text>
                    : <ActivityIndicator accessibilityLabel="Đang tải hồ sơ" color={colors.accent} />}
              </ScrollView>
            </View>
          </View>
        </SafeAreaView>
      </Modal>}
    </View>
  );
}

function RecordHistory({ rows, names, onSelect }: {
  rows: Correspondence[];
  names: Map<string, string>;
  onSelect: (id: string) => void;
}) {
  const styles = useScreenStyles();
  const idsKey = JSON.stringify(rows.map(row => row.id).sort());
  const [byRecord, setByRecord] = useState<Record<string, RecordEvent[] | null>>({});
  useEffect(() => {
    const ids = JSON.parse(idsKey) as string[];
    let active = true;
    setByRecord({});
    const subscriptions = ids.map(id => {
      const update = (events: RecordEvent[] | null) => {
        if (active) setByRecord(current => ({ ...current, [id]: events }));
      };
      return watchRecordEvents(id, update, () => update(null));
    });
    return () => {
      active = false;
      subscriptions.forEach(unsubscribe => unsubscribe());
    };
  }, [idsKey]);

  const loading = rows.some(row => byRecord[row.id] === undefined);
  const error = rows.some(row => byRecord[row.id] === null);
  const entries = rows.flatMap(row => (byRecord[row.id] ?? []).map(event => ({ row, event })));
  entries.sort((a, b) => b.event.at.getTime() - a.event.at.getTime());

  return <View style={styles.stack}>
    {loading && <Text style={styles.muted}>Đang tải lịch sử…</Text>}
    {error && <Text accessibilityRole="alert" style={styles.error}>Không tải được lịch sử của một số hồ sơ.</Text>}
    {!loading && !error && !entries.length && <Text style={styles.muted}>Chưa có lịch sử xử lý.</Text>}
    <PaginatedList items={entries}>
      {pageItems => pageItems.map(({ row, event }) => (
        <Pressable key={JSON.stringify([row.id, event.id])} accessibilityRole="button"
          onPress={() => onSelect(row.id)} style={({ pressed }) => [styles.panel, pressed && styles.dimmed]}>
          <ClickableCardHeader><Text style={styles.muted}>{recordBooks[row.direction]} · {recordNumber(row)}</Text></ClickableCardHeader>
          <Text style={styles.cardTitle}>{row.subject || 'Hồ sơ văn thư'}</Text>
          <Text style={styles.label}>{recordStates[event.to]}</Text>
          <Text style={styles.muted}>{names.get(event.actor) ?? event.actor} · {formatVietnamDateTime(event.at.toISOString())}</Text>
          {!!event.note && <Text style={styles.body}>{event.note}</Text>}
        </Pressable>
      ))}
    </PaginatedList>
  </View>;
}

const local = StyleSheet.create({
  backdrop: { flex: 1, padding: 16, justifyContent: 'center', alignItems: 'center', backgroundColor: '#17102588' },
  dialog: { width: '100%', maxWidth: 560, maxHeight: '92%', borderRadius: 18, overflow: 'hidden' },
  tallDialog: { height: '92%' },
  header: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingTop: 8 },
  body: { padding: 12 },
  detailInset: { marginStart: 8 },
  formContainer: { flexShrink: 1 },
  formScroll: { flexGrow: 0 },
  hidden: { display: 'none' },
  row: { flexDirection: 'row', gap: 8 },
  flex: { flex: 1, minWidth: 0 },
  record: { gap: 7 },
});
