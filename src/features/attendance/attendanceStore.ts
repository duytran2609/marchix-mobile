import * as Location from 'expo-location';
import { Platform } from 'react-native';
import { addDoc, collection, deleteDoc, deleteField, doc, onSnapshot, query, runTransaction, serverTimestamp, setDoc, updateDoc, where } from 'firebase/firestore';
import { db } from '../../services/firebase/firebase';
import { attendanceId, dateKey, defaultSchedule } from './attendance';
import type { Attendance, Leave, Schedule } from './attendance';

export type AttendanceMember = { email: string; name: string };

export function watchAttendanceNotes(email: string, onData: (notes: ReadonlyMap<string, string>) => void, onError: () => void) {
  return onSnapshot(collection(db, 'members', email, 'attendanceNotes'), snapshot => {
    onData(new Map(snapshot.docs.map(row => [row.id, row.get('text') as string])));
  }, onError);
}

export function saveAttendanceNote(email: string, date: string, text: string) {
  if (dateKey(new Date()) !== date) throw new Error('Ngày đã thay đổi. Hãy nhập ghi chú cho ngày mới.');
  const ref = doc(db, 'members', email, 'attendanceNotes', date);
  return text ? setDoc(ref, { text }) : deleteDoc(ref);
}

export type AttendanceData = {
  schedule: Schedule;
  records: Attendance[];
  requests: Leave[];
  people: AttendanceMember[];
};

export function watchAttendance(email: string, admin: boolean, onData: (data: AttendanceData) => void, onError: () => void) {
  const state: Partial<AttendanceData> = admin ? {} : { people: [] };
  function publish<K extends keyof AttendanceData>(key: K, value: AttendanceData[K]) {
    state[key] = value;
    const { schedule, records, requests, people } = state;
    if (schedule && records && requests && people) onData({ schedule, records, requests, people });
  }

  const attendance = collection(db, 'attendance');
  const requests = collection(db, 'requests');
  const unsubscribe = [
    onSnapshot(doc(db, 'settings', 'work'), snapshot => {
      const settings = snapshot.data() as Partial<Schedule> | undefined;
      publish('schedule', { ...defaultSchedule, ...settings, days: { ...defaultSchedule.days, ...settings?.days } });
    }, onError),
    onSnapshot(admin ? attendance : query(attendance, where('email', '==', email)), snapshot => {
      publish('records', snapshot.docs.map(row => ({ ...row.data({ serverTimestamps: 'estimate' }), id: row.id } as Attendance)));
    }, onError),
    onSnapshot(admin ? requests : query(requests, where('createdBy', '==', email)), snapshot => {
      publish('requests', snapshot.docs.map(row => row.data() as Leave));
    }, onError),
  ];
  if (admin) unsubscribe.push(onSnapshot(collection(db, 'members'), snapshot => {
    publish('people', snapshot.docs.map(row => ({
      email: row.data().email || row.id, name: row.data().name || row.id,
    })).sort((a, b) => a.name.localeCompare(b.name, 'vi')));
  }, onError));
  return () => unsubscribe.forEach(stop => stop());
}

async function officeDistance(schedule: Schedule) {
  if (!schedule.gpsOn) return null;
  const lat = Number(schedule.gpsLat);
  const lng = Number(schedule.gpsLng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180 || (!lat && !lng)) {
    throw new Error('Vị trí văn phòng chưa được cấu hình. Hãy liên hệ quản trị viên.');
  }

  let coords: { latitude: number; longitude: number };
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    if (Platform.OS === 'web') {
      coords = await new Promise<GeolocationCoordinates>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(position => resolve(position.coords), reject,
          { enableHighAccuracy: true, maximumAge: 0, timeout: 12000 });
      });
    } else {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (!permission.granted) throw new Error();
      const location = await Promise.race([
        Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High }),
        new Promise<never>((_, reject) => { timeout = setTimeout(reject, 12000); }),
      ]);
      coords = location.coords;
    }
  } catch {
    throw new Error('Không lấy được vị trí. Hãy bật GPS, cấp quyền vị trí chính xác rồi thử lại.');
  } finally {
    clearTimeout(timeout);
  }
  const radians = Math.PI / 180;
  const arc = Math.sin((coords.latitude - lat) * radians / 2) ** 2 +
    Math.cos(lat * radians) * Math.cos(coords.latitude * radians) * Math.sin((coords.longitude - lng) * radians / 2) ** 2;
  const distance = Math.round(12742000 * Math.asin(Math.sqrt(Math.min(1, arc))));
  const radius = Number(schedule.gpsRadius) || 300;
  if (distance > radius) {
    throw new Error('Bạn cách văn phòng ' + distance + ' m. Bán kính cho phép là ' + radius + ' m.');
  }
  return distance;
}

export async function punch(member: AttendanceMember, date: string, hasRecord: boolean, schedule: Schedule, isAdmin: boolean) {
  const distance = await officeDistance(schedule);
  if (dateKey(new Date()) !== date) throw new Error('Ngày đã thay đổi. Hãy chấm công lại.');
  const ref = doc(db, 'attendance', attendanceId(member.email, date));
  if (hasRecord) {
    await updateDoc(ref, { outTs: serverTimestamp(), outDist: distance });
    return;
  }
  const checkIn = { ...member, date, inTs: serverTimestamp(), inDist: distance };
  if (isAdmin) {
    // Production rules allow administrators to overwrite records, so protect concurrent check-ins.
    await runTransaction(db, async transaction => {
      const existing = await transaction.get(ref);
      if (existing.exists()) throw new Error('Giờ vào đã được ghi nhận. Hãy kiểm tra lại ca hôm nay.');
      transaction.set(ref, checkIn);
    });
  } else {
    await setDoc(ref, checkIn);
  }
}

export async function saveAdjustment(member: AttendanceMember, date: string, editor: string,
  adjustment: { manualIn: string; manualOut: string; manualWork: string; note: string }) {
  const ref = doc(db, 'attendance', attendanceId(member.email, date));
  await setDoc(ref, {
    ...member, date, ...adjustment, editedBy: editor,
    manualWork: adjustment.manualWork === '' ? deleteField() : Number(adjustment.manualWork),
  }, { merge: true });
  if (member.email === editor) return true;
  try {
    await addDoc(collection(db, 'notifications'), {
      to: member.email, from: editor, title: 'Công ngày ' + date.split('-').reverse().join('/') + ' đã được điều chỉnh',
      body: adjustment.note, link: '#cham-cong', createdAt: new Date().toISOString(), read: false, emailed: false,
    });
    return true;
  } catch {
    return false;
  }
}

export function removeAttendance(email: string, date: string) {
  return deleteDoc(doc(db, 'attendance', attendanceId(email, date)));
}
