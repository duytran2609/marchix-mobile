// Shared calculations from quanly.marchix.vn/project-finance.mjs.
export const MONEY_LIMIT = 1_000_000_000_000;
export const BUDGET_NATURES = ['Chi phí', 'Tài sản/thiết bị', 'Chi phí trả trước', 'Cọc có thể thu hồi', 'Hàng tồn kho', 'Tiền dự trữ chưa chi', 'Chưa phân loại'];
export const TAX_MODES = ['Chưa xác định', 'Đã gồm thuế GTGT', 'Chưa gồm thuế GTGT', 'Không có thuế GTGT'];
export function parseVndInput(value) {
  const raw = String(value ?? '').trim();
  if (!raw) return null;
  if (!/^(?:\d+|\d{1,3}(?:\.\d{3})+)$/.test(raw)) return NaN;
  const n = Number(raw.replaceAll('.', ''));
  return Number.isSafeInteger(n) && n >= 0 && n <= MONEY_LIMIT ? n : NaN;
}
export function parseVndEdit(raw, inputType) {
  const typed = ['insertText','insertCompositionText','insertFromComposition','insertReplacementText'].includes(inputType) || inputType?.startsWith('delete');
  return parseVndInput(typed && /^[\d.]+$/.test(raw) ? raw.replaceAll('.', '') : raw);
}
export const formatVndInput = value => value === null || value === undefined ? '' : new Intl.NumberFormat('vi-VN', {maximumFractionDigits:0}).format(value);
// Monetary totals are whole VND; tax rates accept two decimal places.
const divideRound = (n,d) => Number((BigInt(n)*2n+BigInt(d))/(2n*BigInt(d)));
export function lineAmounts(line) {
  const unknown = {quoted:null,net:null,vat:null,fees:line.fees,total:null};
  if (![line.quantity,line.unit].every(Number.isFinite)) return unknown;
  const quoted=Math.round(line.quantity*line.unit);
  if (!Number.isSafeInteger(quoted) || quoted<0) return unknown;
  const rate=line.vatRate;
  const auto=line.vatMethod === 'rate' || (line.vatMethod === undefined && rate != null);
  const rateOK=Number.isFinite(rate) && rate>=0 && rate<=100 && Math.abs(rate*100-Math.round(rate*100))<0.000001;
  let vat=null, net=quoted, total=null;
  if (line.taxMode === 'Không có thuế GTGT') vat=0;
  else if (line.taxMode === 'Chưa gồm thuế GTGT') {
    vat=auto ? (rateOK ? divideRound(BigInt(quoted)*BigInt(Math.round(rate*100)),10000n) : null) : line.vat ?? null;
  } else if (line.taxMode === 'Đã gồm thuế GTGT') {
    // Included VAT never increases the quoted total. Unknown rate means no reliable VAT split.
    vat=auto ? (rateOK ? divideRound(BigInt(quoted)*BigInt(Math.round(rate*100)),BigInt(10000+Math.round(rate*100))) : null) : line.vatMethod === 'manual' ? line.vat ?? null : null;
    net=vat === null ? null : quoted-vat;
  } else return {...unknown,quoted};
  if (Number.isSafeInteger(line.fees)) {
    if (line.taxMode === 'Đã gồm thuế GTGT') total=quoted+line.fees;
    else if (Number.isSafeInteger(vat)) total=quoted+vat+line.fees;
  }
  return {quoted,net,vat,fees:line.fees,total};
}
export const lineTotal = line => lineAmounts(line).total;
export function allocationPlan(line) {
  if (line.nature === 'Cọc có thể thu hồi' || line.nature === 'Tiền dự trữ chưa chi')
    return {monthly:0,total:null,months:null};
  if (!['Chi phí','Chi phí trả trước'].includes(line.nature)) return {monthly:null,total:null,months:null};
  const {net,fees}=lineAmounts(line),months=line.allocationMonths ?? (line.unitLabel?.trim().toLowerCase() === 'tháng' && Number.isInteger(line.quantity) ? line.quantity : null);
  if (net === null || !Number.isSafeInteger(fees) || !Number.isInteger(months) || months<1)
    return {monthly:null,total:null,months:months ?? null};
  const total=net+fees;
  return {monthly:Math.round(total/months),total,months};
}
export function budgetApprovalIssues(lines) {
  return lines.flatMap((l,i)=>{
    const missing=[];
    if(!l.code) missing.push('mã khoản');if(!l.unitLabel) missing.push('đơn vị');
    if(!l.nature || l.nature === 'Chưa phân loại') missing.push('loại khoản');
    if(l.quantity == null) missing.push('số lượng');if(l.unit == null) missing.push('đơn giá');if(l.fees == null) missing.push('phí khác (nhập 0 nếu không có)');
    if(!l.taxMode || l.taxMode === 'Chưa xác định') missing.push('cách tính thuế');
    else if(lineTotal(l) === null) missing.push('số tiền / VAT hợp lệ');
    // Quotes and planned payment dates are optional supporting information.
    return missing.length ? [{index:i,code:l.code || 'Dòng '+(i+1),missing}]:[];
  });
}
export function validateBudgetApproval(lines) {
  const issues=budgetApprovalIssues(lines);
  if(!lines.length) throw Error('Chưa thể chốt dự toán: chưa có khoản dự toán.');
  if(issues.length) throw Error('Chưa thể chốt dự toán:\n'+issues.slice(0,8).map(i=>i.code+': thiếu '+i.missing.join(', ')).join('\n')+(issues.length>8 ? '\nCòn '+(issues.length-8)+' khoản cần bổ sung.':''));
}
const moneyOK = n => Number.isSafeInteger(n) && n >= 0 && n <= MONEY_LIMIT;
const ceilDiv = (numerator, denominator) => (numerator + denominator - 1n) / denominator;
const displayNumber = n => n >= BigInt(Number.MIN_SAFE_INTEGER) && n <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(n) : n;

export function sameBudgetLines(left, right) {
  const keys = ["name", "category", "quantity", "unit", "fees", "quote", "code", "unitLabel", "nature", "taxMode", "vat", "quoteDate", "payDate", "confidence", "vatMethod", "vatRate", "allocationMonths", "refundDue", "reviewUnit", "reviewDate", "reviewSource", "reviewBasis", "remainingEstimate"];
  return left.length === right.length && left.every((line, index) =>
    keys.every(key => line[key] === right[index][key]));
}

export function budgetTotal(lines) {
  const totals = lines.map(lineTotal);
  return totals.some(n => n === null) ? null : totals.reduce((a,b) => a+b,0);
}

export function validateFinance(plan) {
  const optionalMoney = n => n === null || moneyOK(n);
  const validDate = s => { const d = new Date(s + 'T00:00:00Z'); return /^\d{4}-\d{2}-\d{2}$/.test(s) && Number.isFinite(+d) && d.toISOString().slice(0,10) === s; };
  if (plan.lines.length > 30 || plan.lines.some(l => !l.name || l.name.length > 120 || !l.category || l.category.length > 120
      || typeof l.quote !== 'string' || l.quote.length > 240 || (l.quantity !== null && (!Number.isFinite(l.quantity) || l.quantity <= 0 || l.quantity > 100000 || Math.abs(l.quantity*1000-Math.round(l.quantity*1000))>0.000001))
      || !optionalMoney(l.unit) || !optionalMoney(l.fees) || (l.vat !== undefined && !optionalMoney(l.vat))
      || (lineTotal(l) !== null && !moneyOK(lineTotal(l)))
      || (l.taxMode === 'Đã gồm thuế GTGT' && lineAmounts(l).net !== null && lineAmounts(l).net<0)
      || ['code','unitLabel','confidence'].some(k => l[k] !== undefined && (typeof l[k] !== 'string' || l[k].length > 80))
      || (l.nature !== undefined && !BUDGET_NATURES.includes(l.nature)) || (l.taxMode !== undefined && !TAX_MODES.includes(l.taxMode))
      || (l.vatMethod !== undefined && !['rate','manual'].includes(l.vatMethod))
      || (l.vatRate != null && (!Number.isFinite(l.vatRate) || l.vatRate<0 || l.vatRate>100 || Math.abs(l.vatRate*100-Math.round(l.vatRate*100))>0.000001))
      || (l.allocationMonths != null && (!Number.isInteger(l.allocationMonths) || l.allocationMonths<1 || l.allocationMonths>120))
      || ['reviewUnit','remainingEstimate'].some(k=>l[k] !== undefined && !optionalMoney(l[k]))
      || (l.reviewBasis !== undefined && !['Báo giá cập nhật','Hóa đơn thực tế'].includes(l.reviewBasis))
      || (l.reviewSource !== undefined && (typeof l.reviewSource !== 'string' || l.reviewSource.length>240))
      || ['quoteDate','payDate','reviewDate','refundDue'].some(k => l[k] && !validDate(l[k])))) throw Error('Kiểm tra các dòng dự toán: số lượng dương (tối đa 3 số lẻ), tiền VND nguyên không âm, mã và căn cứ hợp lệ.');
  const codes=plan.lines.map(l=>(l.code || '').trim().toUpperCase()).filter(Boolean);
  if (new Set(codes).size !== codes.length) throw Error('Mã khoản dự toán phải duy nhất để đối chiếu chứng từ chính xác.');
  const total = budgetTotal(plan.lines);
  if (total !== null && !moneyOK(total)) throw Error('Tổng dự toán vượt giới hạn cho phép.');
  if (![plan.opening, plan.reserve, plan.price, plan.variable, plan.fixed].every(optionalMoney)
      || (plan.days !== null && (!Number.isInteger(plan.days) || plan.days < 1 || plan.days > 31))
      || (plan.guests !== null && (!Number.isInteger(plan.guests) || plan.guests < 0 || plan.guests > 100000)))
    throw Error('Kiểm tra số tiền, số ngày bán (1–31) và lượng khách/ngày. Tiền nhập như 1.000.000, không nhập số âm hoặc số lẻ đồng.');
  if ((plan.start !== '' && !validDate(plan.start)) || plan.weeks.length !== 13 || plan.weeks.some(w => ![w.in,w.out].every(optionalMoney)))
    throw Error('Kiểm tra ngày bắt đầu và số tiền thu chi của 13 tuần.');
}

export function breakEven({ price, variable, fixed, days, guests }) {
  if (![price,variable,fixed,days,guests].every(Number.isFinite))
    return {margin:null,monthlyGuests:null,dailyGuests:null,revenue:null,result:null};
  const margin = price - variable;
  const monthlyGuests = margin > 0 ? Number(ceilDiv(BigInt(fixed), BigInt(margin))) : null;
  return {
    margin, monthlyGuests,
    dailyGuests: monthlyGuests === null ? null : Math.ceil(monthlyGuests / days),
    revenue: margin > 0 ? displayNumber(ceilDiv(BigInt(fixed) * BigInt(price), BigInt(margin))) : null,
    result: displayNumber(BigInt(guests) * BigInt(days) * BigInt(margin) - BigInt(fixed))
  };
}

export function forecast(plan) {
  let balance = plan.opening;
  const first = new Date(plan.start + "T00:00:00Z").getTime();
  return plan.weeks.map((week, i) => {
    const opening = balance;
    balance = opening === null || week.in === null || week.out === null ? null : opening + week.in - week.out;
    return { ...week, opening, balance, belowReserve: balance !== null && plan.reserve !== null && balance < plan.reserve,
      start: Number.isFinite(first) ? new Date(first + i * 7 * 86400000).toISOString().slice(0, 10) : "" };
  });
}

export function reconcileBudget(lines, cash) {
  const categories = new Map();
  const row = category => {
    if (!categories.has(category)) categories.set(category, { category, planned: 0, paid: 0, committed: 0, pending: 0 });
    return categories.get(category);
  };
  for (const line of lines) { const r = row(line.category), total = lineTotal(line); r.planned = r.planned === null || total === null ? null : r.planned + total; }
  for (const item of cash) {
    if (!["paid", "committed", "pending"].includes(item.bucket)) continue;
    row(item.category || "Chưa phân loại")[item.bucket] += item.amount;
  }
  return [...categories.values()].map(r => ({ ...r, remaining: r.planned === null ? null : r.planned - r.paid - r.committed }));
}

export function newFinancePlan(start) {
  return { lines: [], opening: null, reserve: null, price: null, variable: null, fixed: null, days: null, guests: null, start: start || "",
    weeks: Array.from({ length: 13 }, () => ({ in: null, out: null })) };
}

export function demoFinancePlan(start) {
  const lines = [
    ["Cọc mặt bằng", "Thuê văn phòng / mặt bằng", 12],
    ["Sửa nhẹ, điện nước, thông gió", "Sửa chữa, bảo trì", 11],
    ["Thiết bị bếp và lạnh", "Chi khác", 16],
    ["Bàn ghế, dụng cụ, thiết lập bán hàng", "Văn phòng phẩm, vật tư", 6],
    ["Tồn kho mở quán", "Mua hàng, nguyên vật liệu", 6],
    ["Chuẩn bị và chạy thử", "Thuê ngoài, nhà thầu phụ", 9]
  ].map(([name, category, millions]) => ({ name, category, quantity: 1, unit: millions * 1e6, fees: 0, quote: "Giả định" }));
  return { ...newFinancePlan(start), days:26, lines:lines.map((l,i)=>({...l,code:'MH'+(i+1),unitLabel:'gói',nature:BUDGET_NATURES[i === 0 ? 3 : i === 4 ? 4 : 0],taxMode:'Đã gồm thuế GTGT',vat:0,quoteDate:start,payDate:start,confidence:'Ước tính — chưa duyệt'})), opening: 40e6, reserve: 10e6, price: 150000, variable: 60000,
    fixed: 30e6, guests: 13, weeks: Array.from({ length: 13 }, (_, i) => {
      const days = 6 + i % 2;
      return { in: days * 13 * 150000, out: 7500000 + days * 13 * 60000 };
    }) };
}


export function fnbBudgetTemplate() {
  const rows = [
    ['Khảo sát và bán thử','F&B / Khảo sát, bán thử','Chi phí'], ['Cọc thuê','F&B / Cọc mặt bằng','Cọc có thể thu hồi'],
    ['Thuê trả trước','F&B / Thuê trả trước','Chi phí trả trước'], ['Thuê giai đoạn chuẩn bị','F&B / Tiền thuê mặt bằng','Chi phí'],
    ['Pháp lý và chuyên môn','F&B / Pháp lý, giấy phép','Chi phí'], ['Sửa chữa','F&B / Cải tạo, thi công','Chưa phân loại'],
    ['Điện nước và lắp đặt','F&B / Điện, nước, thông gió','Chưa phân loại'], ['Thông gió','F&B / Điện, nước, thông gió','Tài sản/thiết bị'],
    ['An toàn cháy','F&B / PCCC, an toàn','Chưa phân loại'], ['Bàn ghế','F&B / Bàn ghế, nội thất','Tài sản/thiết bị'],
    ['Ánh sáng','F&B / Biển hiệu, trang trí','Tài sản/thiết bị'], ['Biển hiệu','F&B / Biển hiệu, trang trí','Chưa phân loại'],
    ['Tủ lạnh và thiết bị chế biến','F&B / Thiết bị bếp, quầy bar','Tài sản/thiết bị'], ['POS, camera và mạng','F&B / POS, camera, mạng','Chưa phân loại'],
    ['Dụng cụ','F&B / Ly, chén, dụng cụ','Chưa phân loại'], ['Hàng hóa đầu kỳ','F&B / Thực phẩm, nguyên liệu','Hàng tồn kho'],
    ['Tuyển dụng và lương trước mở','F&B / Lương, phụ cấp','Chi phí'], ['Đào tạo','F&B / Tuyển dụng, đào tạo','Chi phí'],
    ['Marketing trước mở','F&B / Marketing, khai trương','Chi phí'], ['Mở thử và khai trương','F&B / Marketing, khai trương','Chi phí'],
    ['Dự phòng phát sinh','F&B / Dự phòng chưa chi','Tiền dự trữ chưa chi'], ['Vốn lưu động dự trữ','F&B / Dự phòng chưa chi','Tiền dự trữ chưa chi']
  ];
  return rows.map(([name,category,nature],i)=>({code:'NS'+String(i+1).padStart(2,'0'),name,category,nature,
    quantity:null,unitLabel:'',unit:null,fees:null,vat:null,vatMethod:'rate',vatRate:null,taxMode:'Chưa xác định',quote:'',quoteDate:'',payDate:'',confidence:'Ước tính — chưa duyệt'}));
}

// Inputs here are server-loaded, normalized ledger entries; pending requests are never treated as paid.
export function projectBudgetControl(lines, baseline, transactions, cap, today='') {
  const approved=Array.isArray(baseline), budget=approved ? baseline : lines;
  const code=l=>String(l.code || '').trim().toUpperCase();
  const planMap=new Map(lines.filter(code).map(l=>[code(l),l]));
  const baseMap=new Map(budget.filter(code).map(l=>[code(l),l]));
  const codes=[...new Set([...baseMap.keys(),...planMap.keys()])];
  const unmatched=transactions.filter(t=>!codes.includes(code(t)));
  const sum=(ts,bucket)=>ts.filter(t=>t.bucket===bucket).reduce((n,t)=>n+t.amount,0);
  const rows=codes.map(key=>{
    const base=baseMap.get(key),current=planMap.get(key) || base;
    const entries=transactions.filter(t=>code(t)===key);
    const paid=sum(entries,'paid'),waiting=sum(entries,'committed'),pending=sum(entries,'pending'),returned=sum(entries,'refund');
    const netPaid=paid-returned, used=netPaid+waiting;
    const planned=base ? lineTotal(base) : 0;
    const review=current.reviewUnit == null ? null : lineTotal({...current,unit:current.reviewUnit});
    const comparable=base && base.taxMode === current.taxMode && (base.unitLabel || '') === (current.unitLabel || '');
    const unitDelta=comparable && current.reviewUnit != null && base.unit != null ? current.reviewUnit-base.unit : null;
    const unitPercent=unitDelta === null || base.unit===0 ? null : unitDelta/base.unit*100;
    const remaining=current.remainingEstimate;
    const forecast=Number.isSafeInteger(remaining) ? used+remaining
      : review !== null ? Math.max(used,review)
      : current.nature === 'Tiền dự trữ chưa chi' ? lineTotal(current) : null;
    const variance=planned === null || forecast === null ? null : forecast-planned;
    const flags=[];
    if (!base && (paid || waiting || pending || review !== null)) flags.push('Ngoài dự toán gốc');
    if (planned !== null && used>planned) flags.push('Đã chi + chờ chi vượt dự toán');
    else if (planned>0 && used>=planned*0.8) flags.push('Đã sử dụng từ 80% dự toán');
    if (variance>0) flags.push('Dự báo vượt dự toán');
    if (unitDelta>0) flags.push('Đơn giá rà soát tăng');
    if (base && current.reviewUnit != null && !comparable) flags.push('ĐVT/cách tính thuế thay đổi — không so trực tiếp đơn giá');
    if (Number.isSafeInteger(remaining) && review !== null && review>used+remaining) flags.push('Chi còn lại thấp hơn báo giá mới — kiểm tra phạm vi');
    if (current.reviewUnit != null && (!current.reviewDate || !current.reviewSource)) flags.push('Giá rà soát thiếu căn cứ/ngày');
    if (netPaid<0) flags.push('Tiền hoàn vượt tiền đã chi — cần đối soát');
    const deposit=current.nature === 'Cọc có thể thu hồi' ? netPaid : 0;
    if (deposit>0 && current.refundDue && today && current.refundDue<today) flags.push('Cọc quá hạn chưa thu hồi đủ');
    if (current.nature === 'Chi phí trả trước' && !current.allocationMonths) flags.push('Chưa có kỳ phân bổ trả trước');
    if (planned === null) flags.push('Dự toán chưa đủ giá/thuế');
    if (forecast === null) flags.push('Chưa đủ dự báo hoàn thành');
    return {code:key,name:current.name,nature:current.nature,planned,budgetUnit:base?.unit ?? null,reviewUnit:current.reviewUnit ?? null,
      unitDelta,unitPercent,reviewBasis:current.reviewBasis || 'Báo giá cập nhật',paid,returned,netPaid,waiting,pending,remaining:remaining ?? null,review,forecast,variance,deposit,flags,allocation:allocationPlan(current)};
  });
  const paid=sum(transactions,'paid'),returned=sum(transactions,'refund'),waiting=sum(transactions,'committed'),pending=sum(transactions,'pending');
  const used=paid-returned+waiting;
  const plannedTotal=budget.length ? budgetTotal(budget) : null;
  const draftTotal=lines.length ? budgetTotal(lines) : null;
  const knownDraftTotal=lines.reduce((n,l)=>n+(lineTotal(l) ?? 0),0);
  const minimumForecast=rows.reduce((n,r)=>n+(r.forecast ?? (r.netPaid+r.waiting)),0)
    +sum(unmatched,'paid')-sum(unmatched,'refund')+sum(unmatched,'committed');
  const forecastTotal=rows.length && rows.every(r=>r.forecast !== null) && !unmatched.length
    && budget.every(code) && lines.every(code) ? rows.reduce((a,r)=>a+r.forecast,0) : null;
  const alerts=[];
  if (!approved) alerts.push({level:'warn',text:'Chưa có dự toán được duyệt; chênh lệch đang so với bản nháp.'});
  if (plannedTotal === null) alerts.push({level:'warn',text:'Chưa đủ dự toán; chưa thể kết luận dự án nằm trong ngân sách.'});
  if (unmatched.length || budget.some(l=>!code(l))) alerts.push({level:'warn',text:'Có chứng từ hoặc dòng cũ chưa khớp mã khoản; cần đối soát riêng.'});
  if (Number.isFinite(cap) && cap>0) {
    if (used>cap) alerts.push({level:'bad',text:'Đã chi thuần + đã duyệt chờ chi vượt trần vốn dự án.'});
    else if (used>=cap*0.8) alerts.push({level:'warn',text:'Đã sử dụng từ 80% trần vốn dự án.'});
    if (draftTotal !== null && draftTotal>cap) alerts.push({level:'bad',text:'Tổng dự toán đang lập vượt trần vốn dự án.'});
    if (draftTotal === null && knownDraftTotal>cap) alerts.push({level:'bad',text:'Chỉ các khoản đã có giá cũng đã vượt trần vốn, dù dự toán còn thiếu.'});
    if (forecastTotal === null && minimumForecast>cap) alerts.push({level:'bad',text:'Phần dự báo đã xác định đã vượt trần vốn, dù còn khoản chưa đủ dữ liệu.'});
    if (forecastTotal !== null && forecastTotal>cap) alerts.push({level:'bad',text:'Dự báo chi thuần cuối dự án vượt trần vốn.'});
    if (used+pending>cap && pending>0) alerts.push({level:'warn',text:'Nếu duyệt thêm các đề nghị đang chờ, tổng sử dụng sẽ vượt trần vốn.'});
  }
  if (rows.some(r=>r.variance>0 || r.planned !== null && r.netPaid+r.waiting>r.planned)) alerts.push({level:'bad',text:'Có khoản vượt dự toán; mở bảng rà soát để xem chênh lệch.'});
  if (rows.some(r=>r.flags.includes('Cọc quá hạn chưa thu hồi đủ'))) alerts.push({level:'bad',text:'Có tiền cọc quá hạn chưa thu hồi đủ.'});
  if(rows.some(r=>r.unitDelta>0)) alerts.push({level:'warn',text:'Có đơn giá rà soát cao hơn đơn giá dự toán.'});
  if(rows.some(r=>r.flags.includes('Chi còn lại thấp hơn báo giá mới — kiểm tra phạm vi'))) alerts.push({level:'warn',text:'Có dự báo chi còn lại thấp hơn báo giá mới; cần xác nhận lại phạm vi.'});
  if (forecastTotal === null) alerts.push({level:'warn',text:'Chưa đủ dự báo chi phí còn lại; chưa thể kết luận tổng chi cuối dự án.'});
  return {approved,rows,unmatched,paid,returned,waiting,pending,used,plannedTotal,draftTotal,knownDraftTotal,minimumForecast,forecastTotal,alerts,
    remainingCap:cap>0 ? cap-used : null,depositOutstanding:rows.reduce((a,r)=>a+r.deposit,0)};
}

export function monthlyRentLine(code) {
  return {code,name:'Thuê vận hành — phần chưa trả trước',category:'Thuê văn phòng / mặt bằng',nature:'Chi phí',
    quantity:null,unitLabel:'tháng',unit:null,fees:null,vat:null,vatMethod:'rate',vatRate:null,taxMode:'Chưa xác định',
    quote:'',quoteDate:'',payDate:'',confidence:'Ước tính — chưa duyệt'};
}

export function guidedRentLines({monthly,months,payment,taxMode,rate,deposit},sequence=1) {
  if (!Number.isSafeInteger(monthly) || monthly<=0 || monthly>MONEY_LIMIT || !Number.isInteger(months) || months<1 || months>120
      || !['monthly','prepaid'].includes(payment) || !TAX_MODES.includes(taxMode)
      || (rate !== null && (!Number.isFinite(rate) || rate<0 || rate>100 || Math.abs(rate*100-Math.round(rate*100))>0.000001))
      || (deposit !== null && (!Number.isSafeInteger(deposit) || deposit<0 || deposit>MONEY_LIMIT)))
    throw Error('Kiểm tra tiền thuê, số tháng (1–120), thuế suất và tiền cọc.');
  const suffix=String(sequence).padStart(2,'0');
  const rent={...monthlyRentLine('THUE-'+suffix),name:payment === 'prepaid' ? 'Thuê trả trước '+months+' tháng':'Thuê theo tháng — '+months+' tháng',
    nature:payment === 'prepaid' ? 'Chi phí trả trước':'Chi phí',quantity:months,unit:monthly,unitLabel:'tháng',fees:0,
    taxMode,vatRate:rate,allocationMonths:months,quote:'',quoteDate:'',payDate:''};
  if(monthly*months>MONEY_LIMIT) throw Error('Tiền thuê cả kỳ vượt giới hạn số tiền.');
  const result=[rent];
  if(deposit>0) result.push({...monthlyRentLine('COC-'+suffix),name:'Cọc thuê có thể thu hồi',nature:'Cọc có thể thu hồi',quantity:1,unitLabel:'khoản',unit:deposit,fees:0,taxMode:'Chưa xác định',vatRate:null});
  return result;
}

// Save one line against the persisted plan; unrelated form edits are never included.
export function upsertBudgetLine(plan, originalCode, line) {
  if(!/^[A-Z0-9][A-Z0-9._-]{0,79}$/.test(line.code || '')) throw Error('Nhập mã khoản bằng chữ không dấu, số, dấu chấm hoặc gạch ngang, ví dụ NS01.');
  const lines=plan.lines.slice();
  if(originalCode === null) lines.push({...line});
  else {
    const matches=lines.map((l,i)=>(l.code || '') === originalCode ? i:-1).filter(i=>i>=0);
    if(matches.length !== 1) throw Error('Không xác định được khoản gốc. Ghi lại tất cả hoặc mở lại để kiểm tra mã khoản.');
    lines[matches[0]]={...line};
  }
  const next={...plan,lines};validateFinance(next);return next;
}
