import { CFB, utils, write } from 'xlsx';
import { saveExcel } from '../../utils/saveExcel';
import { payrollCells, payrollHeaders, payrollMetrics } from './payrollColumns';
import type { PayrollRow } from './payrollColumns';
import { monthLabel } from './payroll';

export function exportPayroll(month: string, rows: PayrollRow[]) {
  const totals = ['Tổng', '', ...payrollMetrics.map(metric => {
    let sum = 0;
    for (const row of rows) {
      const value = metric.get(row.pay);
      if (value === undefined) return '';
      sum += value;
    }
    return sum;
  })];
  return downloadPayroll('Bảng lương', 'Bang-luong', month, [...rows.map(row => payrollCells(row)), totals]);
}

export function exportPayslip(month: string, row: PayrollRow) {
  const [name, work, salary, allowances, gross, insurance, tax, deductions, net, employerInsurance, cost, status] =
    payrollCells(row);
  const sheet = utils.aoa_to_sheet([
    ['PHIẾU LƯƠNG NHÂN VIÊN'],
    ['Tháng ' + monthLabel(month)],
    [],
    ['STT', 'HỌ VÀ TÊN', 'CÔNG', 'THU NHẬP', '', '', 'CÁC KHOẢN TRỪ', '', '', 'THỰC LĨNH', 'CHI PHÍ CÔNG TY', '', 'TRẠNG THÁI'],
    ['', '', '', 'Lương theo công', 'Phụ cấp + thưởng', 'Tổng thu nhập', 'BH người LĐ', 'Thuế TNCN',
      'Tạm ứng + khấu trừ', '', 'BH + KPCĐ công ty', 'Tổng chi phí'],
    [1, name, work, salary, allowances, gross, insurance, tax, deductions, net, employerInsurance, cost, status],
    ['TỔNG', '', '', salary, allowances, gross, insurance, tax, deductions, net, employerInsurance, cost],
  ]);
  sheet['!merges'] = ['A1:M1', 'A2:C2', 'A4:A5', 'B4:B5', 'C4:C5', 'D4:F4', 'G4:I4', 'J4:J5',
    'K4:L4', 'M4:M5', 'A7:C7'].map(range => utils.decode_range(range));
  sheet['!cols'] = [6, 30, 12, 19, 22, 19, 17, 17, 25, 19, 23, 19, 16].map(wch => ({ wch }));
  sheet['!rows'] = [30, 22, 8, 23, 28, 23, 23].map(hpt => ({ hpt }));
  const book = utils.book_new();
  utils.book_append_sheet(book, sheet, 'Phiếu lương');
  const bytes: ArrayBuffer = write(book, { type: 'array', bookType: 'xlsx' });
  return saveExcel(stylePayslip(bytes), 'Phieu-luong-' + monthLabel(month).replace('/', '-') + '.xlsx', 'Lưu phiếu lương');
}

// SheetJS Community Edition writes worksheet structure but does not serialize custom cell styles.
function stylePayslip(bytes: ArrayBuffer): ArrayBuffer {
  const zip = CFB.read(new Uint8Array(bytes), { type: 'array' });
  const styleEntry = CFB.find(zip, '/xl/styles.xml');
  const sheetEntry = CFB.find(zip, '/xl/worksheets/sheet1.xml');
  // The edits only insert ASCII markup. Round-trip the existing UTF-8 bytes unchanged.
  const readXml = (content: Uint8Array) => Array.from(content, byte => String.fromCharCode(byte)).join('');
  const writeXml = (path: string, xml: string) =>
    CFB.utils.cfb_add(zip, path, Uint8Array.from(xml, char => char.charCodeAt(0)));

  const styles = readXml(styleEntry.content)
    .replace(/<fonts count="1">/, '<fonts count="3">')
    .replace('</fonts>', '<font><b/><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="18"/><name val="Calibri"/></font></fonts>')
    .replace(/<fills count="2">/, '<fills count="4">')
    .replace('</fills>', ['FFE599', 'FF9900'].map(color =>
      '<fill><patternFill patternType="solid"><fgColor rgb="FF' + color + '"/><bgColor indexed="64"/></patternFill></fill>').join('') + '</fills>')
    .replace(/<borders count="1">/, '<borders count="2">')
    .replace('</borders>', '<border>' + ['left', 'right', 'top', 'bottom'].map(side =>
      '<' + side + ' style="thin"><color rgb="FFB7A375"/></' + side + '>').join('') + '<diagonal/></border></borders>')
    .replace(/<cellXfs count="1">/, '<cellXfs count="7">')
    .replace('</cellXfs>', [
      [2, 0, 0, 0, 'center'], [1, 0, 0, 0, 'left'], [1, 2, 1, 0, 'center'],
      [0, 0, 1, 0, 'general'], [0, 0, 1, 3, 'right'], [1, 3, 1, 3, 'general'],
    ].map(([font, fill, border, number, align]) =>
      '<xf numFmtId="' + number + '" fontId="' + font + '" fillId="' + fill + '" borderId="' + border +
      '" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyNumberFormat="1" applyAlignment="1">' +
      '<alignment horizontal="' + align + '" vertical="center" wrapText="1"/></xf>').join('') + '</cellXfs>');
  const worksheet = readXml(sheetEntry.content).replace(/<row\b([^>]*\br="(\d+)"[^>]*)>(.*?)<\/row>/gs,
    (original, attributes: string, index: string, contents: string) => {
      if (index === '3') return original;
      const cells = new Map([...contents.matchAll(/<c\b[^>]*\br="([A-M])\d+"[^>]*(?:\/>|>.*?<\/c>)/gs)]
        .map(cell => [cell[1], cell[0]]));
      const styled = Array.from('ABCDEFGHIJKLM', column => {
        const style = index === '1' ? 1 : index === '2' ? 2 : index === '4' || index === '5' ? 3
          : index === '7' ? 6 : column >= 'D' && column <= 'L' ? 5 : 4;
        return cells.get(column)?.replace('<c ', '<c s="' + style + '" ') ??
          '<c r="' + column + index + '" s="' + style + '"/>';
      });
      return '<row' + attributes + '>' + styled.join('') + '</row>';
    });
  writeXml('/xl/styles.xml', styles);
  writeXml('/xl/worksheets/sheet1.xml', worksheet);
  return Uint8Array.from(CFB.write(zip, { type: 'array', fileType: 'zip', compression: true })).buffer;
}

function downloadPayroll(title: string, filePrefix: string, month: string, rows: (string | number)[][]) {
  const sheet = utils.aoa_to_sheet([payrollHeaders, ...rows]);
  sheet['!cols'] = payrollHeaders.map((header, index) => ({ wch: index === 0 ? 30 : Math.max(14, header.length + 3) }));
  const book = utils.book_new();
  utils.book_append_sheet(book, sheet, title + ' ' + month);
  const bytes: ArrayBuffer = write(book, { type: 'array', bookType: 'xlsx' });
  return saveExcel(bytes, filePrefix + '-' + month + '.xlsx', 'Lưu ' + title.toLowerCase());
}
