import { defaultSchedule, workdayWeights } from '../attendance/attendance';
import type { WorkdayWeight } from '../attendance/attendance';

export type AdminSettingsTab = 'members' | 'recurring' | 'work' | 'budget' | 'payroll';
export type FieldValue = string | number | boolean;
export type FieldValues = Record<string, FieldValue>;
type Choice = readonly [string | number, string];
export type Field = {
  key: string;
  label: string;
  initial: FieldValue;
  choices?: readonly Choice[];
  required?: boolean;
  time?: boolean;
  money?: boolean;
  integer?: boolean;
  min?: number;
  max?: number;
};

const categories = {
  'Chi phí cố định': ['Thuê văn phòng / mặt bằng', 'Điện, nước', 'Internet, điện thoại', 'Phần mềm, tên miền, hosting', 'Dịch vụ kế toán, pháp lý', 'Chữ ký số, hóa đơn điện tử', 'Phí ngân hàng', 'Trả góp / khấu hao tài sản'],
  'Chi phí nhân sự': ['Lương', 'Thưởng, phụ cấp', 'BHXH, BHYT, BHTN', 'Kinh phí công đoàn', 'Phúc lợi, đào tạo', 'Tạm ứng nhân viên'],
  'Chi phí hoạt động': ['Văn phòng phẩm, vật tư', 'Marketing, quảng cáo', 'Công tác phí, đi lại, xăng xe', 'Tiếp khách', 'Sửa chữa, bảo trì', 'Mua hàng, nguyên vật liệu', 'Thuê ngoài, nhà thầu phụ'],
  'Thuế, phí nhà nước': ['Thuế GTGT', 'Thuế TNDN', 'Thuế TNCN nộp thay', 'Lệ phí môn bài', 'Phí, lệ phí khác', 'Tiền phạt, chậm nộp'],
  'Tài chính & khác': ['Trả nợ nhà cung cấp', 'Trả nợ vay, lãi vay', 'Chi khác'],
};
const partyTypes = ['Nhà cung cấp', 'Khách hàng', 'Nhân viên', 'Cơ quan nhà nước', 'Ngân hàng / tổ chức tín dụng', 'Chủ sở hữu', 'Khác'];
const choices = (values: string[]): Choice[] => values.map(value => [value, value]);
const money = (key: string, label: string, initial = 0): Field => ({ key, label, initial, min: 0, integer: true, money: true });
const percent = (key: string, label: string, initial: number): Field => ({ key, label, initial, min: 0, max: 100 });

export const grants = {
  taskReview: 'Duyệt công việc',
  requestReview: 'Duyệt đơn từ',
  cashReview: 'Duyệt thu chi',
  cashRecord: 'Xác nhận thu/chi thực tế',
  projectManage: 'Tạo và chỉnh sửa hồ sơ dự án',
  weekPlanRead: 'Xem kế hoạch tuần của nhóm',
  kpiRead: 'Xem KPI của nhóm',
  recordManage: 'Quản lý văn thư',
};

export const memberFields: Field[] = [
  { key: 'name', label: 'Tên hiển thị', initial: '', required: true },
  { key: 'email', label: 'Email', initial: '', required: true },
  { key: 'role', label: 'Vai trò', initial: 'staff', choices: [['staff', 'Nhân viên'], ['admin', 'Quản trị']] },
  { key: 'enabled', label: 'Cho phép truy cập Marchix', initial: true },
  ...Object.entries(grants).map(([key, label]) => ({ key, label, initial: false })),
];

export const recurringFields: Field[] = [
  { key: 'name', label: 'Tên khoản chi', initial: '', required: true },
  { key: 'category', label: 'Hạng mục', initial: categories['Chi phí cố định'][0], choices: choices(Object.values(categories).flat()) },
  { ...money('amount', 'Số tiền / tháng'), min: 1 },
  { key: 'partyType', label: 'Loại đối tượng', initial: partyTypes[0], choices: choices(partyTypes) },
  { key: 'partyName', label: 'Tên đối tượng', initial: '' },
  { key: 'day', label: 'Ngày chi trong tháng', initial: 5, min: 1, max: 28, integer: true },
  { key: 'projectId', label: 'Dự án', initial: '' },
  { key: 'active', label: 'Đang áp dụng', initial: true },
];

export const workdayLabels: Record<WorkdayWeight, string> = { 1: 'Cả ngày', 0.5: 'Nửa ngày', 0: 'Nghỉ' };
export const workdayChoices = workdayWeights.map(value => ({ value, label: workdayLabels[value] }));
const dayChoices = workdayChoices.map(({ value, label }): Choice => [value, label]);
export const shiftFields: [Field, Field] = [
  { key: 'shiftIn', label: 'Giờ vào ca', initial: defaultSchedule.shiftIn, time: true, required: true },
  { key: 'shiftOut', label: 'Giờ ra ca', initial: defaultSchedule.shiftOut, time: true, required: true },
];
export const lunchFields: [Field, Field] = [
  { key: 'lunchFrom', label: 'Nghỉ trưa từ', initial: defaultSchedule.lunchFrom, time: true },
  { key: 'lunchTo', label: 'Nghỉ trưa đến', initial: defaultSchedule.lunchTo, time: true },
];
export const officeLocationFields = [
  { key: 'gpsLng', label: 'Kinh độ', initial: 0, min: -180, max: 180 },
  { key: 'gpsLat', label: 'Vĩ độ', initial: 0, min: -90, max: 90 },
  { key: 'gpsRadius', label: 'Bán kính cho phép (m)', initial: 300, min: 50, integer: true },
] satisfies Field[];
export const attendanceReminderFields: [Field, Field] = [
  { key: 'remindIn', label: 'Nhắc quên chấm vào lúc', initial: '08:30', time: true },
  { key: 'remindOut', label: 'Nhắc quên chấm ra lúc', initial: '17:45', time: true },
];
export const workFields: Field[] = [
  ...shiftFields,
  { key: 'grace', label: 'Phút đi muộn cho phép', initial: defaultSchedule.grace, integer: true, min: 0 },
  ...lunchFields,
  ...[1, 2, 3, 4, 5, 6, 0].map(day => ({
    key: `day${day}`, label: day === 0 ? 'Chủ nhật' : `Thứ ${day + 1}`, initial: defaultSchedule.days[day],
    choices: dayChoices,
  })),
  ...attendanceReminderFields,
  { key: 'gpsOn', label: 'Chỉ cho chấm công tại văn phòng (GPS)', initial: false },
  ...officeLocationFields,
  { key: 'emailOn', label: 'Bật nhắc qua email theo lịch', initial: true },
  { key: 'autoStart', label: 'Tự chuyển việc sang “Đang làm” khi đến ngày bắt đầu', initial: true },
  { key: 'requireReview', label: 'Yêu cầu người giao duyệt và đánh giá khi báo xong', initial: true },
  { key: 'requireReportNote', label: 'Yêu cầu ghi kết quả hoặc đính kèm tệp khi báo hoàn thành', initial: false },
];

export const budgetFields = Object.keys(categories).map(label => money(label, label));
export const payrollFields: Field[] = [
  money('soDuDau', 'Số dư tiền đầu kỳ'),
  money('luongCoSo', 'Lương cơ sở', 2340000),
  money('lttVung', 'Lương tối thiểu vùng (vùng I)', 5310000),
  money('giamTruBanThan', 'Giảm trừ bản thân / tháng', 15500000),
  money('giamTruPhuThuoc', 'Giảm trừ mỗi người phụ thuộc', 6200000),
  { key: 'ngayCongChuan', label: 'Ngày công chuẩn', initial: 26, min: 1, max: 31 },
  percent('nldBHXH', 'NLĐ đóng BHXH (%)', 8),
  percent('nldBHYT', 'NLĐ đóng BHYT (%)', 1.5),
  percent('nldBHTN', 'NLĐ đóng BHTN (%)', 1),
  percent('dnBHXH', 'Công ty đóng BHXH (%)', 17),
  percent('dnTNLD', 'Công ty đóng TNLĐ-BNN (%)', 0.5),
  percent('dnBHYT', 'Công ty đóng BHYT (%)', 3),
  percent('dnBHTN', 'Công ty đóng BHTN (%)', 1),
  percent('dnKPCD', 'Kinh phí công đoàn (%)', 2),
];

export function readFields(fields: Field[], data: Record<string, unknown>) {
  return Object.fromEntries(fields.map(field => {
    const value = data[field.key];
    return [field.key, typeof value === typeof field.initial ? value as FieldValue : field.initial];
  }));
}

export function validateFields(fields: Field[], draft: FieldValues): FieldValues {
  return Object.fromEntries(fields.map(field => {
    const raw = draft[field.key];
    const value = typeof raw === 'string' ? raw.trim() : raw;
    if (typeof field.initial === 'number') {
      const number = typeof value === 'string' ? Number(value.replace(',', '.')) : Number(value);
      if (value === '' || !Number.isFinite(number) || (field.integer && !Number.isSafeInteger(number)) ||
        number < (field.min ?? -Infinity) || number > (field.max ?? Infinity)) {
        throw new Error(`Giá trị “${field.label}” không hợp lệ.`);
      }
      return [field.key, number];
    }
    if ((field.required && !value) || (field.time && value && !/^([01]\d|2[0-3]):[0-5]\d$/.test(String(value))) ||
      (typeof value === 'string' && value.length > 250)) throw new Error(`Kiểm tra lại “${field.label}”.`);
    return [field.key, value];
  }));
}
