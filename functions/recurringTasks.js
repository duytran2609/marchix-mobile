const { FieldPath } = require('firebase-admin/firestore');
const { createHash } = require('node:crypto');

const timeZone = 'Asia/Ho_Chi_Minh';
const localDay = new Intl.DateTimeFormat('sv-SE', { timeZone });
const cadences = ['Hằng tuần', 'Hằng tháng'];
const dayMs = 86_400_000;
const pageSize = 100;
const maxPeriodsPerRun = 24;

function parseDay(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(value + 'T00:00:00Z');
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value ? date : null;
}

function shiftDay(value, cadence, period) {
  const date = parseDay(value);
  if (!date) return '';
  if (cadence === 'Hằng tuần') {
    date.setUTCDate(date.getUTCDate() + 7 * period);
  } else {
    const day = date.getUTCDate();
    date.setUTCDate(1);
    date.setUTCMonth(date.getUTCMonth() + period);
    const lastDay = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate();
    date.setUTCDate(Math.min(day, lastDay));
  }
  return date.toISOString().slice(0, 10);
}

function elapsedPeriods(anchor, today, cadence) {
  const start = parseDay(anchor);
  const end = parseDay(today);
  if (cadence === 'Hằng tuần') return Math.max(0, Math.floor((end - start) / (7 * dayMs)));
  const months = (end.getUTCFullYear() - start.getUTCFullYear()) * 12 + end.getUTCMonth() - start.getUTCMonth();
  return Math.max(0, months - Number(shiftDay(anchor, cadence, months) > today));
}

function assignmentDay(task) {
  if (parseDay(task.createdAt)) return task.createdAt;
  const assigned = typeof task.createdAt === 'string' ? new Date(task.createdAt) : task.createdAt?.toDate?.();
  return assigned && Number.isFinite(assigned.getTime()) ? localDay.format(assigned) : '';
}

async function materializeSeries(db, ref, today, now) {
  await db.runTransaction(async transaction => {
    const task = (await transaction.get(ref)).data();
    if (!task || !cadences.includes(task.repeat) || (task.seriesId && task.seriesId !== ref.id)) return;
    const anchor = assignmentDay(task);
    if (!anchor || !parseDay(task.due) || !task.assigneeEmail || !task.assignedBy || typeof task.title !== 'string') return;

    const schedule = task.repeatSchedule;
    const tasks = ref.parent;
    // Only an explicit change on the root overrides the latest issued occurrence.
    let lastTaskId = schedule?.sourceCadence === task.repeat && typeof schedule.lastTaskId === 'string'
      ? schedule.lastTaskId : null;
    const latest = lastTaskId ? (await transaction.get(tasks.doc(lastTaskId))).data() : undefined;
    const latestCadence = latest?.seriesId === ref.id ? latest.repeat : null;
    const cadence = latestCadence === 'Không lặp' || cadences.includes(latestCadence) ? latestCadence : task.repeat;
    if (cadence === 'Không lặp') {
      if (schedule?.cadence !== cadence) transaction.update(ref, { 'repeatSchedule.cadence': cadence });
      return;
    }

    const elapsed = elapsedPeriods(anchor, today, cadence);
    // Enroll legacy series without recreating every historical period.
    const previous = schedule?.cadence === cadence && Number.isSafeInteger(schedule.period) && schedule.period >= 0
      ? schedule.period : elapsed - Number(elapsed > 0 && shiftDay(anchor, cadence, elapsed) === today);
    const last = Math.min(elapsed, previous + maxPeriodsPerRun);
    const periods = Array.from({ length: Math.max(0, last - previous) }, (_, index) => previous + index + 1);
    if (!periods.length && schedule?.cadence === cadence && schedule.sourceCadence === task.repeat && task.spawned === true) return;

    const seriesKey = createHash('sha256').update(ref.id).digest('hex');
    const planned = periods.map(period => {
      const day = shiftDay(anchor, cadence, period);
      return { period, day, due: shiftDay(task.due, cadence, period), ref: tasks.doc(`repeat_${seriesKey}_${day}`) };
    });
    const checkLegacy = schedule?.checkLegacy ?? !schedule;
    const existing = checkLegacy && (planned.length || !schedule)
      ? await transaction.get(tasks.where('seriesId', '==', ref.id).select('due', 'recurrenceOn', 'spawned'))
      : null;
    const legacyByDue = new Map(existing?.docs
      .filter(row => row.id !== ref.id && !row.get('recurrenceOn')).map(row => [row.get('due'), row.id]));
    const existingRefs = planned.length ? await transaction.getAll(...planned.map(row => row.ref)) : [];

    planned.forEach(({ period, day, due, ref: occurrence }, index) => {
      lastTaskId = legacyByDue.get(due) ?? occurrence.id;
      if (existingRefs[index].exists || legacyByDue.has(due)) return;
      transaction.create(occurrence, {
        title: task.title, note: task.note ?? '', startDate: shiftDay(task.startDate, cadence, period), due,
        priority: task.priority ?? 'Trung bình', repeat: cadence,
        assignee: task.assignee ?? '', assigneeEmail: task.assigneeEmail, assignedBy: task.assignedBy,
        approverEmail: task.approverEmail ?? '', projectId: task.projectId ?? '', watchers: task.watchers ?? [],
        ...(typeof task.requireReview === 'boolean' && { requireReview: task.requireReview }),
        milestone: task.milestone ?? false, seriesId: ref.id, recurrenceOn: day,
        status: 'Chưa làm', progress: 0, doneAt: '', comments: [],
        checklist: (Array.isArray(task.checklist) ? task.checklist : []).map(item => ({ ...item, done: false })),
        // Older web clients use this flag to bypass completion-based spawning.
        spawned: true, createdAt: now, updatedAt: now, updatedBy: task.assignedBy,
      });
    });
    transaction.update(ref, { spawned: true, repeatSchedule: {
      sourceCadence: task.repeat, cadence, period: last, checkLegacy, lastTaskId,
    } });
    for (const legacy of existing?.docs ?? []) {
      if (legacy.id !== ref.id && !legacy.get('recurrenceOn') && legacy.get('spawned') !== true) {
        transaction.update(legacy.ref, { spawned: true });
      }
    }
  });
}

async function createScheduledTasks(db, date = new Date()) {
  const today = localDay.format(date);
  const candidates = db.collection('tasks').where('repeat', 'in', cadences)
    .orderBy(FieldPath.documentId()).select('seriesId').limit(pageSize);
  let page = await candidates.get();
  while (!page.empty) {
    for (const row of page.docs) {
      if (!row.get('seriesId') || row.get('seriesId') === row.id) {
        await materializeSeries(db, row.ref, today, date.toISOString());
      }
    }
    if (page.size < pageSize) break;
    page = await candidates.startAfter(page.docs.at(-1)).get();
  }
}

module.exports = { cadences, createScheduledTasks, timeZone };
