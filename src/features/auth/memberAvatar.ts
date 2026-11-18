import { Bytes, doc, onSnapshot, setDoc } from 'firebase/firestore';
import { db } from '../../services/firebase/firebase';
import { pickTaskAttachments } from '../tasks/taskAttachments';

const imageTypes = ['image/jpeg', 'image/png', 'image/webp'];
const maxBytes = 768 * 1024;
const avatarRef = (email: string) => doc(db, 'memberAvatars', email);

export function watchMemberAvatar(email: string, onChange: (uri: string | null) => void) {
  return onSnapshot(avatarRef(email), { includeMetadataChanges: true }, snapshot => {
    if (snapshot.metadata.hasPendingWrites) return;
    const data = snapshot.data();
    onChange(data && imageTypes.includes(data.type) && data.image instanceof Bytes
      ? `data:${data.type};base64,${data.image.toBase64()}`
      : null);
  }, () => onChange(null));
}

export async function pickMemberAvatar(email: string) {
  const [file] = await pickTaskAttachments({ multiple: false, type: imageTypes });
  if (!file) return false;
  if (!imageTypes.includes(file.type)) throw new Error('Hãy chọn ảnh JPG, PNG hoặc WebP.');
  if (file.size <= 0 || file.size > maxBytes) throw new Error('Hãy chọn ảnh có dung lượng tối đa 768 KB.');

  const image = Bytes.fromBase64String(await file.read());
  const bytes = image.toUint8Array();
  if (!bytes.length || bytes.length > maxBytes) throw new Error('Hãy chọn ảnh có dung lượng tối đa 768 KB.');
  const jpeg = bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  const png = [137, 80, 78, 71, 13, 10, 26, 10].every((byte, index) => bytes[index] === byte);
  const webp = String.fromCharCode(...bytes.subarray(0, 4)) === 'RIFF' &&
    String.fromCharCode(...bytes.subarray(8, 12)) === 'WEBP';
  if (!(file.type === 'image/jpeg' && jpeg || file.type === 'image/png' && png || file.type === 'image/webp' && webp)) {
    throw new Error('Tệp đã chọn không đọc được dưới dạng ảnh JPG, PNG hoặc WebP.');
  }
  await setDoc(avatarRef(email), { type: file.type, image });
  return true;
}
