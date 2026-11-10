const project = 'demo-marchix-mobile';
const documents = `projects/${project}/databases/(default)/documents`;
const staff = 'nhanvien@example.test';
const colleague = 'dongnghiep@example.test';
const reviewer = 'nguoigiao@example.test';

const fixtures = {
  [`members/${staff}`]: { name: 'Nhân viên demo', email: staff, role: 'staff' },
  [`members/${colleague}`]: { name: 'Đồng nghiệp demo', email: colleague, role: 'staff' },
  [`members/${reviewer}`]: { name: 'Người giao việc demo', email: reviewer, role: 'staff' },
  'tasks/kiem-tra-giao-dien': {
    title: 'Kiểm tra giao diện trên điện thoại', assignee: 'Nhân viên demo', assigneeEmail: staff, assignedBy: reviewer,
    status: 'Đang làm', progress: 25, priority: 'Cao', due: '2026-11-16',
    note: 'Kiểm tra luồng đăng nhập và ghi lại kết quả trên hai kích cỡ màn hình.',
  },
  'tasks/cap-nhat-huong-dan': {
    title: 'Cập nhật hướng dẫn bàn giao', assignee: 'Nhân viên demo', assigneeEmail: staff, assignedBy: reviewer,
    status: 'Chưa làm', progress: 0, priority: 'Thấp', due: '2026-11-19',
  },
  'tasks/kiem-tra-checklist': {
    title: 'Đối chiếu checklist phát hành', assigneeEmail: staff, assignedBy: reviewer, status: 'Đang làm', progress: 50,
    checklist: [{ text: 'Kiểm tra bản thử', done: true }, { text: 'Gửi kết quả', done: false }],
  },
  'tasks/da-duyet': {
    title: 'Xác nhận phạm vi bản thử', assigneeEmail: staff, status: 'Xong', progress: 100,
    doneAt: '2026-11-09T08:00:00.000Z',
    rating: 'Tốt', reviewNote: 'Đã xác nhận đủ các luồng cần kiểm thử.',
  },
  'tasks/viec-nguoi-khac': {
    title: 'Việc riêng của đồng nghiệp', assigneeEmail: colleague, status: 'Đang làm', progress: 30,
  },
  'tasks/cho-duyet-demo': {
    title: 'Rà soát tài liệu hướng dẫn', assignee: 'Nhân viên demo', assigneeEmail: staff, assignedBy: reviewer,
    status: 'Chờ duyệt', progress: 100, doneAt: '2026-11-10T03:00:00.000Z',
    comments: [{ by: staff, at: '2026-11-10T03:00:00.000Z', text: 'Đã rà soát nội dung hướng dẫn.', files: [] }],
  },
  'notifications/demo-viec-moi': {
    to: staff, from: reviewer, title: 'Bạn được giao việc mới', body: 'Cập nhật hướng dẫn bàn giao',
    taskId: 'cap-nhat-huong-dan', link: '#cong-viec', createdAt: '2026-11-10T02:00:00.000Z', read: false, emailed: false,
  },
  'notifications/demo-nhac-viec': {
    to: staff, from: reviewer, title: 'Nhắc việc', body: 'Kiểm tra giao diện trên điện thoại',
    taskId: 'kiem-tra-giao-dien', link: '#cong-viec', createdAt: '2026-11-09T08:00:00.000Z', read: true, emailed: false,
  },
  'notifications/demo-cho-duyet': {
    to: reviewer, from: staff, title: 'Có việc chờ duyệt', body: 'Rà soát tài liệu hướng dẫn',
    taskId: 'cho-duyet-demo', link: '#cho-duyet', createdAt: '2026-11-10T03:00:00.000Z', read: false, emailed: false,
  },
};

function encode(value) {
  if (typeof value === 'string') return { stringValue: value };
  if (typeof value === 'number') return { integerValue: String(value) };
  if (typeof value === 'boolean') return { booleanValue: value };
  if (Array.isArray(value)) return { arrayValue: { values: value.map(encode) } };
  return { mapValue: { fields: fields(value) } };
}

function fields(record) {
  return Object.fromEntries(Object.entries(record).map(([key, value]) => [key, encode(value)]));
}

const response = await fetch(`http://127.0.0.1:8080/v1/${documents}:commit`, {
  method: 'POST',
  headers: { Authorization: 'Bearer owner', 'Content-Type': 'application/json' },
  body: JSON.stringify({
    writes: Object.entries(fixtures).map(([path, record]) => ({
      update: { name: `${documents}/${path}`, fields: fields(record) },
    })),
  }),
});

if (!response.ok) throw new Error(`Không nạp được dữ liệu vào Firestore Emulator: ${await response.text()}`);
console.log('Đã nạp 3 thành viên giả, 6 công việc và 3 thông báo vào Firestore Emulator.');
