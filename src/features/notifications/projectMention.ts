// Pilot shares the web notification schema and its exact '#du-an' link.
// Carry the target in a versioned document ID rather than adding fields or
// changing a link that older web clients reject. Keep the random suffix so
// separate recipients/posts never overwrite each other's notifications.
const pilotPrefix = 'project-mention.v1.';
const validPart = (value: unknown): value is string => typeof value === 'string'
  && value.length > 0 && !/[\/\s]/u.test(value) && value !== '.' && value !== '..';

export function pilotProjectMentionId(projectId: string, randomId: string) {
  if (!validPart(projectId) || !/^[A-Za-z0-9]{20}$/.test(randomId)) {
    throw new Error('Mã dự án hoặc thông báo không hợp lệ.');
  }
  const encoded = encodeURIComponent(projectId);
  if (encoded.length > 1400) throw new Error('Mã dự án quá dài để gửi thông báo.');
  return `${pilotPrefix}${encoded}.${randomId}`;
}

export function notificationProjectId(data: Record<string, unknown>, notificationId: string): string | undefined {
  if (data.kind === 'projectMention' && validPart(data.projectId)) return data.projectId;
  if (data.title !== 'Bạn được nhắc trong dự án' || data.link !== '#du-an'
    || !notificationId.startsWith(pilotPrefix) || notificationId.length > 1500) return undefined;
  const target = notificationId.slice(pilotPrefix.length);
  const separator = target.lastIndexOf('.');
  const encoded = target.slice(0, separator);
  if (separator < 1 || encoded.length > 1400 || !/^[A-Za-z0-9]{20}$/.test(target.slice(separator + 1))) return undefined;
  try {
    const projectId = decodeURIComponent(encoded);
    return validPart(projectId) && encodeURIComponent(projectId) === encoded ? projectId : undefined;
  } catch {
    return undefined;
  }
}
