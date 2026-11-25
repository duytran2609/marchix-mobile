import { EmptyState } from '../components/EmptyState';
import { PopupAction, PopupBody } from '../components/PopupBody';
import { KeyboardSafeAreaView } from '../components/KeyboardViewport';
import { PaginatedList } from '../components/PaginatedList';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { ClickableCardHeader } from '../components/CardChevron';
import { Button } from '../components/Button';
import { Dropdown } from '../components/Dropdown';
import { PopupHeader } from '../components/PopupHeader';
import { PageHeader } from '../components/PageHeader';
import { SearchInput } from '../components/SearchInput';
import { SegmentedButtons } from '../components/SegmentedButtons';
import { useToast } from '../components/Toast';
import { bookStatuses, recordActions, recordBooks, recordKinds,
  recordNumber, recordSortTime, recordStates, recordSystemCode, watchRecords } from '../features/records/records';
import type { Correspondence, RecordBook, RecordStatus } from '../features/records/records';
import { RecordForm } from '../features/records/RecordForm';
import { AttachmentPreview } from '../components/AttachmentPreview';
import { RecordAttachmentButton } from '../features/records/RecordAttachment';
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

export function RecordsScreen({ email, canManageRecords, recordId: routeRecordId, onSelect, onBackToReview }: {
  email: string;
  canManageRecords: boolean;
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
  const [form, setForm] = useState<{ direction: RecordBook; existing?: Correspondence;
    action?: { status: RecordStatus; label: string } }>();
  const today = todayInVietnam();
  const selected = rows?.find(row => row.id === recordId);
  const activePreview = selected && preview?.recordId === selected.id ? preview : undefined;
  const openPreview = selected && ((file: RecordAttachment, downloadable: boolean) =>
    setPreview({ recordId: selected.id, file, downloadable }));

  useEffect(() => watchRecords(email, canManageRecords, setRows, () => {
    setRows(null);
    setError(true);
  }), [email, canManageRecords, retry]);
  useEffect(() => watchPlanningTeam(team => setNames(new Map(team.map(member => [member.email, member.name]))),
    () => setNames(new Map())), [email]);

  const current = rows?.filter(row => row.direction === book) ?? [];
  const actions = (row: Correspondence) => recordActions(row, email, canManageRecords);
  const assignee = (row: Correspondence) => row.assigneeEmail
    ? names.get(row.assigneeEmail) || row.assigneeEmail : 'Chưa giao';
  const filtered = searchByName(current.filter(row =>
    (!kind || kind === (row.kind || 'letter')) && (!status || status === row.status)), term,
  row => [recordNumber(row), recordSystemCode(row, today), row.externalNumber, row.subject,
    row.partner, assignee(row), row.assigneeEmail].filter(Boolean).join(' '));
  filtered.sort((a, b) => recordSortTime(b, false) - recordSortTime(a, false));

  function closeRecord() {
    setPreview(undefined);
    setForm(undefined);
    setLocalRecordId(undefined);
    if (onBackToReview) onBackToReview();
    else if (routeRecordId) onSelect();
  }

  const editor = form && (!form.existing || form.existing.id === selected?.id) &&
    <RecordForm key={form.existing?.id} {...form} names={names} email={email} isAdmin={canManageRecords}
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
  const detailActions = selected ? actions(selected) : [];
  const popupTitle = activePreview ? 'Xem trước tệp' : editing ? form?.action?.label : 'Chi tiết công văn';
  const closeLabel = onBackToReview ? 'Về Phê duyệt' : 'Về sổ văn thư';

  return (
    <>
      {!onBackToReview && <View style={styles.stack}>
        <PageHeader title="Văn thư" />
        <View style={styles.panel}>
          <SegmentedButtons label="Sổ văn thư" value={tab} choices={tabChoices}
            onChange={value => { setTab(value); setStatus(''); }} />
          {tab !== 'history' && canManageRecords && rows && <Button label={book === 'in' ? '+ Vào sổ' : '+ Lập bản nháp'}
            onPress={() => setForm({ direction: book })} />}
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
                value={term} onChangeText={setTerm} />
              <View style={local.row}>
                <Dropdown label="Loại văn bản" value={kind} choices={kindChoices} onChange={setKind} style={local.flex} />
                <Dropdown label="Trạng thái" value={status} onChange={setStatus} style={local.flex}
                  choices={[{ value: '', label: 'Tất cả' }, ...bookStatuses[book].map(value => ({ value, label: recordStates[value] }))]} />
              </View>
              {!filtered.length && <EmptyState icon={current.length ? 'search' : 'document'} message={current.length
                ? 'Không có văn bản khớp bộ lọc.' : 'Sổ chưa có văn bản.'} announce />}
            </View>
            <PaginatedList items={filtered} resetKey={JSON.stringify([book, term, status, kind])}>
            {pageItems => pageItems.map(row => (
              <Pressable key={row.id} accessibilityRole="button" onPress={() => setLocalRecordId(row.id)}
                style={({ pressed }) => [styles.panel, local.record, pressed && styles.dimmed]}>
                <ClickableCardHeader><Text style={styles.cardTitle}>{row.subject || 'Hồ sơ văn thư'}</Text></ClickableCardHeader>
                <Text style={styles.badge}>{recordStates[row.status]}</Text>
                <Text style={[styles.muted, styles.metadataValue]}>
                  <Text style={[styles.label, styles.metadataLabel]}>Số văn bản: </Text>
                  {recordNumber(row)}
                </Text>
                <Text style={[styles.muted, styles.metadataValue]}>
                  <Text style={[styles.label, styles.metadataLabel]}>Loại văn bản: </Text>
                  {recordKinds[row.kind ?? 'letter']}
                </Text>
                <Text style={[styles.muted, styles.metadataValue]}>
                  <Text style={[styles.label, styles.metadataLabel]}>{row.direction === 'in' ? 'Nơi gửi: ' : 'Nơi nhận: '}</Text>
                  {row.partner || '—'}
                </Text>
                <Text style={[styles.muted, styles.metadataValue]}>
                  <Text style={[styles.label, styles.metadataLabel]}>Người phụ trách: </Text>
                  {assignee(row)}
                </Text>
              </Pressable>
            ))}
            </PaginatedList>
          </>
        )}
        {!form?.existing && editor}
      </View>}
      {!!recordId && <Modal visible transparent animationType="fade" onRequestClose={() => {
        if (activePreview) setPreview(undefined);
        else if (!editing) closeRecord();
      }}>
        <KeyboardSafeAreaView style={local.backdrop}>
          <View role="dialog" accessibilityViewIsModal accessibilityLabel={popupTitle}
            style={[local.dialog, { backgroundColor: colors.paper },
              (!editing || activePreview) && local.tallDialog]}>
            {activePreview && <AttachmentPreview embedded file={activePreview.file}
              downloadable={activePreview.downloadable} onClose={() => setPreview(undefined)} />}
            <View style={activePreview ? local.hidden : editing ? local.formContainer : local.flex}>
              {editing ? editor : <>
              <PopupHeader title="Chi tiết công văn" closeLabel={closeLabel} onClose={closeRecord} />
              <PopupBody style={local.detailScroll} contentContainerStyle={local.body}
                footer={selected && detailActions.length > 0 && detailActions.map(action => (
                  <PopupAction key={action.status} label={action.label}
                    secondary={action.status === 'void' || action.status === 'draft'}
                    onPress={() => setForm({ direction: selected.direction, existing: selected, action })} />
                ))}>
                {selected ? <View style={styles.stack}>
                  <View style={[local.detailInset, local.detailHeading]}>
                    <Text style={styles.badge}>{recordStates[selected.status]}</Text>
                    <Text accessibilityRole="header" style={styles.heading}>{selected.subject || 'Hồ sơ văn thư'}</Text>
                    <Text style={[styles.cardTitle, { color: colors.accent }]}>{recordKinds[selected.kind ?? 'letter']}</Text>
                  </View>
                  {[
                    ['Số văn bản', recordNumber(selected)],
                    ['Mã hồ sơ', recordSystemCode(selected, today)],
                    ['Sổ văn thư', recordBooks[selected.direction]],
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
                      <Text selectable style={[styles.body, styles.metadataValue]}>{value}</Text>
                    </View>
                  ))}
                  <View style={[styles.detailRow, local.detailInset]}>
                    <Text style={styles.label}>Tài liệu đính kèm</Text>
                    {selected.fileId ? <RecordAttachmentButton key={selected.fileId} recordId={selected.id} fileId={selected.fileId}
                      fileName={selected.fileName} onPreview={file => openPreview?.(file, true)} /> : <EmptyState icon="document" message="Chưa lưu tệp" />}
                  </View>
                </View>
                : rows ? <Text accessibilityRole="alert" style={styles.muted}>Hồ sơ không có trong phạm vi truy cập của bạn.</Text>
                  : error ? <Text accessibilityRole="alert" style={styles.error}>Không tải được hồ sơ.</Text>
                    : <ActivityIndicator accessibilityLabel="Đang tải hồ sơ" color={colors.accent} />}
              </PopupBody>
              </>}
            </View>
          </View>
        </KeyboardSafeAreaView>
      </Modal>}
    </>
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
  const history = rows.flatMap(row => {
    const events = byRecord[row.id];
    if (!events?.length) return [];
    return [{ row, events, latestAt: events[0].at.getTime() }];
  });
  history.sort((a, b) => b.latestAt - a.latestAt);

  return <View style={styles.stack}>
    {loading && <Text style={styles.muted}>Đang tải lịch sử…</Text>}
    {error && <Text accessibilityRole="alert" style={styles.error}>Không tải được lịch sử của một số hồ sơ.</Text>}
    {!loading && !error && !history.length && <EmptyState icon="history" message="Chưa có lịch sử xử lý." />}
    <PaginatedList items={history}>
      {pageItems => pageItems.map(({ row, events }) => (
        <Pressable key={row.id} accessibilityRole="button"
          onPress={() => onSelect(row.id)} style={({ pressed }) => [styles.panel, local.record, pressed && styles.dimmed]}>
          <ClickableCardHeader><Text style={styles.cardTitle}>{row.subject || 'Hồ sơ văn thư'}</Text></ClickableCardHeader>
          {[
            ['Sổ văn thư', recordBooks[row.direction]],
            ['Số văn bản', recordNumber(row)],
          ].map(([label, value]) => (
            <Text key={label} style={styles.muted}>
              <Text style={[styles.label, styles.metadataLabel]}>{label}: </Text>
              <Text style={styles.metadataValue}>{value}</Text>
            </Text>
          ))}
          {events.map(event => (
            <View key={event.id} style={styles.detailRow}>
              <Text style={styles.badge}>{recordStates[event.to]}</Text>
              <Text style={styles.muted}>{formatVietnamDateTime(event.at)}</Text>
              {[
                ['Người thực hiện', names.get(event.actor) ?? event.actor],
                ['Ghi chú', event.note],
              ].filter(([, value]) => value).map(([label, value]) => (
                <Text key={label} style={styles.muted}>
                  <Text style={[styles.label, styles.metadataLabel]}>{label}: </Text>
                  <Text style={styles.metadataValue}>{value}</Text>
                </Text>
              ))}
            </View>
          ))}
        </Pressable>
      ))}
    </PaginatedList>
  </View>;
}

const local = StyleSheet.create({
  backdrop: { flex: 1, padding: 16, justifyContent: 'center', alignItems: 'center', backgroundColor: '#17102588' },
  dialog: { width: '100%', maxWidth: 560, maxHeight: '92%', borderRadius: 18, overflow: 'hidden' },
  tallDialog: { height: '92%' },
  body: { padding: 12 },
  detailScroll: { flexGrow: 1, flexBasis: 0 },
  detailInset: { marginStart: 8 },
  detailHeading: { gap: 14 },
  formContainer: { flexShrink: 1 },
  hidden: { display: 'none' },
  row: { flexDirection: 'row', gap: 8 },
  flex: { flex: 1, minWidth: 0 },
  record: { gap: 7 },
});
