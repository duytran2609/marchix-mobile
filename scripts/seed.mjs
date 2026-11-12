const project = 'demo-marchix-mobile';
const documents = `projects/${project}/databases/(default)/documents`;
const staff = 'nhanvien@example.test';
const colleague = 'dongnghiep@example.test';
const reviewer = 'nguoigiao@example.test';
const recordsCreatedAt = new Date('2025-11-10T02:00:00Z');
const recordDefaults = {
  year: '2025', registeredOn: '2025-11-10', documentOn: '', externalNumber: '', dueOn: '',
  priority: 'normal', fileId: '', fileName: '', lastEventId: 'recordDemoInitial000',
  createdBy: 'quantri@example.test', updatedBy: 'quantri@example.test',
  createdAt: recordsCreatedAt, updatedAt: recordsCreatedAt,
};

const fixtures = {
  [`members/${staff}`]: { name: 'Nhân viên demo', email: staff, role: 'staff' },
  [`members/${colleague}`]: { name: 'Đồng nghiệp demo', email: colleague, role: 'staff' },
  [`members/${reviewer}`]: { name: 'Người giao việc demo', email: reviewer, role: 'staff', grants: ['requestReview', 'cashReview'] },
  'members/quantri@example.test': { name: 'Quản trị demo', email: 'quantri@example.test', role: 'admin' },
  'correspondence/in-2025-1': {
    ...recordDefaults, direction: 'in', status: 'assigned', kind: 'letter', serial: '1',
    subject: 'Công văn xác nhận lịch bàn giao', partner: 'Đối tác demo', assigneeEmail: staff,
    watchers: [], dueOn: '2026-11-20',
  },
  'correspondence/recordDemoDecision01': {
    ...recordDefaults, direction: 'out', status: 'draft', kind: 'decision', serial: '',
    subject: 'Quyết định phân công phụ trách dự án', partner: 'Nhóm dự án demo',
    assigneeEmail: reviewer, watchers: [staff],
  },
  'correspondence/in-2025-2': {
    ...recordDefaults, direction: 'in', status: 'assigned', kind: 'letter', serial: '2',
    subject: 'Công văn dành riêng cho bộ phận vận hành', partner: 'Bộ phận vận hành',
    assigneeEmail: colleague, watchers: [],
  },
  'employees/nhanvien-luong-demo': {
    name: 'Nhân viên lương demo', email: staff, position: 'Kiểm thử', contract: 'Thử việc',
    status: 'Đang làm', salary: 10000000, insSalary: 0,
  },
  'payroll/2026-10_nhanvien-luong-demo': {
    month: '2026-10', empId: 'nhanvien-luong-demo', name: 'Nhân viên lương demo', email: staff, status: 'Đã trả',
    workDays: 24, standardDays: 26, gross: 10000000, insEmp: 600000, pit: 0, advance: 200000, deduction: 100000, net: 9100000,
  },
  'payroll/2026-09_nhanvien-luong-demo': {
    month: '2026-09', empId: 'nhanvien-luong-demo', name: 'Nhân viên lương demo', email: staff, status: 'Nháp',
  },
  'payroll/2026-08_dongnghiep-luong-demo': {
    month: '2026-08', empId: 'dongnghiep-luong-demo', name: 'Đồng nghiệp demo', email: colleague, status: 'Đã chốt',
  },
  'projects/marchix-mobile-demo': {
    name: 'Marchix Mobile · Demo', owner: 'Người giao việc demo', ownerEmail: reviewer,
    status: 'Đang chạy', budget: 5000000, startDate: '2026-11-10', deadline: '2026-11-30',
    goal: 'Bàn giao bản thử trên điện thoại.', phase: 'Kiểm thử nội bộ',
    risks: 'Xác nhận luồng đăng nhập trên thiết bị thật.', note: 'Dữ liệu thử nghiệm.',
  },
  'tasks/kiem-tra-giao-dien': {
    title: 'Kiểm tra giao diện trên điện thoại', assignee: 'Nhân viên demo', assigneeEmail: staff, assignedBy: reviewer,
    status: 'Đang làm', progress: 25, priority: 'Cao', due: '2026-11-16',
    projectId: 'marchix-mobile-demo', milestone: true,
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
    projectId: 'marchix-mobile-demo',
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
  if (value instanceof Date) return { timestampValue: value.toISOString() };
  if (typeof value === 'string') return { stringValue: value };
  if (typeof value === 'number') return { integerValue: String(value) };
  if (typeof value === 'boolean') return { booleanValue: value };
  if (Array.isArray(value)) return { arrayValue: { values: value.map(encode) } };
  return { mapValue: { fields: fields(value) } };
}

function fields(record) {
  return Object.fromEntries(Object.entries(record).map(([key, value]) => [key, encode(value)]));
}

const emulatorHost = process.env.EXPO_PUBLIC_EMULATOR_HOST || '127.0.0.1';
const response = await fetch(`http://${emulatorHost}:${process.env.EXPO_PUBLIC_FIRESTORE_EMULATOR_PORT || 8080}/v1/${documents}:commit`, {
  method: 'POST',
  headers: { Authorization: 'Bearer owner', 'Content-Type': 'application/json' },
  body: JSON.stringify({
    writes: Object.entries(fixtures).map(([path, record]) => ({
      update: { name: `${documents}/${path}`, fields: fields(record) },
    })),
  }),
});

if (!response.ok) throw new Error(`Không nạp được dữ liệu vào Firestore Emulator: ${await response.text()}`);
console.log('Đã nạp 4 thành viên giả, 1 dự án, 6 công việc, 3 thông báo và dữ liệu phiếu lương mẫu vào Firestore Emulator.');
