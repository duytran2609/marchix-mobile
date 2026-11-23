import { collection, doc, getDocFromServer, onSnapshot, runTransaction, serverTimestamp, writeBatch } from 'firebase/firestore';
import { db } from '../../services/firebase/firebase';
import { hasPdfHeader } from '../../utils/attachmentFile';
import { prepareCashFiles, readScopedFileBytes, writeScopedFiles } from '../cash/cashAttachments';
import { todayInVietnam } from '../tasks/taskDates';
import type { PickedAttachment } from '../tasks/taskAttachments';
import { recordActions } from './records';
import type { Correspondence, RecordBook, RecordStatus, recordKinds } from './records';

export type RecordDraft = {
  kind: keyof typeof recordKinds;
  subject: string;
  partner: string;
  assigneeEmail: string;
  documentOn: string;
  externalNumber: string;
  dueOn: string;
  priority: 'normal' | 'urgent';
};

type RecordSave = {
  email: string;
  isAdmin: boolean;
  direction: RecordBook;
  draft?: RecordDraft;
  existing?: Correspondence;
  target?: RecordStatus;
  signedByName: string;
  signedOn: string;
  confirmed: boolean;
  note: string;
  assigneeEmail: string;
  watchers: string[];
  attachment?: PickedAttachment;
};

export type RecordEvent = { id: string; actor: string; at: Date; from: RecordStatus | ''; to: RecordStatus; note: string };

export function watchRecordEvents(id: string, onEvents: (events: RecordEvent[]) => void, onError: () => void) {
  return onSnapshot(collection(db, 'correspondence', id, 'events'), { includeMetadataChanges: true }, snapshot => {
    if (snapshot.metadata.fromCache) return;
    onEvents(snapshot.docs.flatMap(entry => {
      const data = entry.data();
      const at = data.at?.toDate?.();
      return at ? [{ id: entry.id, actor: data.actor, from: data.from, to: data.to, note: data.note, at }] : [];
    }).sort((a, b) => b.at.getTime() - a.at.getTime()));
  }, onError);
}

export async function readRecordAttachment(recordId: string, fileId: string) {
  const recordRef = doc(db, 'correspondence', recordId);
  const fileRef = doc(db, 'files', fileId);
  const [record, snapshot] = await Promise.all([getDocFromServer(recordRef), getDocFromServer(fileRef)]);
  const meta = snapshot.data();
  if (record.data()?.fileId !== fileId || !meta || meta.parent !== recordRef.path ||
    meta.scopeType !== 'correspondence' || meta.scopeId !== recordId) {
    throw new Error('Tệp không còn thuộc hồ sơ này hoặc thông tin tệp không hợp lệ.');
  }
  const bytes = await readScopedFileBytes(fileRef, meta.size, meta.chunks, meta.sha256);
  const type = typeof meta.type === 'string' ? meta.type : 'application/octet-stream';
  if (type === 'application/pdf' && !hasPdfHeader(bytes)) throw new Error('Tệp PDF không hợp lệ.');
  return { bytes, type, name: typeof meta.name === 'string' ? meta.name : 'Tệp đính kèm' };
}

export function recordingSignature(existing?: Correspondence, target?: RecordStatus) {
  return Boolean(existing && !existing.signedByName &&
    (existing.status === 'signing' && target === 'numbered' || existing.status === 'numbered' && target === 'signed'));
}

function validDate(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) &&
    new Date(value).toISOString().slice(0, 10) === value;
}

export async function saveRecord(input: RecordSave) {
  const { email, isAdmin, direction, draft, existing, target, attachment } = input;
  const watchers = [...new Set(input.watchers)];
  if (watchers.length > 5) throw new Error('Chọn tối đa 5 người theo dõi.');
  const today = todayInVietnam();
  const year = today.slice(0, 4);
  const incoming = direction === 'in';
  const signing = recordingSignature(existing, target);
  const issuing = target === 'issued';
  const assignee = (draft?.assigneeEmail ?? input.assigneeEmail).trim();
  const status = existing ? target : incoming ? (assignee ? 'assigned' : 'registered') : 'draft';
  if (!status || (existing ? !recordActions(existing, email, isAdmin).some(action => action.status === status)
    : !isAdmin || !draft)) throw new Error('Bạn không có quyền thực hiện bước này.');
  if (draft && (!draft.subject.trim() || !draft.partner.trim())) throw new Error('Nhập trích yếu và đơn vị giao dịch.');
  if (draft && [draft.documentOn, draft.dueOn].some(date => date && !validDate(date))) {
    throw new Error('Ngày phải hợp lệ và có dạng YYYY-MM-DD.');
  }
  if (incoming && status === 'assigned' && !assignee) throw new Error('Chọn người xử lý.');
  const signedByName = input.signedByName.trim();
  if (signing && (!signedByName || !validDate(input.signedOn) || input.signedOn > today)) {
    throw new Error('Nhập tên người ký và ngày ký hợp lệ.');
  }
  if ((signing || issuing) && (!input.confirmed || (!attachment && !existing?.fileId))) {
    throw new Error('Cần có bản PDF và xác nhận đã kiểm tra tệp.');
  }
  if (target === 'numbered' && !signing && (!existing?.signedByName || !existing.fileId)) {
    throw new Error('Cần hồ sơ có người ký và PDF đã ký để cấp số.');
  }
  const actionLabel = existing && recordActions(existing, email, isAdmin).find(action => action.status === status)?.label;
  const evidence = input.note.trim();
  if ((issuing || target === 'void') && evidence.length < 10) {
    throw new Error(issuing ? 'Ghi nơi nhận, thời điểm, kênh gửi và bằng chứng phát hành.' : 'Ghi lý do hủy số, ít nhất 10 ký tự.');
  }
  const note = evidence || actionLabel || (incoming ? 'Tiếp nhận văn bản, tự cấp số đến.' : 'Lập bản nháp văn bản đi.');
  const needsPdf = signing || issuing || target === 'numbered';
  if (needsPdf && !attachment && existing?.fileId) {
    const stored = await readRecordAttachment(existing.id, existing.fileId);
    if (stored.type !== 'application/pdf') throw new Error('Chọn bản PDF để thực hiện bước này.');
  }
  const files = attachment ? await prepareCashFiles([existing ? { ...attachment, type: 'application/pdf' } : attachment]) : [];
  if (files[0]?.file.type === 'application/pdf' && !hasPdfHeader(files[0].bytes)) {
    throw new Error('Chọn tệp PDF hợp lệ, tối đa 5 MB.');
  }
  const kind = existing?.kind || draft?.kind || 'letter';
  const series = incoming ? 'in' : kind;
  const allocating = !existing && incoming || target === 'numbered';
  const counter = allocating ? doc(db, 'recordCounters', `${series}-${year}`) : undefined;
  const records = collection(db, 'correspondence');
  const draftId = existing?.id ?? doc(records).id;
  const occupied = new Error('Số kế tiếp đã có hồ sơ. Cần đối soát sổ trước khi cấp số.');
  let lastRead = 0;

  const commit = () => runTransaction(db, async tx => {
    lastRead = counter ? (await tx.get(counter)).data()?.last ?? 0 : 0;
    const seq = lastRead + 1;
    if (counter && (!Number.isInteger(lastRead) || lastRead < 0 || seq > 999999)) throw new Error('Dãy số năm này không hợp lệ hoặc đã đầy.');
    const id = !existing && incoming ? `in-${year}-${seq}` : draftId;
    const ref = doc(records, id);
    const snapshot = await tx.get(ref);
    const latest = snapshot.data();
    if (!existing && snapshot.exists()) throw occupied;
    if (existing && (!latest || latest.lastEventId !== existing.lastEventId || latest.status !== existing.status)) {
      throw new Error('Hồ sơ đã thay đổi. Đóng biểu mẫu rồi mở lại để cập nhật.');
    }
    const event = doc(collection(ref, 'events'));
    const data = {
      ...(draft ? { ...draft, subject: draft.subject.trim(), partner: draft.partner.trim(), assigneeEmail: assignee,
        externalNumber: incoming ? draft.externalNumber.trim() : '', documentOn: incoming ? draft.documentOn : '' } : {}),
      ...(!existing ? { direction, kind, year, serial: incoming ? String(seq) : '', registeredOn: today,
        createdBy: email, createdAt: serverTimestamp(), fileId: '', fileName: '', watchers: [] } : {}),
      ...(existing?.status === 'registered' ? { assigneeEmail: assignee } : {}),
      ...(signing ? { signedByName, signedOn: input.signedOn } : {}),
      status, updatedBy: email, updatedAt: serverTimestamp(), lastEventId: event.id,
    };
    const code = counter ? String(seq).padStart(2, '0') +
      (incoming ? '/' + year : kind === 'decision' ? '/QĐ-MARCHIX' : '/MARCHIX-VP') : '';
    if (counter) {
      tx.set(counter, { last: seq, recordId: id, updatedAt: serverTimestamp() });
      Object.assign(data, { numbering: { year: Number(year), seq, at: serverTimestamp() },
        ...(!incoming ? { externalNumber: code, documentOn: today } : {}) });
    }
    if (attachment) {
      const [file] = writeScopedFiles(tx, ref, 'correspondence', files, email, new Date().toISOString());
      Object.assign(data, { fileId: file.id, fileName: file.name });
    }
    if (existing) tx.update(ref, data);
    else tx.set(ref, data);
    const audit = [note.slice(0, 350)];
    if ((signing || issuing) && existing?.fileId) audit.push('PDF trước cập nhật: ' + existing.fileId + '.');
    if (attachment) audit.push('Đã lưu tệp: ' + attachment.name);
    tx.set(event, { actor: email, at: serverTimestamp(), from: existing?.status ?? '', to: status, note: audit.join(' ').slice(0, 500) });
    return { id, code, eventId: event.id, watchers: (latest?.watchers ?? []) as string[] };
  });
  let saved: Awaited<ReturnType<typeof commit>>;
  for (let attempt = 0; ; attempt++) {
    try { saved = await commit(); break; }
    catch (error) {
      const denied = error && typeof error === 'object' && 'code' in error && error.code === 'permission-denied';
      if (!counter || attempt >= 4 || (!denied && error !== occupied) ||
        ((await getDocFromServer(counter)).data()?.last ?? 0) === lastRead) throw error;
    }
  }
  let watchersFailed = false;
  if (!existing && watchers.length) {
    try {
      const ref = doc(records, saved.id);
      const event = doc(collection(ref, 'events'));
      await runTransaction(db, async tx => {
        const row = (await tx.get(ref)).data();
        if (!row || row.lastEventId !== saved.eventId) throw new Error('Hồ sơ vừa được cập nhật.');
        tx.update(ref, { watchers, updatedBy: email, updatedAt: serverTimestamp(), lastEventId: event.id });
        tx.set(event, { actor: email, at: serverTimestamp(), from: row.status, to: row.status,
          note: 'Cập nhật danh sách người theo dõi.' });
      });
      saved = { ...saved, eventId: event.id, watchers };
    } catch { watchersFailed = true; }
  }
  const recipients = [...new Set(saved.watchers)].filter(to => to !== email);
  let notificationFailed = false;
  if (recipients.length) {
    try {
      const batch = writeBatch(db);
      const createdAt = new Date().toISOString();
      for (const to of recipients) batch.set(doc(db, 'notifications', saved.eventId + '_' + to), {
        to, from: email, title: 'Văn thư có cập nhật', body: 'Mở hồ sơ để xem chi tiết.',
        link: '#van-thu/' + saved.id, createdAt, read: false, emailed: false,
        kind: 'record', recordId: saved.id, eventId: saved.eventId,
      });
      await batch.commit();
    } catch { notificationFailed = true; }
  }
  return { ...saved, notificationFailed, watchersFailed };
}
