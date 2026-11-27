import { Bytes } from 'firebase/firestore';

const imageTypes = new Set(['image/jpeg', 'image/png', 'image/gif', 'image/webp']);

export function canPreviewImage(type: string) {
  return imageTypes.has(type);
}

export function attachmentImageUri(bytes: Uint8Array, type: string) {
  return canPreviewImage(type) ? `data:${type};base64,${Bytes.fromUint8Array(bytes).toBase64()}` : '';
}
