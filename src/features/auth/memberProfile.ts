import { doc, onSnapshot, writeBatch } from 'firebase/firestore';
import { auth, db } from '../../services/firebase/firebase';

function profileRef(email: string) {
  const user = auth.currentUser;
  return user?.emailVerified && user.email === email ? doc(db, 'memberProfiles', user.uid) : null;
}

export function watchContactEmail(email: string, onChange: (address: string | null) => void, onError: () => void) {
  const profile = profileRef(email);
  if (!profile) {
    onError();
    return;
  }
  return onSnapshot(profile, { includeMetadataChanges: true }, snapshot => {
    if (snapshot.metadata.fromCache || snapshot.metadata.hasPendingWrites) return;
    const address = snapshot.get('contactEmail');
    onChange(typeof address === 'string' ? address : null);
  }, onError);
}

type ProfileDetails = { name: string; contactEmail: string };

export async function saveMemberProfile(email: string, original: ProfileDetails, draft: ProfileDetails) {
  const name = draft.name.trim();
  const contactEmail = draft.contactEmail.trim();
  if (!name || name.length > 250) throw new Error('Tên hiển thị cần có từ 1 đến 250 ký tự.');
  if (contactEmail.length > 254 || !/^[^\s/@]+@[^\s/@]+\.[^\s/@]+$/.test(contactEmail)) {
    throw new Error('Email liên hệ không hợp lệ.');
  }

  const profile = profileRef(email);
  if (!profile) throw new Error('Phiên đăng nhập đã thay đổi.');
  const batch = writeBatch(db);
  if (name !== original.name) batch.update(doc(db, 'members', email), { name });
  if (contactEmail !== original.contactEmail) batch.set(profile, { contactEmail });
  await batch.commit();
}
