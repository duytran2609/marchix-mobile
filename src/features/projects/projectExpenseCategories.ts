const general = {
  'Dự án · Chuẩn bị': ['Khảo sát, tư vấn dự án', 'Thiết kế, lập phương án', 'Hồ sơ, giấy phép dự án'],
  'Dự án · Triển khai': ['Vật tư, hàng hóa dự án', 'Thiết bị dự án', 'Nhà thầu, dịch vụ dự án', 'Nhân sự dự án'],
  'Dự án · Bàn giao': ['Kiểm thử, nghiệm thu', 'Đào tạo, bàn giao', 'Vận chuyển, công tác dự án', 'Chi khác của dự án'],
};

const foodAndBeverage = {
  'F&B · Mặt bằng': ['F&B / Cọc mặt bằng', 'F&B / Thuê trả trước', 'F&B / Tiền thuê mặt bằng'],
  'F&B · Thiết kế & thi công': ['F&B / Khảo sát, thiết kế', 'F&B / Cải tạo, thi công', 'F&B / Điện, nước, thông gió', 'F&B / PCCC, an toàn', 'F&B / Biển hiệu, trang trí'],
  'F&B · Thiết bị & dụng cụ': ['F&B / Thiết bị bếp, quầy bar', 'F&B / Tủ lạnh, kho mát', 'F&B / Bàn ghế, nội thất', 'F&B / Ly, chén, dụng cụ', 'F&B / POS, camera, mạng'],
  'F&B · Nguyên liệu & hàng hóa': ['F&B / Bia, rượu, đồ uống', 'F&B / Thực phẩm, nguyên liệu', 'F&B / Bao bì, vật tư tiêu hao'],
  'F&B · Nhân sự': ['F&B / Tuyển dụng, đào tạo', 'F&B / Lương, phụ cấp'],
  'F&B · Mở quán & vận hành': ['F&B / Pháp lý, giấy phép', 'F&B / Khảo sát, bán thử', 'F&B / Marketing, khai trương', 'F&B / Điện nước, dịch vụ vận hành', 'F&B / Vệ sinh, bảo trì'],
  'F&B · Khác & dự phòng': ['F&B / Chi khác có giải trình', 'F&B / Dự phòng chưa chi'],
};

export function projectExpenseCategories(profile?: string, selected?: string): Record<string, string[]> {
  const groups = profile === 'fnb' ? foodAndBeverage : general;
  return selected && !Object.values(groups).flat().includes(selected)
    ? { ...groups, 'Hạng mục đã lưu': [selected] } : groups;
}
