import { File, Paths } from 'expo-file-system';
import { isAvailableAsync, shareAsync } from 'expo-sharing';
import { Platform } from 'react-native';
import { cashStatus, categories, displayDate, type Cash } from './cash';

export async function exportCash(month: string, rows: Cash[], projectName: (id: string) => string) {
  const filename = `so-thu-chi-${month || 'all'}.csv`;
  const headers = ['Ngày', 'Loại', 'Nội dung', 'Loại đối tượng', 'Đối tượng', 'Nhóm', 'Hạng mục', 'Dự án',
    'Hình thức', 'Số tiền', 'Trạng thái', 'Hạn thanh toán', 'Người lập', 'Tham chiếu giao dịch', 'Mã dự án', 'Mã hồ sơ', 'Số hóa đơn / báo giá'];
  const lines = rows.map(row => [displayDate(row.date), row.type === 'chi' ? 'Chi' : 'Thu', row.note,
    row.partyType, row.partyName, Object.entries(categories[row.type]).find(([, values]) => values.includes(row.category))?.[0],
    row.category, projectName(row.projectId), row.method, row.amount, cashStatus(row),
    row.dueDate ? displayDate(row.dueDate) : '', row.createdBy, row.ref, row.projectId, row.id, row.invoiceRef]);
  const quote = (value: unknown) => {
    let cell = String(value ?? '');
    if (/^\s*[=+@-]|^[\t\r\n]/.test(cell)) cell = "'" + cell;
    return '"' + cell.replace(/"/g, '""') + '"';
  };
  const csv = '\ufeff' + [headers, ...lines].map(line => line.map(quote).join(',')).join('\r\n');
  const mimeType = 'text/csv';
  if (Platform.OS === 'web') {
    const url = URL.createObjectURL(new Blob([csv], { type: mimeType + ';charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    return;
  }
  if (!await isAvailableAsync()) throw new Error('Thiết bị chưa hỗ trợ chia sẻ tệp.');
  const file = new File(Paths.cache, filename);
  file.create({ overwrite: true });
  try {
    await file.write(csv);
    await shareAsync(file.uri, { mimeType, UTI: 'public.comma-separated-values-text', dialogTitle: 'Lưu sổ thu chi' });
  } finally {
    if (file.exists) file.delete();
  }
}
